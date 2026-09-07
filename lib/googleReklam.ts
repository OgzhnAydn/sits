// GOOGLE ADS İZLEME — resmî BigQuery açık veri seti (Ads Transparency Center).
// bigquery-public-data.google_ads_transparency_center.creative_stats.
// COST-SAFE: sorgu ~30GB tarar → ASLA istek-başına çalıştırmayız. Günde 1 kez TÜM
// markalar için TEK birleşik sorgu (~30GB → 1TB/ay ücretsiz kotanın altında),
// sonuç Firestore'a cache'lenir; panel cache'ten okur.
import crypto from "node:crypto";
import { AVCI_MARKALAR } from "./korunanMarkalar";
import { googleReklamKaydet, type GoogleReklam } from "./store";

type SAKey = { client_email: string; private_key: string; token_uri: string; project_id: string };
function keyOku(): SAKey | null {
  const raw = process.env.GCP_SA_KEY;
  if (!raw) return null;
  try { return JSON.parse(raw) as SAKey; } catch { return null; }
}

async function saToken(key: SAKey): Promise<string | null> {
  const b64u = (b: string) => Buffer.from(b).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const c = b64u(JSON.stringify({ iss: key.client_email, scope: "https://www.googleapis.com/auth/bigquery.readonly", aud: key.token_uri, exp: now + 3600, iat: now }));
  const sig = crypto.createSign("RSA-SHA256").update(`${h}.${c}`).sign(key.private_key).toString("base64url");
  try {
    const r = await fetch(key.token_uri, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${sig}` }), signal: AbortSignal.timeout(10000) });
    const j = (await r.json()) as { access_token?: string };
    return j.access_token || null;
  } catch { return null; }
}

type BQYanit = { rows?: { f: { v: string }[] }[]; totalBytesProcessed?: string; error?: { message?: string } };
async function bqSorgu(key: SAKey, tok: string, sql: string): Promise<BQYanit> {
  const r = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${key.project_id}/queries`, {
    method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql, useLegacySql: false, location: "US", timeoutMs: 60000, maxResults: 2000 }),
    signal: AbortSignal.timeout(75000),
  });
  return (await r.json()) as BQYanit;
}

