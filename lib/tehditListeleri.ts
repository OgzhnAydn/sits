// Bilinen-kötü listeleri — bir domain'i "sıfırdan" analiz etmeden önce,
// dünyanın (ve Türkiye'nin resmi kurumunun) zaten kötü bildiği listelerde ara.
// Hepsi ücretsiz; USOM ve OpenPhish anahtarsız, Google Safe Browsing opsiyonel.

import { itibarliMi } from "./itibarli";

type Liste = { set: Set<string>; zaman: number };
const TTL = 12 * 60 * 60 * 1000; // 12 saat — liste bellekte önbelleklenir
const cache: Record<string, Liste> = {};

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
};

// Bir satır/URL'den saf host çıkar (şema, yol, port, www. temizlenir).
function hostAyikla(satir: string): string | null {
  let s = satir.trim().toLowerCase();
  if (!s || s.startsWith("#")) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split(":")[0].trim();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null;
}

async function listeGetir(ad: string, url: string): Promise<Set<string>> {
  const c = cache[ad];
  if (c && Date.now() - c.zaman < TTL) return c.set;
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(String(r.status));
    const t = await r.text();
    const set = new Set<string>();
    for (const satir of t.split(/\r?\n/)) {
      const h = hostAyikla(satir);
      if (h) set.add(h);
    }
    cache[ad] = { set, zaman: Date.now() };
    return set;
  } catch {
    return c?.set ?? new Set(); // eski liste, taze listeden iyidir
  }
}

// domain ve üst domainleri listede mi? (alt.alan.com → alan.com da kontrol)
function listedeMi(set: Set<string>, domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  // İtibarlı siteyi feed kirliliğine karşı koru (phishing sayfası github.com/…'da
  // barındırılınca feed github.com'u içerebilir; tüm siteyi işaretlemeyelim).
  if (itibarliMi(d)) return false;
  if (set.has(d)) return true;
  const p = d.split(".");
  for (let i = 1; i < p.length - 1; i++) {
    if (set.has(p.slice(i).join("."))) return true;
  }
  return false;
}

// USOM (T.C. Siber Güvenlik Başkanlığı) — resmi zararlı adres veritabanı (~488 bin).
// Tekil host sorgusu: ?url=<host> → bulunursa totalCount>=1 + kayıt detayı.
// Kısa süreli önbellek (aynı domaini tekrar sormamak için).
type UsomKayit = { listede: boolean; tur?: string; kritiklik?: number; tarih?: string };
const usomCache: Record<string, { v: UsomKayit; zaman: number }> = {};
const USOM_TTL = 60 * 60 * 1000; // 1 saat

const USOM_TUR: Record<string, string> = {
  PH: "oltalama (phishing)", MW: "zararlı yazılım", BP: "yasa dışı bahis",
  SP: "spam", DF: "sahtecilik",
};

async function usomLookup(domain: string): Promise<UsomKayit> {
  const d = domain.toLowerCase().replace(/^www\./, "");
  const c = usomCache[d];
  if (c && Date.now() - c.zaman < USOM_TTL) return c.v;
  try {
    const r = await fetch(
      `https://siberguvenlik.gov.tr/api/address/index?url=${encodeURIComponent(d)}`,
      { headers: UA, signal: AbortSignal.timeout(9000) }
    );
    const j = await r.json();
    // ÖNEMLİ: USOM ?url= parametresi SUBSTRING araması yapar. "haberturk.com"
    // sorgusu, USOM'da kayıtlı "tr-trt-haberturk.com" (haberturk TAKLİDİ phishing)
    // kaydını da döndürür. Bu yüzden dönen kaydın host'u sorgulanan domain'e
    // BİREBİR eşit olmalı — yoksa meşru siteyi yanlışlıkla suçlarız.
    const models: { url?: string; connectiontype?: string; criticality_level?: number; date?: string }[] =
      Array.isArray(j?.models) ? j.models : [];
    const tam = models.find((x) => hostAyikla(x.url || "") === d);
    const v: UsomKayit = tam
      ? { listede: true, tur: USOM_TUR[tam.connectiontype || ""] || tam.connectiontype || undefined, kritiklik: tam.criticality_level, tarih: tam.date }
      : { listede: false };
    usomCache[d] = { v, zaman: Date.now() };
    return v;
  } catch {
    return c?.v ?? { listede: false };
  }
}

// ERKENLİK için: bir domain USOM'da mı, ne zaman eklenmiş? (birebir-eşleşme korumalı)
export async function usomBilgi(domain: string): Promise<{ listede: boolean; tarih?: string; kritiklik?: number }> {
  const v = await usomLookup(domain);
  return { listede: v.listede, tarih: v.tarih, kritiklik: v.kritiklik };
}

