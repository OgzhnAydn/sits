// CDN ARKASINDAKİ GERÇEK ORIGIN SUNUCUYU BUL (de-cloaking).
// Bir site Cloudflare/Akamai vb. arkasındaysa görünen IP CDN'e aittir; asıl sunucu gizlidir.
// Takedown/hukuki işlem için asıl barındıranı ortaya çıkarmak gerekir. Birden çok SIZINTI
// yöntemini birleştiririz; hiçbiri %100 değildir → aday olarak, güven derecesiyle döndürülür.
//
//   1) PASİF DNS geçmişi — domain CDN'e geçmeden önceki A kayıtları (en güvenilir tarihsel iz).
//   2) MX kaydı IP'si — mail sunucusu genelde origin'de barınır, proxy'lenmez.
//   3) Proxy'siz ALT-ALANLAR (cpanel/webmail/ftp/direct…) — yöneticiler sık sık bunları
//      CDN arkasına almayı unutur → gerçek IP sızar.
//   4) SPF/TXT içinde geçen IP.
// Tüm adaylardan CDN IP'leri elenir; kalan non-CDN IP = olası gerçek origin.
import { mnemonicGecmis } from "./passiveDns";

const CDN_ORG = /cloudflare|akamai|fastly|cloudfront|amazon|\baws\b|google|incapsula|imperva|sucuri|stackpath|bunny|ddos-?guard|qrator|cachefly|edgecast|cdn77|keycdn|limelight|azion|gcore|g-core|section\.io|leaseweb cdn/i;

