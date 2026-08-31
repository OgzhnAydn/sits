// İzleme aboneliklerinde e-postayı DİNLENMEK için saklamak zorundayız (periyodik
// yeniden sorgu). Bu yüzden Firestore'da yalnız ŞİFRELİ hali durur; anahtar
// (IZLEME_SECRET) sadece sunucuda. Böylece veritabanı okunsa bile e-posta açığa
// çıkmaz. AES-256-GCM (kimlik doğrulamalı).

import crypto from "node:crypto";

function anahtar(): Buffer | null {
  const s = process.env.IZLEME_SECRET;
  if (!s) return null;
  return crypto.createHash("sha256").update(s).digest(); // 32 bayt
}

export const sifreVar = () => Boolean(process.env.IZLEME_SECRET);

export function sifrele(metin: string): string | null {
  const k = anahtar();
  if (!k) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(metin, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function coz(b64: string): string | null {
  const k = anahtar();
  if (!k) return null;
  try {
    const buf = Buffer.from(b64, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// E-postanın geri-döndürülemez kimliği (belge id / mükerrer aboneliği önlemek için).
export function epostaHash(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 40);
}
