import { NextRequest, NextResponse } from "next/server";
import { kalibrasyonDilim } from "@/lib/kalibrasyon";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Kalibrasyon — DİLİM halinde (client batch'ler çeker, 60sn cap'ini aşmaz).
// ?bas=<başlangıç>&adet=<kaç tane> → o dilimin sonuçları + toplam.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const bas = Math.max(0, parseInt(sp.get("bas") || "0", 10) || 0);
  const adet = Math.min(5, Math.max(1, parseInt(sp.get("adet") || "4", 10) || 4));
  try {
    const sonuc = await kalibrasyonDilim(bas, adet);
    return NextResponse.json(sonuc);
  } catch {
    return NextResponse.json({ hata: "Kalibrasyon dilimi tamamlanamadı." }, { status: 502 });
  }
}
