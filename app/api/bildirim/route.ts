import { NextRequest, NextResponse } from "next/server";
import { bildirimIsaretle } from "@/lib/store";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";

// USOM'A BİLDİRİM İŞARETİ — operatör "USOM'a Bildir" dediğinde adaya bildirim tarihi yazar.
// "Kapatıldı" burada İDDİA EDİLMEZ; usomda/dead sinyaliyle sonradan DERİVE edilir.
export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "bildirim", 30);
  if (limit) return limit;
  let body: { domain?: string; kaynak?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ hata: "geçersiz istek" }, { status: 400 }); }
  const domain = String(body.domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return NextResponse.json({ hata: "geçersiz domain" }, { status: 400 });
  await bildirimIsaretle(domain, body.kaynak);
  return NextResponse.json({ ok: true, domain, zaman: Date.now() });
}
