import { NextRequest, NextResponse } from "next/server";
import { eticaretTR } from "@/lib/eticaretTespit";

export const runtime = "nodejs";
export const maxDuration = 30;

// TR e-ticaret tespiti — "bu adres Türkiye'ye satış yapan e-ticaret sitesi mi ve ETBİS'te
// kayıtlı mı?" Kayıtsız-e-ticaret-aday radarının çekirdeği.
export async function GET(req: NextRequest) {
  const domain = (new URL(req.url).searchParams.get("domain") || "").trim();
  if (!domain) return NextResponse.json({ hata: "domain gerekli." }, { status: 400 });
  try {
    const sonuc = await eticaretTR(domain);
    return NextResponse.json(sonuc, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ hata: "analiz başarısız", detay: String((e as Error).message || e) }, { status: 500 });
  }
}
