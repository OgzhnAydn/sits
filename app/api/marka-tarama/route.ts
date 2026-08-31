import { NextRequest, NextResponse } from "next/server";
import { markalariTara } from "@/lib/markaTarama";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Vercel-içi marka tarayıcı — CertStream worker'a alternatif (kart/sunucu yok).
// Elle tetikleme: /api/marka-tarama?key=<MARKA_ADAY_SECRET>
// Ayrıca günlük cron (rapor-uret) bunu çağırır.
export async function GET(req: NextRequest) {
  const sir = process.env.MARKA_ADAY_SECRET;
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!sir || key !== sir) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  try {
    const sonuc = await markalariTara();
    return NextResponse.json({ ok: true, ...sonuc });
  } catch {
    return NextResponse.json({ hata: "Tarama tamamlanamadı." }, { status: 500 });
  }
}
