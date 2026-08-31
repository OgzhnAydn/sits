// Google Gemini — ücretsiz katman (metin + görsel/Vision). Anahtar yoksa VEYA
// çağrı başarısızsa null döner; çağıran taraf kural-tabanlı yedeğe düşer.
// Maliyet: ücretsiz katman cömerttir; ayrıca çağıranlar "akıllı gating" ile
// AI'ı sadece gerektiğinde çağırır.

const KEY = process.env.GEMINI_API_KEY;
export const geminiVarMi = Boolean(KEY);

const MODEL = "gemini-flash-latest";
const YEDEK_MODEL = "gemini-flash-lite-latest"; // ana model "yüksek talep" derse

const KOK = "https://generativelanguage.googleapis.com/v1beta/models";

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

async function cagir(
  model: string,
  system: string,
  parts: Part[],
  json: boolean
): Promise<string | null> {
  if (!KEY) return null;
  try {
    const r = await fetch(`${KOK}/${model}:generateContent?key=${KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1200,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    if (r.status === 503 || r.status === 429) return null; // meşgul → yedeğe bırak
    const j = await r.json();
    if (j?.error) return null;
    return j?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

// Ana model + yedek model + kural-tabanlı yedek zinciri için tek nokta.
async function uret(system: string, parts: Part[], json: boolean): Promise<string | null> {
  return (await cagir(MODEL, system, parts, json)) ?? (await cagir(YEDEK_MODEL, system, parts, json));
}

export async function geminiMetin(system: string, user: string): Promise<string | null> {
  return uret(system, [{ text: user }], false);
}

// JSON modunda çağır ve ayrıştır. Şema uymaz/parse patlarsa null.
export async function geminiJson<T = unknown>(system: string, user: string): Promise<T | null> {
  const t = await uret(system, [{ text: user }], true);
  if (!t) return null;
  try {
    return JSON.parse(t) as T;
  } catch {
    // bazen ```json ... ``` sarmalı gelebilir
    const m = t.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
    return null;
  }
}

// Görsel (Vision): base64 görüntü + istem → metin. Ekran görüntüsü analizi için.
export async function geminiGorsel(
  system: string,
  user: string,
  base64: string,
  mime = "image/jpeg"
): Promise<string | null> {
  return uret(system, [{ text: user }, { inline_data: { mime_type: mime, data: base64 } }], false);
}

export async function geminiGorselJson<T = unknown>(
  system: string,
  user: string,
  base64: string,
  mime = "image/jpeg"
): Promise<T | null> {
  const t = await uret(
    system,
    [{ text: user }, { inline_data: { mime_type: mime, data: base64 } }],
    true
  );
  if (!t) return null;
  try {
    return JSON.parse(t) as T;
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
    return null;
  }
}
