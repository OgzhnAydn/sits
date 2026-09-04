import { NextRequest, NextResponse } from "next/server";
import { reklamTara } from "@/lib/reklamTarama";

export const runtime = "nodejs";

// Reklam izleme — markayı taklit eden Meta (FB/Instagram) reklamları.
// META_AD_TOKEN yoksa "yapılandırılmadı" döner (uydurma üretmez).
export async function GET(req: NextRequest) {
  const marka = (new URL(req.url).searchParams.get("marka") || "").trim().toLowerCase();
  if (!marka) return NextResponse.json({ hata: "marka gerekli" }, { status: 400 });
  try {
    return NextResponse.json(await reklamTara(marka));
  } catch (e) {
    console.error("[reklam-tara hata]", (e as { stack?: string })?.stack || e);
    return NextResponse.json({ hata: "tarama yapılamadı" }, { status: 500 });
  }
}
