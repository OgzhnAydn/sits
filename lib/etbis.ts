// ETBİS — Ticaret Bakanlığı Elektronik Ticaret Bilgi Sistemi sorgusu.
// Türkiye'de e-ticaret yapan her işletme ETBİS'e kayıtlı olmak zorundadır. Bu yüzden:
//  • kayıtlı + DOĞRULANMIŞ → resmî bir e-ticaret işletmesi (güçlü MEŞRUİYET sinyali)
//  • alışveriş sitesi görünümlü ama KAYITSIZ → kayıt-dışı/sahte mağaza şüphesi
// DÜRÜST SINIR: ETBİS yalnız e-TİCARET içindir. Banka/kamu/kurumsal bir sitenin ETBİS'te
// olmaması NORMALDİR (dolandırıcılık sinyali DEĞİL) — o yüzden "kayıtsız" cezası yalnız
// e-ticaret göstergesi olan sitelere uygulanır (bkz. lib/osint.ts). Kayıt, sitenin güvenli
// veya hukuka uygun olduğunu GARANTİ ETMEZ (ETBİS'in kendi uyarısı) — sadece bir sinyaldir.
//
// Kaynak: https://etbis.ticaret.gov.tr/tr/SiteSorgulama?url=<alan> — sunucu-render HTML
// (JSON API yok); GET ile erişilir, oturum/CAPTCHA yok. Alan adını ALT-DİZE eşler; biz
// TAM host eşlemesi yaparız (typosquat'ın gerçek markanın kaydını "kendi kaydı" sanmasın).

export type EtbisKayit = { unvan: string; url: string; dogrulanmis: boolean; siteId: string };
export type EtbisSonuc = {
  sorgu: string;
  kayitli: boolean;       // TAM host eşleşen en az bir kayıt var mı
  dogrulanmis: boolean;   // eşleşenlerden biri karekod-doğrulanmış mı
  kayitlar: EtbisKayit[];  // eşleşen kayıtlar (yoksa boş)
  hata?: boolean;         // erişilemedi/parse edilemedi → sinyal ÜRETME
};

const TTL_MS = 24 * 60 * 60 * 1000; // ETBİS verisi yavaş değişir → 24s önbellek (dış servise saygı)
const bellek = new Map<string, { v: EtbisSonuc; t: number }>();

function host(u: string): string {
  const s = String(u || "").trim();
  try {
    return new URL(s.startsWith("http") ? s : "http://" + s).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return s.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].toLowerCase();
  }
}

// ETBİS HTML'i numerik/isimli entity'lerle gelir (Ü=&#xDC; gibi) — okunur Türkçe'ye çevir.
function coz(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ""; } })
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

// Sonuç tablosundaki her <tr>: iki .opacity-70 span (unvan, e-ticaret sitesi) +
// /img/verified.png|unverified.png (doğrulama) + siteId (profil GUID).
function ayristir(html: string): EtbisKayit[] {
  const out: EtbisKayit[] = [];
  const satirlar = html.split(/<tr[\s>]/i).slice(1);
  for (const satir of satirlar) {
    const spanlar = [...satir.matchAll(/opacity-70">([\s\S]*?)<\/span>/g)].map((m) => coz(m[1]));
    const sid = satir.match(/siteId=([0-9a-fA-F-]{36})/);
    if (!sid || spanlar.length < 2 || !spanlar[1]) continue;
    // "verified.png" — "unverified.png"'in ALT-DİZESİ DEĞİL ("/img/un..." ≠ "/img/verified")
    out.push({ unvan: spanlar[0], url: spanlar[1], dogrulanmis: /\/img\/verified\.png/.test(satir), siteId: sid[1] });
  }
  return out;
}

export async function etbisSorgu(domain: string): Promise<EtbisSonuc> {
  const d = host(domain);
  if (!d || !d.includes(".")) return { sorgu: d, kayitli: false, dogrulanmis: false, kayitlar: [], hata: true };
  const c = bellek.get(d);
  if (c && Date.now() - c.t < TTL_MS) return c.v;

  const bos: EtbisSonuc = { sorgu: d, kayitli: false, dogrulanmis: false, kayitlar: [] };
  try {
    const r = await fetch(
      `https://etbis.ticaret.gov.tr/tr/SiteSorgulama?url=${encodeURIComponent(d)}&cityId=&districtId=&sector=&isItCrossBorder=`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; MirLeonBot/1.0; anti-phishing kontrolü)", "Accept-Language": "tr" }, signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) return { ...bos, hata: true };
    const html = await r.text();
    const hepsi = ayristir(html);
    // TAM host eşleşmesi — "trendyol-giris.com" sorgusu gerçek "trendyol.com" kaydını
    // ALT-DİZE ile getirse bile onu bu domainin kaydı SAYMAYIZ.
    const esles = hepsi.filter((k) => host(k.url) === d);
    const sonuc: EtbisSonuc = {
      sorgu: d,
      kayitli: esles.length > 0,
      dogrulanmis: esles.some((k) => k.dogrulanmis),
      kayitlar: esles.slice(0, 6),
    };
    bellek.set(d, { v: sonuc, t: Date.now() });
    return sonuc;
  } catch {
    return { ...bos, hata: true }; // zaman aşımı/ağ hatası → sinyal üretme, sessiz geç
  }
}
