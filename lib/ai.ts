// SİTS ortak AI (Claude) katmanı. Anahtar varsa Claude, yoksa çağıran taraf
// kendi kural-tabanlı yedeğini kullanır. Tüm AI özellikleri buradan geçer.

import Anthropic from "@anthropic-ai/sdk";

export const AI_MODELI = "claude-sonnet-5"; // yüksek-değerli (naratif, vision)
export const AI_HIZLI = "claude-haiku-4-5-20251001"; // ucuz (sınıflandırma)

export function aiVarMi(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function aiClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
}

function jsonAyikla(text: string): unknown {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b < 0) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}

// JSON döndüren yardımcı. Başarısızsa null → çağıran yedeğe düşer.
export async function aiJson<T = Record<string, unknown>>(p: {
  system: string;
  icerik: Anthropic.Messages.ContentBlockParam[] | string;
  model?: string;
  maxTokens?: number;
}): Promise<T | null> {
  const client = aiClient();
  if (!client) return null;
  try {
    const resp = await client.messages.create({
      model: p.model || AI_MODELI,
      max_tokens: p.maxTokens ?? 900,
      system: p.system,
      messages: [{ role: "user", content: p.icerik as Anthropic.Messages.MessageParam["content"] }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return jsonAyikla(text) as T | null;
  } catch {
    return null;
  }
}

// Düz metin döndüren yardımcı.
export async function aiMetin(p: {
  system: string;
  icerik: Anthropic.Messages.ContentBlockParam[] | string;
  model?: string;
  maxTokens?: number;
}): Promise<string | null> {
  const client = aiClient();
  if (!client) return null;
  try {
    const resp = await client.messages.create({
      model: p.model || AI_MODELI,
      max_tokens: p.maxTokens ?? 700,
      system: p.system,
      messages: [{ role: "user", content: p.icerik as Anthropic.Messages.MessageParam["content"] }],
    });
    return resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch {
    return null;
  }
}
