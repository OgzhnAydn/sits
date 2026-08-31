// WhatsMyNameProvider — ÜCRETSİZ, anahtarsız "bağlı hesap" tespiti.
// WhatsMyName açık veri yaklaşımı: bir kullanıcı adını, seçili sitelerin URL
// kalıbına koy, iste, doğru tespit yöntemiyle (durum kodu VEYA gövde string'i)
// "bu handle burada da var mı" bak. OSINT Industries'in çekirdek işini $0 yapar.
//
// SINIR: sadece hesap↔hesap İLİŞKİsi üretir (graf düğümü). Kişisel veri
// (isim/e-posta/telefon) çekmez → PERSON kolu kapalı kalır.
//
// Güvenlik: host SABİT (github.com vb.), sadece yol değişir → SSRF yok. Kullanıcı
// adı yine de [a-z0-9._-] dışına düşenler atılarak sıkı sanitize edilir.

import type { SosyalProvider, SaglayiciSonuc, BagliHesap } from "./sosyalProvider";

type Yontem = "code" | "string";
type Site = { ad: string; url: string; yontem: Yontem; eString?: string; odeme?: boolean };

// Sunucu tarafından güvenilir tespit edilebilen, bot-duvarı olmayan siteler.
// odeme:true → dolandırıcılık bağlamında yüksek değerli (para toplanan handle).
const SITELER: Site[] = [
  // Kod tabanlı (var=200, yok=404/redirect)
  { ad: "GitHub", url: "https://github.com/{q}", yontem: "code" },
  { ad: "GitLab", url: "https://gitlab.com/{q}", yontem: "code" },
  { ad: "Dev.to", url: "https://dev.to/{q}", yontem: "code" },
  { ad: "Medium", url: "https://medium.com/@{q}", yontem: "code" },
  { ad: "DeviantArt", url: "https://www.deviantart.com/{q}", yontem: "code" },
  { ad: "Vimeo", url: "https://vimeo.com/{q}", yontem: "code" },
  { ad: "SoundCloud", url: "https://soundcloud.com/{q}", yontem: "code" },
  { ad: "Replit", url: "https://replit.com/@{q}", yontem: "code" },
  { ad: "Pastebin", url: "https://pastebin.com/u/{q}", yontem: "code" },
  { ad: "Chess.com", url: "https://api.chess.com/pub/player/{q}", yontem: "code" },
  { ad: "Gravatar", url: "https://gravatar.com/{q}.json", yontem: "code" },
  { ad: "Reddit", url: "https://www.reddit.com/user/{q}/about.json", yontem: "code" },
  { ad: "YouTube", url: "https://www.youtube.com/@{q}", yontem: "code" },
  { ad: "Linktree", url: "https://linktr.ee/{q}", yontem: "code", odeme: true },
  { ad: "Ko-fi", url: "https://ko-fi.com/{q}", yontem: "code", odeme: true },
  { ad: "Cash App", url: "https://cash.app/${q}", yontem: "code", odeme: true },
  // NOT: PayPal.me çıkarıldı — var-olmayan kullanıcıya da 200 döner (SPA) → yanlış-pozitif.
  // String tabanlı (gövdede varlık işareti aranır — 200 herkese döner)
  { ad: "Telegram", url: "https://t.me/{q}", yontem: "string", eString: "tgme_page_title" },
  { ad: "Steam", url: "https://steamcommunity.com/id/{q}", yontem: "string", eString: "g_rgProfileData" },
  { ad: "Keybase", url: "https://keybase.io/_/api/1.0/user/lookup.json?username={q}", yontem: "string", eString: "\"basics\"" },
];

const UA = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
};

async function siteKontrol(site: Site, q: string): Promise<BagliHesap | null> {
  const url = site.url.replace("{q}", q);
  try {
    const r = await fetch(url, {
      headers: UA,
      redirect: site.yontem === "string" ? "follow" : "manual",
      signal: AbortSignal.timeout(4500),
    });
    if (site.yontem === "code") {
      if (r.status !== 200) return null;
    } else {
      if (r.status !== 200) return null;
      const body = (await r.text()).slice(0, 200_000);
      if (!site.eString || !body.includes(site.eString)) return null;
    }
    // Görüntülenecek profil URL'i (API uçları yerine insan-okur adres)
    const gorunur = site.url.includes("/api.") || site.url.includes("about.json") || site.url.includes("lookup.json") || site.url.endsWith(".json")
      ? insanUrl(site.ad, q)
      : url;
    return { platform: site.ad, kullanici: q, url: gorunur };
  } catch {
    return null;
  }
}

// API uçları için insan-okur profil adresi
function insanUrl(ad: string, q: string): string {
  switch (ad) {
    case "Chess.com": return `https://www.chess.com/member/${q}`;
    case "Gravatar": return `https://gravatar.com/${q}`;
    case "Reddit": return `https://www.reddit.com/user/${q}`;
    case "Keybase": return `https://keybase.io/${q}`;
    default: return `https://${q}`;
  }
}

// Her platformda bulunan yaygın kelimeler → taranırsa hep yanlış-pozitif olur.
const YAYGIN_AD = new Set([
  "feed", "home", "login", "signup", "user", "users", "admin", "test", "about", "info",
  "news", "blog", "shop", "store", "mail", "email", "api", "app", "apps", "support",
  "help", "index", "main", "official", "team", "dev", "data", "web", "live", "online",
  "link", "links", "page", "pages", "site", "world", "global", "free", "new", "top",
  "best", "real", "you", "all", "one", "get", "now", "here", "this", "that", "root",
  "demo", "guest", "public", "private", "service", "account", "profile", "me", "my",
  "settings", "search", "explore", "discover", "trending", "popular", "welcome", "null",
]);

export class WhatsMyNameProvider implements SosyalProvider {
  ad = "WhatsMyName";
  // Anahtar gerektirmez; WHATSMYNAME=0 ile kapatılabilir.
  get aktif() {
    return process.env.WHATSMYNAME !== "0";
  }
  async calistir(kullanici: string): Promise<SaglayiciSonuc | null> {
    const q = (kullanici || "").toLowerCase().replace(/[^a-z0-9._-]/g, "");
    // Çok yaygın/jenerik kelimeler HER platformda vardır → hepsi yanlış-pozitif gürültü.
    // Bunları tarama (ör. "feed", "home", "user"). Kısa (<4) adlar da gürültülüdür.
    if (q.length < 4 || q.length > 30 || YAYGIN_AD.has(q)) return null;
    const sonuc = await Promise.all(SITELER.map((s) => siteKontrol(s, q).catch(() => null)));
    const hesaplar = sonuc.filter((h): h is BagliHesap => Boolean(h));
    if (!hesaplar.length) return null;
    return { hesaplar, domainler: [], kaynak: this.ad };
  }
}
