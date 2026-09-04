import { NextRequest, NextResponse } from "next/server";
import { markaPanel } from "@/lib/panel";

export const runtime = "nodejs";

// Marka analitik paneli — günlük/haftalık/aylık tempo, kompozisyon, ortak-nokta,
// ülke, yükselmeler, sistem sağlığı. Hepsi gerçek saklı veriden (uydurma yok).
export async function GET(req: NextRequest) {
  const marka = (new URL(req.url).searchParams.get("marka") || "").trim().toLowerCase();
  if (!marka) return NextResponse.json({ hata: "marka gerekli" }, { status: 400 });
  try {
    const veri = await markaPanel(marka);
    return NextResponse.json(veri);
  } catch (e) {
    console.error("[marka-panel hata]", (e as { stack?: string })?.stack || e);
    return NextResponse.json({ hata: "panel üretilemedi" }, { status: 500 });
  }
}
