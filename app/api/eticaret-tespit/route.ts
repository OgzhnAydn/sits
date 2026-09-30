import { NextRequest, NextResponse } from "next/server";
import { eticaretTR } from "@/lib/eticaretTespit";
import { gorselSinifla } from "@/lib/siteSinifla";

export const runtime = "nodejs";
export const maxDuration = 45;

// TR e-ticaret tespiti — "bu adres Türkiye'ye satış yapan e-ticaret sitesi mi ve ETBİS'te
// kayıtlı mı?" Kayıtsız-e-ticaret-aday radarının çekirdeği. ?gorsel=1 → GÖRSEL analiz de ekle
// (ekran görüntüsü + Gemini Vision: alışveriş mi, kategori, ne satıyor).
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const domain = (u.searchParams.get("domain") || "").trim();
  const gorselIste = u.searchParams.get("gorsel") === "1";
  if (!domain) return NextResponse.json({ hata: "domain gerekli." }, { status: 400 });
  try {
    const [icerik, gorsel] = await Promise.all([
      eticaretTR(domain),
      gorselIste ? gorselSinifla(domain) : Promise.resolve(null),
    ]);
    return NextResponse.json({ ...icerik, gorsel }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ hata: "analiz başarısız", detay: String((e as Error).message || e) }, { status: 500 });
  }
}
