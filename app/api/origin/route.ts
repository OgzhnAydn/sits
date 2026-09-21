import { NextRequest, NextResponse } from "next/server";
import { gercekOrigin } from "@/lib/originBul";

export const runtime = "nodejs";
export const maxDuration = 45;

// CDN arkasındaki GERÇEK origin sunucu (de-cloaking) — pasif DNS + MX + alt-alan + SPF sızıntıları.
export async function GET(req: NextRequest) {
  const domain = (new URL(req.url).searchParams.get("domain") || "").trim();
  if (!domain) return NextResponse.json({ hata: "domain gerekli." }, { status: 400 });
  try {
    const sonuc = await gercekOrigin(domain);
    return NextResponse.json(sonuc, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ hata: "analiz başarısız", detay: String((e as Error).message || e) }, { status: 500 });
  }
}
