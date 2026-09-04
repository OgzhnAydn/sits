// MOBİL UYGULAMA TARAMASI — markayı taklit eden uygulamaları bulur.
// iOS: Apple iTunes Search API (RESMÎ, anahtarsız, güvenilir). Marka adını taşıyan
// ama RESMÎ geliştiriciden OLMAYAN uygulamalar = incelenmeli/taklit.
// Android (Google Play) ayrı, güvenilir bir toplayıcı gerektirir (serverless IP'den
// Play sıkça bloklar) — sonraki adım. Uydurma sonuç ÜRETMEYİZ.
import { AVCI_MARKALAR } from "./korunanMarkalar";

export type AppBulgu = {
  platform: "ios" | "android";
  ad: string;
  gelistirici: string;
  paket: string;       // bundleId / package
  url: string;
  ikon?: string;
  puan?: number;
  sayi?: number;       // değerlendirme sayısı
  ulke: string;
  resmiMi: boolean;    // resmî geliştiriciden mi (heuristik)
  durum: "resmî" | "incele";
};
export type AppSonuc = { marka: string; markaAdi: string; sonuc: AppBulgu[]; toplam: number; resmi: number; incele: number; not?: string };

type ITunesApp = { trackName?: string; artistName?: string; bundleId?: string; trackViewUrl?: string; artworkUrl100?: string; averageUserRating?: number; userRatingCount?: number };

async function itunesTara(term: string, anahtar: string, ulke: string): Promise<AppBulgu[]> {
  try {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${ulke}&entity=software&limit=30`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: ITunesApp[] };
    const out: AppBulgu[] = [];
    for (const a of j.results || []) {
      const ad = String(a.trackName || "");
      const gel = String(a.artistName || "");
      const paket = String(a.bundleId || "");
      // Marka adını taşımıyorsa alakasız sonuç (arama gevşek eşleşir) → atla.
      if (!`${ad} ${paket}`.toLowerCase().includes(anahtar)) continue;
      const gelL = gel.toLowerCase(), paketL = paket.toLowerCase();
      // RESMÎ heuristiği: geliştirici adı ya da paket kimliği markayı içeriyorsa resmî
      // kabul edilir (ör. dev "Turkcell Iletisim...", paket com.turkcell.*). Aksi halde
      // marka adını KULLANAN başka bir geliştirici → incelenmeli.
      const resmiMi = gelL.includes(anahtar) || paketL.includes("." + anahtar) || paketL.startsWith(anahtar + ".");
      out.push({
        platform: "ios", ad, gelistirici: gel, paket, url: String(a.trackViewUrl || ""),
        ikon: a.artworkUrl100, puan: a.averageUserRating, sayi: a.userRatingCount, ulke,
        resmiMi, durum: resmiMi ? "resmî" : "incele",
      });
    }
    return out;
  } catch { return []; }
}

// Android — Google Play. play-scraper Play'in iç JSON API'sini kullanır (HTML
// kazımadan güvenilir). Sunucu IP'si bloklanırsa sessizce boş döner (dürüst).
type PlayApp = { title?: string; appId?: string; developer?: string; icon?: string; score?: number; url?: string };
async function playTara(anahtar: string, ulke: string): Promise<AppBulgu[]> {
  try {
    const mod = (await import("google-play-scraper")) as unknown as { default: { search: (o: Record<string, unknown>) => Promise<PlayApp[]> } };
    const r = await mod.default.search({ term: anahtar, num: 25, country: ulke, lang: "tr", throttle: 5 });
    const out: AppBulgu[] = [];
    for (const a of r) {
      const ad = String(a.title || ""), gel = String(a.developer || ""), paket = String(a.appId || "");
      if (!`${ad} ${paket}`.toLowerCase().includes(anahtar)) continue;
      const gelL = gel.toLowerCase(), paketL = paket.toLowerCase();
      const resmiMi = gelL.includes(anahtar) || paketL.includes("." + anahtar) || paketL.startsWith(anahtar + ".");
      out.push({ platform: "android", ad, gelistirici: gel, paket, url: String(a.url || `https://play.google.com/store/apps/details?id=${paket}`), ikon: a.icon, puan: a.score, ulke, resmiMi, durum: resmiMi ? "resmî" : "incele" });
    }
    return out;
  } catch { return []; }
}

export async function appTara(marka: string): Promise<AppSonuc> {
  const m = AVCI_MARKALAR.find((x) => x.anahtar === marka.toLowerCase());
  const anahtar = (m?.anahtar || marka).toLowerCase();
  const markaAdi = m?.ad || marka;
  // iOS (TR+US mağaza) + Android Play paralel taranır.
  const [tr, us, android] = await Promise.all([
    itunesTara(anahtar, anahtar, "tr"),
    itunesTara(anahtar, anahtar, "us"),
    playTara(anahtar, "tr"),
  ]);
  const harita = new Map<string, AppBulgu>();
  for (const a of [...tr, ...us, ...android]) { const k = a.platform + ":" + (a.paket || a.url); if (k && !harita.has(k)) harita.set(k, a); }
  // İncele olanlar önce, sonra puana göre.
  const sonuc = [...harita.values()].sort((a, b) => (a.resmiMi === b.resmiMi ? (b.puan || 0) - (a.puan || 0) : a.resmiMi ? 1 : -1));
  const androidVar = android.length > 0;
  return {
    marka: anahtar, markaAdi, sonuc,
    toplam: sonuc.length,
    resmi: sonuc.filter((a) => a.resmiMi).length,
    incele: sonuc.filter((a) => !a.resmiMi).length,
    not: androidVar
      ? "iOS App Store + Android Google Play canlı tarandı."
      : "iOS App Store canlı tarandı. Android Play şu an yanıt vermedi (sunucu IP bloğu olabilir).",
  };
}
