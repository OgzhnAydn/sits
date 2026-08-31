import { NextRequest, NextResponse } from "next/server";
import { raporSonGetir } from "@/lib/store";

export const runtime = "nodejs";

// Abonenin en güncel günlük raporunu döndürür (pano için).
export async function GET(req: NextRequest) {
  const marka = (new URL(req.url).searchParams.get("marka") || "").toLowerCase();
  if (!marka) return NextResponse.json({ hata: "marka gerekli." }, { status: 400 });
  const rapor = await raporSonGetir(marka);
  return NextResponse.json({ rapor });
}
