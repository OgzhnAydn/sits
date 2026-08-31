import { NextRequest, NextResponse } from "next/server";
import { sifrele, sifreVar, epostaHash } from "@/lib/sifrele";
import { epostaIzlemeKaydet } from "@/lib/store";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";

// E-posta sızıntı izleme aboneliği. Anlık kontrol herkese açık (/guvenlik);
// bu uç, e-postayı ŞİFRELİ kaydeder ve periyodik rapora ekler.
export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "izle", 10);
  if (limit) return limit;
  if (!sifreVar()) {
    return NextResponse.json({ hata: "İzleme servisi henüz aktif değil." }, { status: 503 });
  }

  let body: { email?: string; periyot?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ hata: "Geçerli bir e-posta gir." }, { status: 400 });
  }
  const periyot = body.periyot === "aylik" ? "aylik" : "haftalik";
  const enc = sifrele(email);
  if (!enc) return NextResponse.json({ hata: "Servis hatası." }, { status: 503 });

  try {
    await epostaIzlemeKaydet(epostaHash(email), enc, periyot);
  } catch {
    return NextResponse.json({ hata: "Şu an kaydedilemedi (veritabanı kuralları henüz yayınlanmamış olabilir)." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, periyot });
}
