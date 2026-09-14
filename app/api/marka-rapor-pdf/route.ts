import { NextRequest, NextResponse } from "next/server";
import { markaAdaylariMarka, markaErkenlik, kullaniciMarkalariGetir, type MarkaAday } from "@/lib/store";
import { gercekTaklit, markaLogoAnahtar, KORUNAN_MARKALAR } from "@/lib/korunanMarkalar";
import { markaRaporPdf, type RaporTespit } from "@/lib/pdf/MarkaRaporPdf";
import { usomBiliniyor } from "@/lib/usom";
import { btkEngelli } from "@/lib/btk";
import { etbisYerel } from "@/lib/etbisYerel";
import { canlilikProbe } from "@/lib/canlilik";

// Hafif teknik envanter (tam liste için) — canlilikProbe (DNS IP + SSL CA + canlılık) + ip-api (ASN/ülke).
// domainOsint (40-60s) yerine ~5s → tüm adreslerde batch çalışabilir.
async function ipApi(ip: string): Promise<{ as?: string; country?: string; org?: string; isp?: string; hosting?: boolean }> {
  try { const r = await fetch(`http://ip-api.com/json/${ip}?fields=country,as,org,isp,hosting`, { signal: AbortSignal.timeout(5000) }); return await r.json(); } catch { return {}; }
}
async function hizliTeknik(domain: string): Promise<{ ip?: string; asn?: string; ulke?: string; ca?: string; altyapi?: string; canliDurum?: string }> {
  try {
    const c = await canlilikProbe(domain);
    const g = c.dns.ip ? await ipApi(c.dns.ip) : {};
    const org = (g.org || g.isp || "").slice(0, 26);
    const asnNo = String(g.as || "").split(" ")[0];
    return {
      ip: c.dns.ip || "", ca: c.ssl.veren || "",
      asn: [org, asnNo].filter(Boolean).join(" · "),
      ulke: g.country || "",
      altyapi: g.hosting ? "CDN/proxy" : (org ? "Veri merkezi" : ""),
      canliDurum: c.durum,
    };
  } catch { return {}; }
}

export const runtime = "nodejs";
export const maxDuration = 60;

const ARALIK: Record<string, { ms: number; etiket: string }> = {
  gunluk: { ms: 24 * 3600e3, etiket: "Son 24 saat" },
  haftalik: { ms: 7 * 24 * 3600e3, etiket: "Son 7 gün" },
  aylik: { ms: 30 * 24 * 3600e3, etiket: "Son 30 gün" },
  tumu: { ms: 0, etiket: "Tüm zamanlar" },
};

