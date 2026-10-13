// ICANN CZDS (Centralized Zone Data Service) — onaylı gTLD zone dosyalarını işler.
// Zone dosyası = o uzantının TÜM kayıtlı domainleri (CT=cert'li, NRD=yeni-kayıt'tan FARKLI:
// park/sertifikasız/eski dahil TAM namespace). nrd-tara ile AYNI marka-eşleştirme motorunu
// kullanır → kaynak "zone". Kimlik: ICANN_USER + ICANN_PASS (hesap e-posta+parola; ayrı
// "API anahtarı" YOK). Anahtar yoksa dürüstçe "yapılandırılmadı" döner — uydurma YOK.
import { gunzipSync } from "fflate";
import { AVCI_MARKALAR, gercekTaklit, resmiMarkaDomaini } from "./korunanMarkalar";
import { itibarliMi } from "./itibarli";

const AUTH_URL = "https://account-api.icann.org/api/authenticate";
const LINKS_URL = "https://czds-api.icann.org/czds/downloads/links";

export const czdsYapilandi = Boolean(process.env.ICANN_USER && process.env.ICANN_PASS);

// Marka kalıpları (anahtar + açılımlar, ≥4 harf) — nrd-tara ile birebir aynı set.
const MARKA_KALIPLARI = AVCI_MARKALAR.map((m) => ({
  anahtar: m.anahtar, ad: m.ad,
  kaliplari: [m.anahtar, ...(m.kaliplari || [])].filter((k) => k && k.length >= 4),
}));

export type ZoneAday = { domain: string; marka: string; markaAdi: string };

// ICANN hesabıyla kimlik doğrula → ~24s geçerli JWT. Parola yalnız process.env'den okunur.
export async function czdsToken(): Promise<string | null> {
  const username = process.env.ICANN_USER, password = process.env.ICANN_PASS;
  if (!username || !password) return null;
  try {
    const r = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { accessToken?: string };
    return j.accessToken || null;
  } catch { return null; }
}

// Onaylı TLD'lerin zone indirme linkleri (dinamik — yeni onaylar otomatik gelir).
export async function czdsLinkler(token: string): Promise<{ url: string; tld: string }[]> {
  try {
    const r = await fetch(LINKS_URL, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return [];
    const links = (await r.json()) as string[];
    return (links || []).map((url) => ({ url, tld: (url.match(/\/([^/]+)\.zone$/i)?.[1] || url.split("/").pop() || "").toLowerCase() }));
  } catch { return []; }
}

// Bir zone METNİNDEN marka taklidi domainleri çıkar (NS sahip-adı satırları).
// nrd-tara süzgeci: marka kalıbı içerir + gercekTaklit (FP) + resmî DEĞİL + itibarlı DEĞİL.
// Bellek sınırı: satır-satır tarar, yalnız EŞLEŞENLERİ tutar (tüm domainleri biriktirmez).
export function zoneMetinEslesme(metin: string): ZoneAday[] {
  const gorulen = new Set<string>();
  const out: ZoneAday[] = [];
  // Zone master-format: "<domain>. [ttl] [in] ns <nameserver>." → sahip = delege domain.
  const re = /^(\S+?)\.\s+(?:\d+\s+)?(?:in\s+)?ns\s+/i;
  for (const satir of metin.split(/\r?\n/)) {
    const m = re.exec(satir);
    if (!m) continue;
    const dom = m[1].toLowerCase();
    if (!dom || gorulen.has(dom) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) continue;
    // Hızlı ön-filtre: herhangi bir marka kalıbını içeriyor mu?
    let eslesen: { anahtar: string; ad: string } | null = null;
    for (const mk of MARKA_KALIPLARI) {
      if (mk.kaliplari.some((k) => dom.includes(k))) {
        if (gercekTaklit(dom, mk.anahtar) && !resmiMarkaDomaini(dom) && !itibarliMi(dom)) eslesen = { anahtar: mk.anahtar, ad: mk.ad };
        break; // bir kalıba değdi → diğer markalara bakma (nrd-tara ile aynı davranış)
      }
    }
    gorulen.add(dom);
    if (eslesen) out.push({ domain: dom, marka: eslesen.anahtar, markaAdi: eslesen.ad });
  }
  return out;
}

// Tek bir zone'u indir + aç + eşleştir. Vercel bellek/süre sınırı için boyut kapısı:
// Content-Length > maxGzMB (gz) ise ATLA (büyük zone → Fly worker). Döner: {atlandi, boyutMB, adaylar}.
export async function zoneTaraTek(url: string, token: string, maxGzMB = 8): Promise<{ atlandi: boolean; boyutMB: number; adaylar: ZoneAday[]; hata?: string }> {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(90000) });
    if (!r.ok) return { atlandi: false, boyutMB: 0, adaylar: [], hata: `indirilemedi (${r.status})` };
    const uz = Number(r.headers.get("content-length") || 0);
    const boyutMB = uz ? +(uz / 1048576).toFixed(1) : 0;
    if (uz && uz > maxGzMB * 1048576) return { atlandi: true, boyutMB, adaylar: [] }; // büyük → Fly'a bırak
    const gz = new Uint8Array(await r.arrayBuffer());
    const gerçekMB = +(gz.length / 1048576).toFixed(1);
    if (gz.length > maxGzMB * 1048576) return { atlandi: true, boyutMB: gerçekMB, adaylar: [] }; // Content-Length yoksa gerçek boyutla da kontrol
    const metin = new TextDecoder().decode(gunzipSync(gz));
    return { atlandi: false, boyutMB: boyutMB || gerçekMB, adaylar: zoneMetinEslesme(metin) };
  } catch (e) {
    return { atlandi: false, boyutMB: 0, adaylar: [], hata: String((e as Error)?.message || e) };
  }
}
