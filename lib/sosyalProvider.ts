// Sosyal bağ sağlayıcıları — bir hesabın PUBLIC ilişkilerini (aynı kullanıcı
// adının başka platformlardaki hesapları, bio'daki siteler) getirir.
//
// TASARIM İLKELERİ:
//  • Eklemeli ve KAPALI: ilgili env anahtarı yoksa provider hiç çalışmaz
//    (tıpkı Safe Browsing / IPQS / AbuseIPDB gibi). Mevcut sistem bozulmaz.
//  • PII SÜZÜLÜR: provider isim/e-posta/telefon dönse bile bunları DIŞARI
//    ÇIKARMAYIZ. Sadece İLİŞKİ verisi alınır: {platform, kullanıcı, url} ve
//    {domain}. PERSON kolu bilinçli olarak açılmaz.
//  • Her çağrı kısa timeout + hata yutar → asla ana akışı düşürmez.

export type BagliHesap = { platform: string; kullanici?: string; url?: string };
export type SaglayiciSonuc = { hesaplar: BagliHesap[]; domainler: string[]; kaynak: string };

const UA = { "User-Agent": "Mozilla/5.0 (compatible; SITS-Nazar/1.0)" };

function hostAyikla(u?: string): string | null {
  if (!u) return null;
  const m = u.trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "")
    .split(/[/\s?#]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(m) ? m : null;
}

// Bir platform host'unu (instagram.com) okunur ada (Instagram) çevir.
const PLATFORM_AD: Record<string, string> = {
  "instagram.com": "Instagram", "twitter.com": "X (Twitter)", "x.com": "X (Twitter)",
  "facebook.com": "Facebook", "tiktok.com": "TikTok", "t.me": "Telegram",
  "youtube.com": "YouTube", "linkedin.com": "LinkedIn", "github.com": "GitHub",
  "reddit.com": "Reddit", "pinterest.com": "Pinterest", "threads.net": "Threads",
  "medium.com": "Medium", "twitch.tv": "Twitch", "vk.com": "VK",
};
function platformAdi(hostOrName: string): string {
  const h = hostOrName.toLowerCase();
  return PLATFORM_AD[h] || PLATFORM_AD[hostAyikla(h) || ""] || hostOrName;
}

export interface SosyalProvider {
  ad: string;
  aktif: boolean; // anahtar var mı
  calistir(kullanici: string, platform: string | null): Promise<SaglayiciSonuc | null>;
}

// ── 1) Social Links Provider ───────────────────────────────────────
// "Social Links" ticari bir OSINT sağlayıcısıdır; API sözleşmesi kuruma göre
// değişir. Bu yüzden ENDPOINT ve KEY env'den gelir (esnek adaptör). Dönen
// gövdeyi savunmacı ayrıştırırız: {results:[{platform,url}]} benzeri şekiller.
// SOCIALLINKS_URL bir şablondur: {q} kullanıcı adıyla değiştirilir.
class SocialLinksProviderImpl implements SosyalProvider {
  ad = "Social Links";
  get aktif() {
    return Boolean(process.env.SOCIALLINKS_KEY && process.env.SOCIALLINKS_URL);
  }
  async calistir(kullanici: string): Promise<SaglayiciSonuc | null> {
    const key = process.env.SOCIALLINKS_KEY;
    const sablon = process.env.SOCIALLINKS_URL;
    if (!key || !sablon) return null;
    try {
      const url = sablon.replace("{q}", encodeURIComponent(kullanici));
      const r = await fetch(url, {
        headers: { ...UA, Authorization: `Bearer ${key}`, "api-key": key, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return null;
      const j = await r.json();
      return normalizeGenel(j, this.ad);
    } catch {
      return null;
    }
  }
}

// ── 2) OSINT Industries Provider ───────────────────────────────────
// OSINT Industries (osint.industries) v2: kullanıcı adı/e-posta/telefon → hangi
// platformlarda kayıtlı + profil verisi. api-key header'ı. Kişisel veri dönebilir;
// biz SADECE ilişki (platform + profil url) alırız, isim/e-posta/telefon'u ATLARIZ.
class OsintIndustriesProviderImpl implements SosyalProvider {
  ad = "OSINT Industries";
  get aktif() {
    return Boolean(process.env.OSINT_INDUSTRIES_KEY);
  }
  async calistir(kullanici: string): Promise<SaglayiciSonuc | null> {
    const key = process.env.OSINT_INDUSTRIES_KEY;
    if (!key) return null;
    try {
      const r = await fetch(
        `https://api.osint.industries/v2/request?type=username&query=${encodeURIComponent(kullanici)}`,
        { headers: { ...UA, "api-key": key, Accept: "application/json" }, signal: AbortSignal.timeout(9000) }
      );
      if (!r.ok) return null;
      const j = await r.json();
      return normalizeGenel(j, this.ad);
    } catch {
      return null;
    }
  }
}

// Farklı sağlayıcı gövdelerini tek şekle indirger. PII (isim/e-posta/telefon)
// ASLA çıkarılmaz — yalnızca {platform, kullanıcı, url} ve {domain}.
// Modül/kayıt dizilerini gezerek platform + url alanlarını toplar.
function normalizeGenel(j: unknown, kaynak: string): SaglayiciSonuc {
  const hesaplar: BagliHesap[] = [];
  const domainSet = new Set<string>();

  const kayitlar: unknown[] = Array.isArray(j)
    ? j
    : Array.isArray((j as { modules?: unknown[] })?.modules)
    ? (j as { modules: unknown[] }).modules
    : Array.isArray((j as { results?: unknown[] })?.results)
    ? (j as { results: unknown[] }).results
    : Array.isArray((j as { data?: unknown[] })?.data)
    ? (j as { data: unknown[] }).data
    : [];

  for (const k of kayitlar) {
    if (!k || typeof k !== "object") continue;
    const o = k as Record<string, unknown>;
    const d = (o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : o);

    const platformHam = String(o.module || o.platform || o.provider || o.source || o.name || d.platform || d.provider || d.site || "").trim();
    const url = String(o.url || o.profile_url || o.link || d.url || d.profile_url || d.link || "").trim();
    const kullaniciAdi = String(o.username || d.username || o.handle || d.handle || "").trim() || undefined;

    if (platformHam || url) {
      hesaplar.push({
        platform: platformAdi(platformHam || hostAyikla(url) || "Bilinmeyen"),
        kullanici: kullaniciAdi,
        url: url || undefined,
      });
    }
    // Profil dışı bir site/domain geçiyorsa (kişisel site vb.) altyapı düğümü yap
    const site = String(d.website || d.domain || o.website || "").trim();
    const h = hostAyikla(site);
    if (h) domainSet.add(h);
  }

  return { hesaplar: hesaplar.slice(0, 12), domainler: [...domainSet].slice(0, 6), kaynak };
}

import { WhatsMyNameProvider } from "./whatsMyName";

export const SOSYAL_PROVIDERLAR: SosyalProvider[] = [
  new WhatsMyNameProvider(), // ücretsiz, anahtarsız — varsayılan açık
  new SocialLinksProviderImpl(),
  new OsintIndustriesProviderImpl(),
];

// Tüm AKTİF sağlayıcıları paralel çalıştır, sonuçları birleştir.
// Hiçbiri aktif değilse boş döner (mevcut davranış korunur).
export async function sosyalBaglar(kullanici: string, platform: string | null): Promise<SaglayiciSonuc[]> {
  const aktifler = SOSYAL_PROVIDERLAR.filter((p) => p.aktif);
  if (!aktifler.length || !kullanici) return [];
  const sonuclar = await Promise.all(aktifler.map((p) => p.calistir(kullanici, platform).catch(() => null)));
  return sonuclar.filter((s): s is SaglayiciSonuc => Boolean(s && (s.hesaplar.length || s.domainler.length)));
}

export const sosyalProviderDurum = () =>
  SOSYAL_PROVIDERLAR.map((p) => ({ ad: p.ad, aktif: p.aktif }));