// Türkçe-duyarlı sadeleştirme (aksan-katlama + noktalama→boşluk). "İ/I" toLowerCase
// tuzağını (birleşik nokta) önlemek için önce büyük harfleri elle çevirir.
function sadelestir(s = ""): string {
  return s
    .replace(/İ/g, "i").replace(/I/g, "i").replace(/Ş/g, "s").replace(/Ğ/g, "g").replace(/Ü/g, "u").replace(/Ö/g, "o").replace(/Ç/g, "c")
    .toLowerCase()
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Bir Google reklamverenini SINIFLANDIR — gürültüyü tehditten ayır (müşteriye yalnız
// gerçek istismarı göster). "ziraat"=tarım olduğundan "Ziraat Taksi Durağı" gibi farklı
// işletmeler ELENİR; gerçek tehdit banka/finans bağlamı ya da tam marka adıdır.
function reklamTuru(reklamveren: string, anahtar: string, markaAd: string, dogrulama: string, konu?: string): "tehdit" | "inceleme" | "ilgisiz" | "resmi" {
  if (dogrulama === "VERIFIED") return "resmi"; // Google kimlik-doğrulamış = gerçek marka/işletme
  const ad = sadelestir(reklamveren), key = sadelestir(anahtar), tam = sadelestir(markaAd);
  const kalan = ad.replace(tam, " ").replace(key, " ").replace(/\s+/g, " ").trim(); // markayı çıkar, geriye ne kalıyor
  const finans = /\b(bank|banka|kart|card|kredi|hesap|iban|sube|mobil|giris|basvuru|kampanya|destek|musteri|odeme|para|yatirim|finans|pay|wallet|cuzdan|loan|hediye|cekilis|bonus|promosyon)\b/.test(ad);
  const bayi = /\b(iletisim|telekom|bayi|shop|magaza|mobilya|servis|elektronik|bilisim|store)\b/.test(kalan) || /\(.+\)/.test(reklamveren);
  const digerIs = /\b(sanayi|ticaret|as|ltd|sti|duragi|taksi|emlak|nakliyat|otomotiv|market|gida|tarim|zirai|ciftlik|tohum|insaat|restoran|kuafor|petrol|turizm|tekstil|muhendislik|hafriyat|lojistik)\b/.test(ad);
  const konuIlgisiz = /hobb|game|oyun|art|entertain|eglence|sport|spor|food|yiyecek|seyahat|travel|book|kitap|pet|hayvan|guzellik|beauty|fitness|education|egitim|sinav/.test(sadelestir(konu || ""));
  const cokKelimeMarka = tam.includes(" ");
  if (finans) return "tehdit";                                        // net finans/bankacılık istismarı
  if (bayi) return "inceleme";                                        // yetkili bayi olabilir → incele
  if ((cokKelimeMarka && ad.includes(tam)) || kalan === "") return "tehdit"; // tam çok-kelimeli marka adı ya da reklamveren ≈ sadece marka
  if (digerIs || konuIlgisiz) return "ilgisiz";                       // farklı gerçek işletme / alakasız konu → gizle
  return "inceleme";                                                  // marka adı geçen ama belirsiz → incele
}
const TUR_ONCELIK: Record<string, number> = { tehdit: 0, inceleme: 1, resmi: 2, ilgisiz: 3 };

// Günlük birleşik tazeleme — tüm markaların Google Ads reklamverenlerini çeker,
// her reklamvereni sınıflandırır (tehdit/inceleme/ilgisiz/resmi), marka başına cache'ler.
export async function googleReklamTazele(): Promise<{ ok: boolean; taranan: number; marka: number; not: string }> {
  const key = keyOku();
  if (!key) return { ok: false, taranan: 0, marka: 0, not: "GCP_SA_KEY yok" };
  const tok = await saToken(key);
  if (!tok) return { ok: false, taranan: 0, marka: 0, not: "servis-hesabı token alınamadı" };

  // Yalnız ayırt edici (≥5 harf) marka anahtarları — kısa/yaygın olanlar gürültü yapar.
  const markalar = AVCI_MARKALAR.filter((m) => m.anahtar.length >= 5);
  const likeler = markalar.map((m) => `LOWER(advertiser_disclosed_name) LIKE '%${m.anahtar.replace(/'/g, "")}%'`).join(" OR ");
  const sql = `SELECT advertiser_disclosed_name AS ad, advertiser_legal_name AS yasal, advertiser_location AS konum, advertiser_verification_status AS dogrulama, ANY_VALUE(creative_page_url) AS url, ANY_VALUE(topic) AS konu
FROM \`bigquery-public-data.google_ads_transparency_center.creative_stats\`, UNNEST(region_stats) AS rs
WHERE rs.region_code='TR' AND (${likeler})
GROUP BY ad, yasal, konum, dogrulama
LIMIT 2000`;

  const j = await bqSorgu(key, tok, sql);
  if (j.error) return { ok: false, taranan: 0, marka: 0, not: "BigQuery hatası: " + (j.error.message || "").slice(0, 140) };
  const taranan = Number(j.totalBytesProcessed || 0);

  const perMarka: Record<string, GoogleReklam[]> = {};
  for (const row of j.rows || []) {
    const f = row.f.map((x) => x.v);
    const ad = String(f[0] || ""), adL = ad.toLowerCase();
    const dogrulama = String(f[3] || ""), konu = String(f[5] || "");
    // Sınıflandırma markaya bağlı (m.ad/m.anahtar) → her marka için ayrı kayıt.
    for (const m of markalar) {
      if (!adL.includes(m.anahtar)) continue;
      const tur = reklamTuru(ad, m.anahtar, m.ad, dogrulama, konu);
      // Firestore undefined'ı reddeder → boş alanları "" yaz.
      (perMarka[m.anahtar] ||= []).push({ reklamveren: ad, yasal: f[1] || "", konum: f[2] || "", dogrulama, url: f[4] || "", supheli: dogrulama !== "VERIFIED", tur, konu });
    }
  }
  let sayi = 0;
  for (const [marka, liste] of Object.entries(perMarka)) {
    liste.sort((a, b) => (TUR_ONCELIK[a.tur || "inceleme"] - TUR_ONCELIK[b.tur || "inceleme"]) || (Number(b.supheli) - Number(a.supheli)));
    await googleReklamKaydet(marka, liste);
    sayi++;
  }
  return { ok: true, taranan, marka: sayi, not: `${(taranan / 1e9).toFixed(1)} GB tarandı · ${sayi} marka güncellendi` };
}
