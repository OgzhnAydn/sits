import { NextRequest, NextResponse } from "next/server";
import { canlilikProbe, type CanlilikSonuc } from "@/lib/canlilik";

export const runtime = "nodejs";
export const maxDuration = 60;

// CANLILIK PROBE — bir domainin (GET) ya da bir grubun (POST) gerçek durumunu sondalar:
// Live / Redirect / Parked / Dead + kök neden. DNS + HTTP status + SSL eşzamanlı.
export async function GET(req: NextRequest) {
  const domain = (new URL(req.url).searchParams.get("domain") || "").trim();
  if (!domain) return NextResponse.json({ hata: "domain gerekli" }, { status: 400 });
  return NextResponse.json(await canlilikProbe(domain));
}

export async function POST(req: NextRequest) {
  let body: { domainler?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ hata: "geçersiz istek" }, { status: 400 }); }
  const doms = Array.from(new Set((body.domainler || []).filter((d) => typeof d === "string" && d).map((d) => d.toLowerCase()))).slice(0, 40);
  if (!doms.length) return NextResponse.json({ hata: "domainler gerekli" }, { status: 400 });
  // Eşzamanlılık sınırı (aynı anda 8) — probe I/O ağırlıklı; 40 domain ~5 tur, maxDuration içinde.
  const sonuc: CanlilikSonuc[] = [];
  const ES = 8;
  for (let i = 0; i < doms.length; i += ES) {
    const grup = await Promise.all(doms.slice(i, i + ES).map((d) => canlilikProbe(d).catch(() => null)));
    for (const g of grup) if (g) sonuc.push(g);
  }
  const ozet = { live: 0, redirect: 0, parked: 0, dead: 0, bilinmiyor: 0 } as Record<string, number>;
  for (const s of sonuc) ozet[s.durum] = (ozet[s.durum] || 0) + 1;
  return NextResponse.json({ sonuc, ozet });
}
