// SEON — dijital ayak izi + risk. E-posta/telefon → hangi platformlarda kayıtlı
// (Facebook, Google, Amazon…) + fraud skoru. Güçlü sinyal: dolandırıcının kullan-at
// e-postası HİÇBİR yerde kayıtlı değildir; gerçek kişininki 10+ platformda görünür.
//
// Eklemeli ve KAPALI: SEON_KEY yoksa hiç çalışmaz (mevcut sistem bozulmaz).
// PII sınırı: yalnızca "hangi platformda kayıtlı" İLİŞKİsi + risk alınır; SEON'un
// döndürebileceği ad/foto gibi kişisel alanlar kullanılmaz.

export type SeonSonuc = { skor: number; platformlar: string[]; disposable?: boolean };

const KOK = "https://api.seon.io/SeonRestService";

export const seonVarMi = () => Boolean(process.env.SEON_KEY);

async function seonCagir(path: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const key = process.env.SEON_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`${KOK}/${path}`, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.success && j.data && typeof j.data === "object" ? (j.data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const OZEL_AD: Record<string, string> = {
  google: "Google", facebook: "Facebook", twitter: "X (Twitter)", instagram: "Instagram",
  linkedin: "LinkedIn", microsoft: "Microsoft", apple: "Apple", amazon: "Amazon",
  spotify: "Spotify", netflix: "Netflix", ebay: "eBay", airbnb: "Airbnb", github: "GitHub",
  whatsapp: "WhatsApp", telegram: "Telegram", snapchat: "Snapchat", tiktok: "TikTok",
  yahoo: "Yahoo", pinterest: "Pinterest", flickr: "Flickr", vimeo: "Vimeo",
};
function guzelAd(k: string): string {
  return OZEL_AD[k.toLowerCase()] || k.charAt(0).toUpperCase() + k.slice(1);
}

// account_details: { facebook: {registered:true}, google:{registered:true}, ... }
function platformlariCikar(data: Record<string, unknown>): string[] {
  const ad = data.account_details;
  if (!ad || typeof ad !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(ad as Record<string, unknown>)) {
    if (v && typeof v === "object" && (v as { registered?: unknown }).registered === true) out.push(guzelAd(k));
  }
  return out.slice(0, 20);
}

export async function seonEmail(email: string): Promise<SeonSonuc | null> {
  const data = await seonCagir("email-api/v2.1/", { email });
  if (!data) return null;
  return {
    skor: Number(data.score || 0),
    platformlar: platformlariCikar(data),
    disposable: data.deliverable === false || Boolean(data.disposable),
  };
}

export async function seonTelefon(phone: string): Promise<SeonSonuc | null> {
  const data = await seonCagir("phone-api/v2.1/", { phone });
  if (!data) return null;
  return { skor: Number(data.score || 0), platformlar: platformlariCikar(data) };
}