// abuse.ch — URLhaus (zararlı yazılım dağıtan host) + ThreatFox (IOC).
// Tek ücretsiz Auth-Key. ThreatFox TAM-eşleşme filtresi (substring yanlış-pozitifi).
async function abuseCh(domain: string): Promise<string[]> {
  const key = process.env.ABUSECH_KEY;
  if (!key) return [];
  const d = domain.toLowerCase().replace(/^www\./, "");
  const kaynaklar: string[] = [];
  // URLhaus — bu host'ta zararlı yazılım URL'i var mı (tam host sorgusu)
  try {
    const r = await fetch("https://urlhaus-api.abuse.ch/v1/host/", {
      method: "POST",
      headers: { "Auth-Key": key, "Content-Type": "application/x-www-form-urlencoded" },
      body: `host=${encodeURIComponent(d)}`,
      signal: AbortSignal.timeout(6000),
    });
    const j = await r.json();
    if (j?.query_status === "ok" && (Number(j?.url_count) > 0 || (Array.isArray(j?.urls) && j.urls.length))) {
      kaynaklar.push("URLhaus (zararlı yazılım)");
    }
  } catch {}
  // ThreatFox — IOC; substring döndürür, TAM host eşleşmesi ara.
  try {
    const r = await fetch("https://threatfox-api.abuse.ch/api/v1/", {
      method: "POST",
      headers: { "Auth-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "search_ioc", search_term: d }),
      signal: AbortSignal.timeout(6000),
    });
    const j = await r.json();
    if (j?.query_status === "ok" && Array.isArray(j.data)) {
      const tam = j.data.some((x: { ioc?: string }) => {
        const ioc = String(x.ioc || "").toLowerCase().split(":")[0]; // port'u at
        return ioc === d || hostAyikla(ioc) === d;
      });
      if (tam) kaynaklar.push("ThreatFox (IOC)");
    }
  } catch {}
  return kaynaklar;
}

// Cloudflare güvenlik DNS'i (1.1.1.2 malware-engelleyen çözümleyici) — Cloudflare'ın
// tehdit istihbaratına ÜCRETSİZ, anahtarsız erişim. Zararlı bulduğu domaini 0.0.0.0'a
// çözer. Normal DNS'te çözülüp burada 0.0.0.0 dönüyorsa → Cloudflare zararlı diyor.
async function cloudflareGuvenlikDns(domain: string): Promise<boolean> {
  try {
    const r = await fetch(
      `https://security.cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
      { headers: { accept: "application/dns-json", ...UA }, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return false;
    const j = await r.json();
    const ans = (j?.Answer as { data?: string }[]) || [];
    // 0.0.0.0 = Cloudflare bu adresi malware/phishing olarak engelliyor.
    return ans.some((a) => a.data === "0.0.0.0");
  } catch {
    return false;
  }
}

// PhishStats — topluluk phishing veritabanı (ücretsiz, ANAHTARSIZ API). URL substring
// araması yapar; USOM gibi FP'yi önlemek için dönen URL'in HOST'u sorgulanan domaine
// BİREBİR eşit (ya da alt alanı) olmalı. Kurumsal filtrelerin yakaladığı ama USOM'un
// kaçırdığı bazı domainleri buradan da yakalayabiliriz.
async function phishStats(domain: string): Promise<boolean> {
  const d = domain.toLowerCase().replace(/^www\./, "");
  try {
    const r = await fetch(
      `https://api.phishstats.info/api/phishing?_where=(url,like,~${encodeURIComponent(d)}~)&_size=20&_sort=-id`,
      { headers: UA, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return false;
    const arr = await r.json();
    if (!Array.isArray(arr)) return false;
    return arr.some((x: { url?: string }) => {
      const h = hostAyikla(x.url || "");
      return h === d || (!!h && h.endsWith("." + d));
    });
  } catch {
    return false;
  }
}

// Google Safe Browsing — per-URL sorgu (opsiyonel, GSB anahtarı varsa).
async function safeBrowsing(domain: string): Promise<boolean> {
  const key = process.env.GOOGLE_SAFEBROWSING_KEY;
  if (!key) return false;
  try {
    const r = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(6000),
        body: JSON.stringify({
          client: { clientId: "sits-nazar", clientVersion: "1.0" },
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url: `http://${domain}` }, { url: `https://${domain}` }],
          },
        }),
      }
    );
    const j = await r.json();
    return Array.isArray(j?.matches) && j.matches.length > 0;
  } catch {
    return false;
  }
}

export type TehditSonuc = { kaynaklar: string[]; usom: boolean; usomTur?: string; usomKritiklik?: number };

// Bir domain'i tüm bilinen-kötü kaynaklarda ara. Hangi kaynakların işaretlediğini döndür.
export async function tehditKontrol(domain: string): Promise<TehditSonuc> {
  const itibarli = itibarliMi(domain);
  const [usomKayit, openphishSet, gsb, cf, abch, phst] = await Promise.all([
    usomLookup(domain),
    listeGetir("openphish", "https://openphish.com/feed.txt"),
    safeBrowsing(domain),
    itibarli ? Promise.resolve(false) : cloudflareGuvenlikDns(domain),
    itibarli ? Promise.resolve([] as string[]) : abuseCh(domain),
    itibarli ? Promise.resolve(false) : phishStats(domain),
  ]);

  const kaynaklar: string[] = [];
  if (usomKayit.listede) kaynaklar.push("USOM (resmi)");
  if (listedeMi(openphishSet, domain)) kaynaklar.push("OpenPhish");
  if (gsb) kaynaklar.push("Google Safe Browsing");
  if (cf) kaynaklar.push("Cloudflare");
  if (phst) kaynaklar.push("PhishStats");
  kaynaklar.push(...abch);

  return {
    kaynaklar,
    usom: usomKayit.listede,
    usomTur: usomKayit.tur,
    usomKritiklik: usomKayit.kritiklik,
  };
}
