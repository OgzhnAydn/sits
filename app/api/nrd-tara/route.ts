import { NextRequest, NextResponse } from "next/server";
import { unzipSync } from "fflate";
import { AVCI_MARKALAR, gercekTaklit, resmiMarkaDomaini } from "@/lib/korunanMarkalar";
import { itibarliMi } from "@/lib/itibarli";
import { markaAdayKaydet, markaGunlukArtir } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// YENİ KAYITLI DOMAIN (NRD) TARAMASI — CT'nin kaçırdığı "sertifikasız / park" taklit domainleri,
// KAYDEDİLDİKLERİ gün yakalar (cert öncesi, daha erken). Ücretsiz whoisds günlük NRD listesi
// (~70k/gün). Günlük cron. TAM kapsam (gTLD milyonlar) için sonraki aşama: ICANN CZDS zone dosyaları.
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const seviye = (s: number) => (s >= 60 ? "Yüksek" : s >= 30 ? "Orta" : "Düşük");

export async function GET(req: NextRequest) {
  const sir = process.env.CRON_SECRET;
  const verilen = (req.headers.get("authorization") || "").replace(/^Bearer /, "") || new URL(req.url).searchParams.get("secret") || "";
  if (sir && verilen !== sir) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });

  const gun = new URL(req.url).searchParams.get("gun") || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const url = `https://www.whoisds.com/whois-database/newly-registered-domains/${b64(gun + ".zip")}/nrd`;

  let domains: string[] = [];
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) return NextResponse.json({ hata: `NRD indirilemedi (${r.status})`, gun }, { status: 502 });
    const buf = new Uint8Array(await r.arrayBuffer());
    const files = unzipSync(buf);
    const key = Object.keys(files).find((k) => k.toLowerCase().endsWith(".txt")) || Object.keys(files)[0];
    if (!key) return NextResponse.json({ hata: "NRD arşivi boş.", gun }, { status: 502 });
    domains = new TextDecoder().decode(files[key]).split(/\r?\n/)
      .map((s) => s.trim().toLowerCase().replace(/\.$/, ""))
      .filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s));
  } catch (e) {
    return NextResponse.json({ hata: "NRD alınamadı/açılamadı.", detay: String((e as Error)?.message || e), gun }, { status: 502 });
  }

  // Marka kalıpları (anahtar + açılımlar, ≥4 harf — kısa gürültü olmasın).
  const markalar = AVCI_MARKALAR.map((m) => ({ anahtar: m.anahtar, ad: m.ad, kaliplari: [m.anahtar, ...(m.kaliplari || [])].filter((k) => k && k.length >= 4) }));
  const tarih = new Date().toISOString().slice(0, 10);
  const bitis = Date.now() + 270_000; // 300s limitinden önce güvenle dur
  let aday = 0, kesildi = false;
  const bulunan: { domain: string; marka: string }[] = [];

  for (const dom of domains) {
    for (const m of markalar) {
      if (!m.kaliplari.some((k) => dom.includes(k))) continue;
      // İSİM taşıyor → GERÇEK taklit mi (sınır/FP süzgeci) + resmî/itibarlı değil mi.
      if (gercekTaklit(dom, m.anahtar) && !resmiMarkaDomaini(dom) && !itibarliMi(dom)) {
        bulunan.push({ domain: dom, marka: m.anahtar });
        if (!kesildi) {
          try {
            await markaGunlukArtir(m.anahtar, tarih, true);
            await markaAdayKaydet({
              domain: dom, marka: m.anahtar, markaAdi: m.ad, skor: 44, seviye: seviye(44),
              sinyaller: [`Yeni KAYDEDİLEN domain (NRD ${gun}) — marka adını taşıyan, resmî olmayan domain; sertifika öncesi, kayıt anında yakalandı.`],
              kaynak: "nrd", zaman: Date.now(),
            });
            aday++;
          } catch { /* yazma başarısızsa geç */ }
          if (Date.now() > bitis) kesildi = true; // süre bütçesi doldu → kalanı yazma (bulunanlar listede kalır)
        }
      }
      break; // domain bir marka kalıbına değdi → diğer markalara bakma
    }
  }
  return NextResponse.json(
    { ok: true, gun, taranan: domains.length, eslesen: bulunan.length, kaydedilen: aday, kesildi, ornek: bulunan.slice(0, 20) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
