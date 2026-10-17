import { NextResponse } from "next/server";
import { cloakingKontrol } from "@/lib/trVantage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

// ÇOK-PROFİLLİ CLOAKING — bir adresi MASAÜSTÜ + MOBİL (+bot) gerçek tarayıcıda açıp farkı döndürür.
// Panel bu uçla "mobilde sahte, masaüstünde temiz"i iki ekran görüntüsüyle gösterir. RENDER_URL şart.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const domain = (u.searchParams.get("domain") || "")
    .toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ hata: "Geçersiz domain." }, { headers: CORS, status: 400 });
  }
  if (!process.env.RENDER_URL) {
    return NextResponse.json({ yok: true, sebep: "Render servisi yapılandırılmamış." }, { headers: CORS });
  }
  const c = await cloakingKontrol(domain).catch(() => null);
  if (!c) return NextResponse.json({ yok: true, sebep: "Render yanıt vermedi." }, { headers: CORS });
  return NextResponse.json(c, { headers: CORS });
}
