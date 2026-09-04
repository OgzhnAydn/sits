import { NextRequest, NextResponse } from "next/server";
import { appTara } from "@/lib/appTarama";

export const runtime = "nodejs";

// Mobil uygulama taraması — markayı taklit eden app'ler (iOS App Store, resmî API).
export async function GET(req: NextRequest) {
  const marka = (new URL(req.url).searchParams.get("marka") || "").trim().toLowerCase();
  if (!marka) return NextResponse.json({ hata: "marka gerekli" }, { status: 400 });
  try {
    return NextResponse.json(await appTara(marka));
  } catch (e) {
    console.error("[app-tara hata]", (e as { stack?: string })?.stack || e);
    return NextResponse.json({ hata: "tarama yapılamadı" }, { status: 500 });
  }
}
