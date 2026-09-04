import { NextRequest, NextResponse } from "next/server";
import { raporPdf, type PdfRapor } from "@/lib/pdf/OsintRaporPdf";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

function refUret(): string {
  const yil = new Date().getFullYear();
  const rnd = Math.floor(100000 + Math.random() * 899999);
  return `MRL-${yil}-${rnd}`;
}

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "rapor", 10);
  if (limit) return limit;

  let rapor: PdfRapor;
  try {
    ({ rapor } = await req.json());
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }
  if (!rapor || typeof rapor.deger !== "string" || !Array.isArray(rapor.alanlar)) {
    return NextResponse.json({ hata: "Rapor verisi eksik." }, { status: 400 });
  }

  const refNo = refUret();
  const tarih = new Date().toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" });

  try {
    const pdf = await raporPdf(rapor, refNo, tarih);
    const bytes = new Uint8Array(pdf);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${refNo}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ hata: "PDF üretilemedi." }, { status: 500 });
  }
}