// Bir görsel URL'sini base64 data-uri'ye çevir (PDF'e gömmek için). Alınamazsa null.
async function resimDataUri(url: string, ms = 8000): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    const tip = r.headers.get("content-type") || "image/png";
    if (!tip.startsWith("image")) return null;
    const b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
    return `data:${tip};base64,${b64}`;
  } catch { return null; }
}
async function logoDataUri(anahtar: string): Promise<string | null> {
  const url = markaLogoAnahtar(anahtar, 128);
  return url ? resimDataUri(url) : null;
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const marka = (u.searchParams.get("marka") || "").trim().toLowerCase();
  const aralikKey = (u.searchParams.get("aralik") || "haftalik").toLowerCase();
  const tekDomain = (u.searchParams.get("domain") || "").trim().toLowerCase();
  if (!marka) return NextResponse.json({ hata: "marka gerekli." }, { status: 400 });
  const aralik = ARALIK[aralikKey] || ARALIK.haftalik;

  // Marka adı: önce hardcoded KORUNAN, yoksa KULLANICI'nın eklediği markalar (kullanici_markalari).
  // Aksi halde kullanıcı-eklediği markanın raporu adı çözemeyip anahtarı büyütüyordu ("ktb"→"Ktb").
  const ozelMarkalar = await kullaniciMarkalariGetir().catch(() => []);
  const markaObj = KORUNAN_MARKALAR.find((m) => m.anahtar === marka) || ozelMarkalar.find((m) => m.anahtar === marka);
  const markaAd = markaObj?.ad || marka.charAt(0).toUpperCase() + marka.slice(1);

  // Veri: markanın GERÇEK-taklit adayları, zaman aralığına süz.
  const ham = await markaAdaylariMarka(marka, 400);
  let gecerli = ham.filter((a) => gercekTaklit(a.domain, a.marka));
  if (tekDomain) gecerli = gecerli.filter((a) => a.domain === tekDomain);
  else if (aralik.ms) { const esik = Date.now() - aralik.ms; gecerli = gecerli.filter((a) => (a.zaman || 0) >= esik); }
  gecerli.sort((a, b) => (b.zaman || 0) - (a.zaman || 0));

  const sayil = (f: (a: MarkaAday) => boolean) => gecerli.filter(f).length;
  const ozet = {
    toplam: gecerli.length,
    aktif: sayil((a) => a.durum === "aktif-tuzak"),
    canli: sayil((a) => a.durum === "canli"),
    park: sayil((a) => a.durum === "park" || a.durum === "yayinda-degil"),
    inceleme: sayil((a) => !["aktif-tuzak", "canli", "park", "yayinda-degil"].includes(a.durum || "")),
  };

  const erk = await markaErkenlik(marka).catch(() => ({ toplam: 0, bizOnce: 0, usomdaYok: 0 }));
  const erkenlik = { toplam: erk.toplam || 0, bizOnce: (erk as { bizOnce?: number }).bizOnce || 0, usomdaYok: erk.usomdaYok || 0 };

  // ÖNE ÇIKAN = aktif tuzak / canlı (yüksek skor önce) → ekran görüntüsü + detay. Gerisi = tablo.
  const tesp = (a: MarkaAday): RaporTespit => ({ domain: a.domain, skor: a.skor || 0, durum: a.durum, seviye: a.seviye, zaman: a.zaman || 0, sinyaller: a.sinyaller });
  const oncelikli = gecerli.filter((a) => a.durum === "aktif-tuzak" || a.durum === "canli").sort((a, b) => (b.skor || 0) - (a.skor || 0));
  const oneCikanKay = (tekDomain ? gecerli : oncelikli).slice(0, tekDomain ? 1 : 4);
  const oneCikanDom = new Set(oneCikanKay.map((a) => a.domain));
  const digerleri = gecerli.filter((a) => !oneCikanDom.has(a.domain)).map(tesp);

  // Tam liste teknik envanteri — en yüksek skorlu ~64 adres için hafif probe (batch). Öne çıkan
  // zenginleştirme (domainOsint) ile PARALEL çalışır → toplam süre maxDuration içinde kalır.
  const envanterDom = [...oneCikanKay, ...digerleri.map((d) => ({ domain: d.domain, skor: d.skor }))]
    .sort((a, b) => (b.skor || 0) - (a.skor || 0)).slice(0, 40).map((t) => t.domain);
  const envanterIsi = (async () => {
    const m = new Map<string, Awaited<ReturnType<typeof hizliTeknik>>>();
    for (let i = 0; i < envanterDom.length; i += 20) {
      const grup = await Promise.all(envanterDom.slice(i, i + 20).map(async (d) => [d, await hizliTeknik(d)] as const));
      for (const [d, e] of grup) m.set(d, e);
    }
    return m;
  })();

  // Öne çıkanlar için GERÇEK ekran görüntüsü + USOM/BTK/ETBİS durumu (hepsi paralel, best-effort).
  const [oneCikanHam, envMap] = await Promise.all([
    Promise.all(oneCikanKay.map(async (a) => {
      const [usomda, engelli] = await Promise.all([usomBiliniyor(a.domain), btkEngelli(a.domain)]);
      const etbis = etbisYerel(a.domain).kayitliMi;
      return { ...tesp(a), usomda, engelli, etbis };
    })),
    envanterIsi,
  ]);
  const zengin = (t: RaporTespit): RaporTespit => ({ ...t, ...(envMap.get(t.domain) || {}) });
  const oneCikan: RaporTespit[] = oneCikanHam.map(zengin);
  const digerleriZ = digerleri.map(zengin);

  const logo = await logoDataUri(marka);
  const refNo = `MRL-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 899999)}`;
  const tarih = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });

  const pdf = await markaRaporPdf({
    markaAd, logoDataUri: logo,
    aralikEtiket: tekDomain ? `Tek tespit · ${tekDomain}` : aralik.etiket,
    markaResmi: (markaObj?.resmi && markaObj.resmi[0]) || undefined,
    tarih, refNo, ozet, erkenlik, oneCikan, digerleri: digerleriZ,
  });

  const adSlug = markaAd.replace(/[^a-zA-Z0-9]/g, "") + (tekDomain ? "-tespit" : "-" + aralikKey);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="MirLeon-MarkaKoruma-${adSlug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
