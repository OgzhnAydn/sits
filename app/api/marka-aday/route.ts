import { NextRequest, NextResponse } from "next/server";
import { domainOsint, domainDurumu, type DomainDurum } from "@/lib/osint";
import { kampanyaCozumle } from "@/lib/kampanya";
import { itibarliMi } from "@/lib/itibarli";
import { resmiMarkaDomaini, KORUNAN_MARKALAR } from "@/lib/korunanMarkalar";
import { markaAdayKaydet, markaGunlukArtir, type MarkaAday } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

// CertStream worker'dan gelen ADAY domaini analiz eder ve (yüksek skorluysa)
// inceleme kuyruğuna yazar. Guardrail: aday ≠ kesin sahte; sadece SIRALI aday üretir.
// Yetki: MARKA_ADAY_SECRET (worker aynı sırrı gönderir). Sunucuda sır yoksa reddet.
function seviye(s: number) {
  return s >= 60 ? "Yüksek" : s >= 30 ? "Orta" : "Düşük";
}

export async function POST(req: NextRequest) {
  const sir = process.env.MARKA_ADAY_SECRET;
  if (!sir) return NextResponse.json({ hata: "Servis kapalı (secret tanımlı değil)." }, { status: 503 });

  let body: { domain?: string; marka?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }
  if (body.secret !== sir) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });

  const domain = String(body.domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ hata: "Geçersiz domain." }, { status: 400 });
  }

  // Resmî/itibarlı domaini aday sayma (gerçek markanın kendisi).
  if (resmiMarkaDomaini(domain) || itibarliMi(domain)) {
    return NextResponse.json({ ok: true, kaydedildi: false, sebep: "resmi/itibarlı domain" });
  }

  const markaAnahtar = String(body.marka || "").toLowerCase();
  const marka = KORUNAN_MARKALAR.find((m) => m.anahtar === markaAnahtar);

  // Gerçek analiz — motoru bu adaya uygula (typosquatting + yaş + tehdit + CT…).
  let skor = 0;
  let sinyaller: string[] = [];
  let durum: DomainDurum = "canli";
  try {
    const rapor = await domainOsint(domain);
    skor = Math.min(100, rapor.risk);
    sinyaller = rapor.bulgular.slice(0, 6);
    durum = domainDurumu(rapor).durum; // aktif-tuzak / park / yayında-değil / canlı
  } catch {
    return NextResponse.json({ ok: true, kaydedildi: false, sebep: "analiz başarısız" });
  }

  const tarih = new Date().toISOString().slice(0, 10);

  // Güven eşiği: düşük skorlu (muhtemelen alakasız) adayları KAYDETME — gürültü olmasın.
  // Ama günlük "eşleşme" sayacına yaz (rapor "şu kadar domaini analiz ettik" desin).
  if (skor < 25) {
    await markaGunlukArtir(markaAnahtar, tarih, false);
    return NextResponse.json({ ok: true, kaydedildi: false, sebep: `düşük skor (${skor})` });
  }

  await markaGunlukArtir(markaAnahtar, tarih, true);
  const aday: MarkaAday = {
    domain,
    marka: markaAnahtar,
    markaAdi: marka?.ad || markaAnahtar,
    skor,
    seviye: seviye(skor),
    sinyaller: sinyaller.length ? sinyaller : ["Marka adını içeren, resmî olmayan yeni domain."],
    kaynak: "certstream",
    durum, // AKTİF tuzak mı yoksa PARK/izleme adayı mı — ayrı takip için
    zaman: Date.now(),
  };
  await markaAdayKaydet(aday); // önce yakalamayı kuyruğa yaz (kampanya çözümleme uzun sürebilir)

  // KAMPANYA ÇÖZÜMLEME (otomatik): yüksek-güvenli AKTİF yakalamalarda tüm operasyonu haritala
  // (kardeş domainler + ortak IP/ASN + favicon-kit + iletişim kanalları) ve kuyruğa iliştir.
  let kampanya: MarkaAday["kampanya"] | undefined;
  if (durum === "aktif-tuzak" && skor >= 60) {
    try {
      const k = (await Promise.race([kampanyaCozumle(domain), new Promise<null>((r) => setTimeout(() => r(null), 22000))])) as Awaited<ReturnType<typeof kampanyaCozumle>> | null;
      if (k && k.domainler.length > 1) {
        kampanya = {
          domainSayisi: k.domainler.length,
          ipler: (k.ipler || []).slice(0, 3),
          asnler: (k.asnler || []).slice(0, 3),
          iletisimKanallari: (k.iletisimKanallari || []).slice(0, 3),
          exfilVar: (k.exfil || []).length > 0,
          ozet: k.ozet || "",
        };
        await markaAdayKaydet({ ...aday, kampanya }); // merge: operasyon haritasını iliştir
      }
    } catch {
      /* kampanya çözümleme başarısız — yakalama zaten kuyrukta */
    }
  }

  return NextResponse.json({ ok: true, kaydedildi: true, skor, durum, kampanya: kampanya ? { domainSayisi: kampanya.domainSayisi } : undefined });
}
