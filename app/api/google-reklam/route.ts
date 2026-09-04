import { NextRequest, NextResponse } from "next/server";
import { googleReklamGetir } from "@/lib/store";

export const runtime = "nodejs";

// Google Ads (BigQuery Transparency) — marka başına CACHE'lenmiş reklam listesi.
// Canlı BigQuery ÇAĞIRMAZ (maliyet); günlük cron'un yazdığı cache'i okur.
export async function GET(req: NextRequest) {
  const marka = (new URL(req.url).searchParams.get("marka") || "").trim().toLowerCase();
  if (!marka) return NextResponse.json({ hata: "marka gerekli" }, { status: 400 });
  const c = await googleReklamGetir(marka);
  const yapilandirildi = Boolean(process.env.GCP_SA_KEY);
  if (!c) return NextResponse.json({ yapilandirildi, reklamlar: [], supheli: 0, guncelleme: 0, not: yapilandirildi ? "Henüz veri yok (günlük tazeleme çalışınca dolar)." : "Google Ads izleme için GCP_SA_KEY gerekli." });
  return NextResponse.json({ yapilandirildi: true, reklamlar: c.reklamlar, supheli: c.reklamlar.filter((r) => r.supheli).length, guncelleme: c.guncelleme, not: "Google Ads Transparency (BigQuery) — günlük tazelenir." });
}
