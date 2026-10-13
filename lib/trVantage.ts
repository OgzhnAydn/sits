// TR-VANTAGE — kendi Playwright render servisimizden (veri-platformu/render) siteyi GERÇEK TR
// görünümüyle çeker: TR locale/UA + opsiyonel TR residential proxy. urlscan'in bulut-IP'den gördüğü
// "temiz" sayfayı değil, kurbanın gördüğü GERÇEK sayfayı alırız → cloaking'i kırar. RENDER_URL yoksa
// (servis kurulu değilse) null döner; çağıran urlscan'e düşer.
export type AgIstek = { m: string; s: number; u: string; t: string; ip: string };
export type TrVantage = {
  status: number | null; finalUrl: string; title: string; html: string;
  shotB64: string; proxy: boolean; chain: { u: string; s: number }[];
  // dinamik davranış (urlcheckup tarzı): ağ transactionları, clipboard, script analizi
  network?: AgIstek[]; clipboard?: string[];
  scripts?: { inlineN: number; external: string[]; supheli: string[] };
};

export async function trVantageRender(domain: string): Promise<TrVantage | null> {
  const base = process.env.RENDER_URL;
  const secret = process.env.RENDER_SECRET;
  if (!base) return null;
  try {
    const r = await fetch(base.replace(/\/$/, "") + "/render", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { Authorization: "Bearer " + secret } : {}) },
      body: JSON.stringify({ url: domain }),
      signal: AbortSignal.timeout(32000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as TrVantage;
    return (j.shotB64 || j.title || j.html) ? j : null;
  } catch {
    return null;
  }
}

// İki başlığın "belirgin farklı" olup olmadığı — cloaking ipucu (urlscan görünümü vs TR görünümü).
export function baslikFarkli(a: string, b: string): boolean {
  const n = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9ğüşıöç]/gi, "").slice(0, 50);
  const x = n(a), y = n(b);
  if (!x || !y) return false;                 // biri boşsa karşılaştırma yapma
  if (x === y) return false;
  return !(x.includes(y.slice(0, 14)) || y.includes(x.slice(0, 14)));
}

// Bir adayı GERÇEK tarayıcıda (TR locale) açıp cloaking + dinamik davranış sinyallerini çıkarır.
// Hem derin-analiz hem günlük otomatik yeniden-tarama bunu kullanır → "yakalanan her link
// otomatik gerçek tarayıcıda açılır". RENDER_URL yoksa/erişilemezse null (statik analizle devam).
export type RenderSinyal = { zaman: number; finalUrl?: string; yonlendirme?: number; cloaking?: boolean; clipboard?: boolean; supheliScript?: string[]; agHost?: number };
export async function renderAday(domain: string, pasifBaslik?: string): Promise<RenderSinyal | null> {
  if (!process.env.RENDER_URL) return null;
  const tr = await trVantageRender(domain).catch(() => null);
  if (!tr) return null;
  const host = domain.replace(/^www\./, "");
  const disHost = new Set((tr.network || []).map((n) => { try { return new URL(n.u).hostname.replace(/^www\./, ""); } catch { return ""; } })
    .filter((h) => h && h !== host && !h.endsWith("." + host))).size;
  return {
    zaman: Date.now(),
    finalUrl: tr.finalUrl,
    yonlendirme: (tr.chain || []).length,
    cloaking: !!pasifBaslik && baslikFarkli(tr.title || "", pasifBaslik),
    clipboard: (tr.clipboard || []).length > 0,
    supheliScript: tr.scripts?.supheli || [],
    agHost: disHost,
  };
}
