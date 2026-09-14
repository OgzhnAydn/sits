import { NextRequest, NextResponse } from "next/server";
import { hizliDomainSkor, type DomainDurum } from "@/lib/osint";
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

  // HIZLI ANALİZ — worker ADAY AKIŞI firehose ölçeğinde (saniyede yüzlerce). Tam domainOsint
  // 40-60s süren sıralı derin analizdir → her POST 504 yapardı (aday hiç kaydolmaz). Bunun yerine
  // en güçlü 3 sinyali paralel toplarız (~6s): yaş + canlılık + kara liste. Derin pivot (favicon/
  // redirect/CT/kampanya) mercek'te adaya tıklanınca tam domainOsint ile yapılır. Aday KAÇMAZ.
  let skor = 0;
  let sinyaller: string[] = [];
  let durum: DomainDurum = "canli";
  try {
    const h = await hizliDomainSkor(domain);
    skor = h.skor;
    sinyaller = h.sinyaller.slice(0, 6);
    durum = h.durum;
  } catch {
    return NextResponse.json({ ok: true, kaydedildi: false, sebep: "analiz başarısız" });
  }
  // MARKA-TAKLİT TABANI: worker guardrail'inden geçmiş (marka adını RESMÎ-OLMAYAN bağlamda, kelime
  // sınırında içeren) domain zaten güçlü aday. RDAP'siz TLD (.ph) / USOM'suz yabancı hedefte yaş ve
  // kara-liste sinyali gelmese de skor 0 kalmamalı → yoksa gerçek taklit KAÇAR. Taban 25 = kaydedilir
  // ama mercek'te "Düşük" öncelik; YÜKSEK-alarm (60+) yalnız yaş/USOM ile → FP operatörce elenir.
  if (marka && skor < 25) {
    skor = 25;
    if (!sinyaller.some((s) => s.includes("Marka adını"))) sinyaller.unshift("Marka adını içeren, resmî olmayan domain — worker taklit filtresinden geçti.");
  }

  const tarih = new Date().toISOString().slice(0, 10);

  // Firestore yazması kota-dolu/hang'de endpoint'i 504'e sürüklemesin: 8s guard. Guard'a takılırsa
  // yazma başarısız sayılır (worker dedup'ı geri alıp yeniden dener) ama endpoint hızlı döner.
  const yaz = <T,>(p: Promise<T>, ms = 8000): Promise<T | "ZAMANASIMI"> =>
    Promise.race([p, new Promise<"ZAMANASIMI">((r) => setTimeout(() => r("ZAMANASIMI"), ms))]);

  // Güven eşiği: düşük skorlu adayı KAYDETME. KOTA KORUMASI: firehose'da binlerce düşük-skorlu
  // domain (yabancı/alakasız) yalnız "günlük analiz sayacı" için yazma yapıyordu → Firestore
  // free-tier ~20k yazma/gün limitini bu tüketiyor. Düşük-skorluda HİÇ yazma yapma (sayaç dahil):
  // istatistik kaybı, kotanın korunmasından çok daha ucuz. Gerçek aday (skor≥25) sayılmaya devam.
  if (skor < 25) {
    return NextResponse.json({ ok: true, kaydedildi: false, sebep: `düşük skor (${skor})` });
  }

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
  // İki yazma PARALEL (seri değil): kota-dolu/hang'de her biri 8s guard'a takılırsa seri 16s olurdu;
  // paralel tek 8s. Günlük sayaç + aday kaydı birbirinden bağımsız.
  const [yg, yk] = await Promise.all([
    yaz(markaGunlukArtir(markaAnahtar, tarih, true)),
    yaz(markaAdayKaydet(aday)),
  ]);

  // NOT: Kampanya çözümleme + tam OSINT burada YAPILMAZ (firehose ölçeğinde 504). Operatör mercek'te
  // adaya tıklayınca derin analiz o an çalışır. Aday kaydedildi → hiçbir şey kaçmaz.
  // yazDurum: kota-nabzı — worker/izleme "ok" görürse Firestore yazması sağlıklı, "zamanasimi" ise kota dolu.
  const zamanAsimi = yg === "ZAMANASIMI" || yk === "ZAMANASIMI";
  return NextResponse.json({ ok: true, kaydedildi: !zamanAsimi, skor, durum, yazDurum: zamanAsimi ? "zamanasimi" : "ok" });
}
