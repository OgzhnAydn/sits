import { NextRequest, NextResponse } from "next/server";
import { limitAsildi } from "@/lib/rateLimit";
import { sosyalBaglar } from "@/lib/sosyalProvider";

export const runtime = "nodejs";

// Dijital ayak izi (self-check): bir kullanıcı adı hangi platformlarda görünüyor.
// SINIR: yalnızca hesap↔platform İLİŞKİsi döner (WhatsMyName vb.). Kişisel veri
// (isim/e-posta/telefon) DÖNMEZ — bu, "kendi açık ayak izini gör" amaçlıdır,
// başkasını deşifre için değil. E-posta/telefon sızıntısı ayrı /api/sizinti'de.
export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "ayakizi", 15);
  if (limit) return limit;

  let kullanici = "";
  try {
    ({ kullanici } = await req.json());
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }
  const q = (typeof kullanici === "string" ? kullanici : "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{2,30}$/.test(q)) {
    return NextResponse.json({ hata: "Geçerli bir kullanıcı adı gir (2-30, harf/rakam/._-)." }, { status: 400 });
  }

  const saglayici = await sosyalBaglar(q, null);
  // Tüm sağlayıcılardan gelen hesapları birleştir, platforma göre tekilleştir.
  const harita = new Map<string, { platform: string; url?: string }>();
  for (const s of saglayici) {
    for (const h of s.hesaplar) {
      const anahtar = (h.url || h.platform).toLowerCase();
      if (!harita.has(anahtar)) harita.set(anahtar, { platform: h.platform, url: h.url });
    }
  }
  const hesaplar = [...harita.values()];
  return NextResponse.json({ kullanici: q, adet: hesaplar.length, hesaplar });
}
