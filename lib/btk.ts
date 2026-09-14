// BTK ENGEL TESPİTİ — bir site Türkiye'de zaten erişime engellenmiş mi?
// BTK (Bilgi Teknolojileri ve İletişim Kurumu) 5651/betting kararlarıyla engellenen
// domainlerin otoritatif DNS'i çoğu zaman GLOBAL olarak BTK engel-sunucusuna yönlenir
// (ör. 195.175.254.x) → bizim sunucumuz da "erişime engellenmiştir" sayfasını görür.
// Böylece ZATEN engelli olanı "biz-önce" saymaktan kaçınırız (devlet zaten yakalamış).
//
// DÜRÜST SINIR: yalnız GLOBAL yönlenen engel sayfasını görebiliriz. Salt Türk-ISP DNS'inde
// engellenmiş ama otoritatif DNS'i değişmemiş siteleri (yerel-DNS engeli) TR dışından göremeyiz
// → onlar "bilinmiyor" (null) kalır, yanlış "engelli değil" İDDİA ETMEYİZ.

const TTL_MS = 24 * 60 * 60 * 1000;
const bellek = new Map<string, { v: boolean | null; t: number }>();

function host(u: string): string {
  return String(u || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
}

// BTK/erişim-engeli sayfa imzası (TR + EN). Kısmi eşleşme yeter — sayfa metni bunları taşır.
const ENGEL_IMZA = /erişime engellenmiştir|has been blocked by the decision|Bilgi Teknolojileri ve İletişim Kurumu karar|5651 say[ıi]l[ıi]|Terörün Finansman[ıi]|internet2\.btk\.gov\.tr|ihbarweb\.org\.tr/i;

// domain BTK tarafından engelli mi? true=engelli, false=engelli değil (canlı içerik gördük),
// null=erişilemedi/karar veremedik (engelli olmadığını İDDİA ETME).
export async function btkEngelli(domain: string): Promise<boolean | null> {
  const d = host(domain);
  if (!d || !d.includes(".")) return null;
  const c = bellek.get(d);
  if (c && Date.now() - c.t < TTL_MS) return c.v;
  try {
    const r = await fetch(`http://${d}/`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept-Language": "tr-TR,tr" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    const html = (await r.text()).slice(0, 30000);
    const engelli = ENGEL_IMZA.test(html);
    bellek.set(d, { v: engelli, t: Date.now() });
    return engelli;
  } catch {
    return null; // erişilemedi (ölü domain / timeout) → bilinmiyor
  }
}
