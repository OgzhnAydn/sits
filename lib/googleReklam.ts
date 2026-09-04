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

// Günlük birleşik tazeleme — tüm markaların Google Ads reklamverenlerini çeker,
// resmî-olmayan (UNVERIFIED) reklamvereni "şüpheli" işaretler, marka başına cache'ler.
export async function googleReklamTazele(): Promise<{ ok: boolean; taranan: number; marka: number; not: string }> {
  const key = keyOku();
  if (!key) return { ok: false, taranan: 0, marka: 0, not: "GCP_SA_KEY yok" };
  const tok = await saToken(key);
  if (!tok) return { ok: false, taranan: 0, marka: 0, not: "servis-hesabı token alınamadı" };

  // Yalnız ayırt edici (≥5 harf) marka anahtarları — kısa/yaygın olanlar gürültü yapar.
  const markalar = AVCI_MARKALAR.filter((m) => m.anahtar.length >= 5);
  const likeler = markalar.map((m) => `LOWER(advertiser_disclosed_name) LIKE '%${m.anahtar.replace(/'/g, "")}%'`).join(" OR ");
  const sql = `SELECT advertiser_disclosed_name AS ad, advertiser_legal_name AS yasal, advertiser_location AS konum, advertiser_verification_status AS dogrulama, ANY_VALUE(creative_page_url) AS url
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
    const dogrulama = String(f[3] || "");
    // Firestore undefined'ı reddeder → boş alanları "" yaz.
    const rek: GoogleReklam = { reklamveren: ad, yasal: f[1] || "", konum: f[2] || "", dogrulama, url: f[4] || "", supheli: dogrulama !== "VERIFIED" };
    for (const m of markalar) if (adL.includes(m.anahtar)) (perMarka[m.anahtar] ||= []).push(rek);
  }
  let sayi = 0;
  for (const [marka, liste] of Object.entries(perMarka)) {
    liste.sort((a, b) => Number(b.supheli) - Number(a.supheli));
    await googleReklamKaydet(marka, liste);
    sayi++;
  }
  return { ok: true, taranan, marka: sayi, not: `${(taranan / 1e9).toFixed(1)} GB tarandı · ${sayi} marka güncellendi` };
}
