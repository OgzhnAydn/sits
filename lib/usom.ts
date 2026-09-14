// USOM (Ulusal Siber Olaylara Müdahale Merkezi) — zararlı bağlantı sicili sorgusu.
// Amaç: KENDİ bulduğumuz siteyi USOM zaten biliyor mu? Bilmiyorsa = "biz-önce" → USOM'a
// bildirilecek. USOM'un listesini KOPYALAMAYIZ; yalnız dedup için tek-tek sorarız.
//
// Kaynak: https://siberguvenlik.gov.tr/api/address/index?q=<terim>&page=1 (JSON, 20/sayfa).
// ?q= alt-dize arar; biz TAM host eşlemesi ile "bu domain listede mi" kararı veririz.
// (Eski usom.gov.tr/url-list.txt 2026-06'da kapandı → yalnız API.)

const TTL_MS = 6 * 60 * 60 * 1000; // 6 saat önbellek
const bellek = new Map<string, { v: boolean | null; t: number }>();

function host(u: string): string {
  return String(u || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
}

// USOM listesinde bu domain (tam host) VAR mı? true=var, false=yok, null=sorgulanamadı.
export async function usomBiliniyor(domain: string): Promise<boolean | null> {
  const d = host(domain);
  if (!d || !d.includes(".")) return null;
  const c = bellek.get(d);
  if (c && Date.now() - c.t < TTL_MS) return c.v;
  try {
    const r = await fetch(`https://siberguvenlik.gov.tr/api/address/index?q=${encodeURIComponent(d)}&page=1`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MirLeonBot/1.0)", "Accept": "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { models?: { url?: string; type?: string }[] };
    // TAM host eşleşmesi (alt-dize FP'sini engelle): USOM kaydı domain ya da url olabilir.
    const var_ = (j.models || []).some((m) => {
      const mu = host(m.url || "");
      return mu === d || mu.endsWith("." + d) || d.endsWith("." + mu);
    });
    bellek.set(d, { v: var_, t: Date.now() });
    return var_;
  } catch {
    return null; // erişilemedi → "bilinmiyor" (yok SAYMA; yanlış "biz-önce" iddiası üretme)
  }
}
