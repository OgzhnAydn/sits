import { NextRequest, NextResponse } from "next/server";
import { destekTalepKaydet } from "@/lib/store";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";

// UZMANA İLET — AI çözemeyince konuşma + özet insan kuyruğuna (Firestore destek_talep) yazılır.
export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "destek-talep", 10);
  if (limit) return limit;

  let body: { marka?: string; markaAdi?: string; ozet?: string; iletisim?: string; konusma?: { role: string; content: string }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }

  const talepNo = await destekTalepKaydet({
    marka: String(body.marka || ""),
    markaAdi: String(body.markaAdi || ""),
    ozet: String(body.ozet || ""),
    iletisim: body.iletisim ? String(body.iletisim) : undefined,
    konusma: Array.isArray(body.konusma) ? body.konusma : [],
  });

  if (!talepNo) return NextResponse.json({ ok: false, hata: "Talep kaydedilemedi (depo kapalı)." }, { status: 503 });
  return NextResponse.json({ ok: true, talepNo });
}