function ozelIp(ip: string): boolean {
  return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fe80|fc00|fd)/.test(ip);
}
async function json<T = unknown>(url: string, ms = 6000): Promise<T | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); return r.ok ? (await r.json()) as T : null; } catch { return null; }
}
async function dnsKayit(name: string, tip: string): Promise<string[]> {
  const j = await json<{ Answer?: { type: number; data: string }[] }>(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${tip}`, 5000);
  return ((j?.Answer as { type: number; data: string }[]) || []).map((x) => x.data).filter(Boolean);
}
async function aKaydi(name: string): Promise<string[]> {
  return (await dnsKayit(name, "A")).filter((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !ozelIp(ip));
}

// IP'nin ASN/org bilgisi (ip-api) — CDN mi, hangi sağlayıcı, ülke.
const ipBilgiOnbellek = new Map<string, { org: string; asn: string; ulke: string; cdn: boolean }>();
async function ipBilgi(ip: string): Promise<{ org: string; asn: string; ulke: string; cdn: boolean }> {
  if (ipBilgiOnbellek.has(ip)) return ipBilgiOnbellek.get(ip)!;
  const j = await json<{ as?: string; org?: string; isp?: string; country?: string }>(`http://ip-api.com/json/${ip}?fields=as,org,isp,country`, 5000);
  const org = String(j?.org || j?.isp || j?.as || "");
  const v = { org, asn: String(j?.as || ""), ulke: String(j?.country || ""), cdn: CDN_ORG.test(`${org} ${j?.as || ""} ${j?.isp || ""}`) };
  ipBilgiOnbellek.set(ip, v);
  return v;
}

export type OriginAday = { ip: string; kaynak: string; org: string; asn: string; ulke: string; guven: "yüksek" | "orta" | "düşük" };
export type OriginSonuc = {
  domain: string;
  mevcutCdn: boolean;             // görünen IP CDN mi
  mevcutIp: string | null;
  mevcutOrg: string;
  adaylar: OriginAday[];          // olası gerçek origin IP'leri (güven sırasıyla)
  not: string;
};

// Origin sık sızan proxy'siz alt-alanlar (cPanel/hosting varsayılanları + admin servisleri).
const SIZINTI_ALTALAN = ["cpanel", "webmail", "mail", "webdisk", "cpcalendars", "cpcontacts", "whm", "autodiscover", "autoconfig", "ftp", "direct", "direct-connect", "origin", "server", "cptexts", "ns1", "ns2", "smtp", "pop", "imap"];

export async function gercekOrigin(domainRaw: string): Promise<OriginSonuc> {
  const domain = String(domainRaw || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  const bos: OriginSonuc = { domain, mevcutCdn: false, mevcutIp: null, mevcutOrg: "", adaylar: [], not: "" };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { ...bos, not: "geçersiz alan adı" };

  const mevcut = (await aKaydi(domain))[0] || null;
  const mevcutInfo = mevcut ? await ipBilgi(mevcut) : { org: "", asn: "", ulke: "", cdn: false };

  // Aday toplama — her IP tek kez, en güçlü kaynak kazanır.
  const havuz = new Map<string, { kaynak: string; guven: OriginAday["guven"] }>();
  const ekle = (ip: string, kaynak: string, guven: OriginAday["guven"]) => {
    if (!ip || ozelIp(ip) || ip === mevcut) return; // mevcut (CDN) IP'yi aday sayma
    if (!havuz.has(ip)) havuz.set(ip, { kaynak, guven });
  };

  // 1) PASİF DNS geçmişi (CDN'den önceki IP'ler) — yüksek güven.
  try {
    const gecmis = await mnemonicGecmis(domain);
    for (const g of gecmis.slice(0, 12)) ekle(g.ip, "Pasif DNS geçmişi (CDN öncesi)", "yüksek");
  } catch { /* */ }

  // 2) MX kaydı IP'si — mail sunucusu origin'de olur (proxy'siz), yüksek güven.
  try {
    const mx = await dnsKayit(domain, "MX");
    const ilkMx = mx[0]?.split(/\s+/).pop()?.replace(/\.$/, "");
    if (ilkMx && !/(google|outlook|office365|yandex|zoho|mail\.ru|proton|amazonaws|mimecast|barracuda)/i.test(ilkMx)) {
      for (const ip of (await aKaydi(ilkMx)).slice(0, 2)) ekle(ip, `MX (mail sunucusu ${ilkMx})`, "yüksek");
    }
  } catch { /* */ }

  // 3) Proxy'siz alt-alan sızıntıları — orta güven (paralel, sınırlı).
  const altSonuc = await Promise.all(SIZINTI_ALTALAN.map(async (p) => ({ p, ips: await aKaydi(`${p}.${domain}`).catch(() => [] as string[]) })));
  for (const { p, ips } of altSonuc) for (const ip of ips.slice(0, 1)) ekle(ip, `Alt-alan sızıntısı (${p}.)`, "orta");

  // 4) SPF/TXT içindeki IP — düşük güven.
  try {
    const txt = await dnsKayit(domain, "TXT");
    for (const t of txt) { const m = t.match(/ip4:(\d+\.\d+\.\d+\.\d+)/g); if (m) for (const x of m.slice(0, 3)) ekle(x.replace("ip4:", ""), "SPF kaydı (ip4)", "düşük"); }
  } catch { /* */ }

  // CDN IP'lerini ele + org/asn zenginleştir. Kalan non-CDN = gerçek origin adayı.
  const adaylar: OriginAday[] = [];
  for (const [ip, meta] of havuz) {
    const bilgi = await ipBilgi(ip);
    if (bilgi.cdn) continue; // hâlâ CDN → origin değil
    adaylar.push({ ip, kaynak: meta.kaynak, org: bilgi.org, asn: bilgi.asn, ulke: bilgi.ulke, guven: meta.guven });
  }
  const sira = { "yüksek": 0, "orta": 1, "düşük": 2 };
  adaylar.sort((a, b) => sira[a.guven] - sira[b.guven]);

  const not = !mevcutInfo.cdn
    ? "Adres bir CDN arkasında görünmüyor — görünen IP zaten gerçek sunucu olabilir."
    : adaylar.length
      ? `${mevcutInfo.org || "CDN"} arkasında; ${adaylar.length} olası gerçek origin adayı bulundu (aşağıda). Kesin değildir — teyit gerekir.`
      : `${mevcutInfo.org || "CDN"} arkasında; sızıntı yöntemleriyle gerçek origin ORTAYA ÇIKARILAMADI (iyi yapılandırılmış). Passive DNS/cert kayıtları da CDN gösteriyor.`;

  return { domain, mevcutCdn: mevcutInfo.cdn, mevcutIp: mevcut, mevcutOrg: mevcutInfo.org, adaylar: adaylar.slice(0, 8), not };
}
