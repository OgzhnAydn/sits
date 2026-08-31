import { NextRequest, NextResponse } from "next/server";
import { analizlerGetir } from "@/lib/store";

export const runtime = "nodejs";

// KANIT DEPOSU — kaydedilen tüm domain analizleri (yakalanan link + sonucumuz).
// Halka açık pano: risk/seviye/bulgular. En yeni önce.
export async function GET(req: NextRequest) {
  const n = Math.min(500, Math.max(1, Number(new URL(req.url).searchParams.get("n")) || 200));
  const kayitlar = await analizlerGetir(n);
  return NextResponse.json({ adet: kayitlar.length, kayitlar });
}
