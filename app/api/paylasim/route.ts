import { NextRequest, NextResponse } from "next/server";
import { paylasimKaydet } from "@/lib/store";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "paylasim", 30);
  if (limit) return limit;

  let icerik = "";
  let cihazId = "anon";
  try {
    ({ icerik, cihazId } = await req.json());
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }
  if (!icerik || typeof icerik !== "string" || icerik.trim().length < 3) {
    return NextResponse.json({ sayi: 0 });
  }
  const sayi = await paylasimKaydet(icerik.trim(), cihazId || "anon");
  return NextResponse.json({ sayi });
}
