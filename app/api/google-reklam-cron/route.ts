import { NextRequest, NextResponse } from "next/server";
import { googleReklamTazele } from "@/lib/googleReklam";

export const runtime = "nodejs";
export const maxDuration = 60;

// GÜNLÜK Google Ads tazeleme — ayrı cron (izleme-cron'un yeniden-tarama bütçesini
// yemesin). Tek birleşik BigQuery sorgusu (~30GB, cache'liyse $0) → Firestore cache.
export async function GET(req: NextRequest) {
  const sir = process.env.CRON_SECRET;
  if (sir && req.headers.get("authorization") !== `Bearer ${sir}`) {
    return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  }
  const sonuc = await googleReklamTazele().catch((e) => ({ ok: false, taranan: 0, marka: 0, not: "hata: " + (e as Error).message?.slice(0, 100) }));
  return NextResponse.json(sonuc);
}
