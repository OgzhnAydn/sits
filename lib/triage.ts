// Hatching Triage (tria.ge) — yakalanan sahte APK'yı (bankacılık trojanı) SANAL MAKİNEDE
// çalıştırıp davranış raporu çıkarır: tehlike skoru, malware ailesi, davranış imzaları, C2 adresleri.
// TRIAGE_KEY gerekir (ücretsiz katman: tria.ge → kaydol → Account → API key). Anahtar yoksa null
// döner (dürüst — uydurma rapor ÜRETMEYİZ). Web-sayfası render'ımızdan FARKLI: bu DOSYA detonasyonu.
const KOK = "https://tria.ge/api/v0";
const KEY = process.env.TRIAGE_KEY;
export const triageYapilandi = Boolean(KEY);

export type TriageOzet = {
  id: string;
  durum: string;        // reported | running | pending | failed | bilinmiyor
  skor?: number;        // 0-10 (Triage tehlike skoru)
  aile?: string[];      // malware ailesi (anubis, cerberus, hydra…)
  imzalar?: string[];   // tetiklenen davranış imzaları
  c2?: string[];        // çıkarılan komuta-kontrol (C2) adresleri
  link: string;         // insan-okur tria.ge rapor sayfası
};

async function tg(path: string, init?: RequestInit): Promise<unknown | null> {
  if (!KEY) return null;
  try {
    const r = await fetch(`${KOK}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init?.headers || {}) },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// APK URL'ini Triage'a gönder — kind "fetch" = URL'i İNDİRİP dosya olarak patlat (browse değil).
// Döner: sample id (sonra rapor bununla çekilir) ya da null.
export async function triageGonder(apkUrl: string): Promise<string | null> {
  if (!KEY || !/^https?:\/\//i.test(apkUrl)) return null;
  const j = (await tg("/samples", { method: "POST", body: JSON.stringify({ kind: "fetch", url: apkUrl, interactive: false }) })) as { id?: string } | null;
  return j?.id || null;
}

// Rapor özeti. Detonasyon dakikalar sürer → hazır değilse durum "running"/"pending" döner
// (skor/aile boş). Hazırsa ("reported") overview.json'dan normalize edilmiş özet döner.
export async function triageOzet(id: string): Promise<TriageOzet | null> {
  if (!KEY || !id) return null;
  const link = `https://tria.ge/${id}`;
  const s = (await tg(`/samples/${id}`)) as { status?: string } | null;
  const durum = s?.status || "bilinmiyor";
  if (durum !== "reported") return { id, durum, link };

  const o = (await tg(`/samples/${id}/overview.json`)) as Record<string, unknown> | null;
  if (!o) return { id, durum, link };

  const analysis = (o.analysis || {}) as { score?: number; tags?: string[] };
  const skor = typeof analysis.score === "number" ? analysis.score : (typeof (o.score as number) === "number" ? (o.score as number) : undefined);

  const aileSet = new Set<string>();
  const ekleFamily = (v: unknown) => { if (!v) return; for (const f of (Array.isArray(v) ? v : [v])) aileSet.add(String(f)); };
  const ekleTag = (tag: unknown) => { const m = String(tag).match(/^family:(.+)/i); if (m) aileSet.add(m[1]); };
  for (const t of ((o.targets as { family?: unknown; tags?: unknown[] }[]) || [])) { ekleFamily(t.family); for (const tag of (t.tags || [])) ekleTag(tag); }
  for (const tag of (analysis.tags || [])) ekleTag(tag);

  const imzalar = (((o.signatures as { name?: string; label?: string; score?: number }[]) || [])
    .slice().sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((x) => x.name || x.label).filter(Boolean) as string[]).slice(0, 6);

  const c2Set = new Set<string>();
  for (const e of ((o.extracted as { config?: { c2?: unknown[] } }[]) || [])) {
    const c = e?.config?.c2;
    if (Array.isArray(c)) for (const x of c) c2Set.add(String(x));
  }

  return { id, durum, skor, aile: [...aileSet].slice(0, 4), imzalar, c2: [...c2Set].slice(0, 8), link };
}
