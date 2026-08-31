import { NextRequest, NextResponse } from "next/server";
import { markaErkenlik } from "@/lib/store";
import { KORUNAN_MARKALAR, anahtarKok } from "@/lib/korunanMarkalar";

export const runtime = "nodejs";
export const maxDuration = 60;

// ERKENLİK PUANI — "markanızın tehditlerini USOM'dan kaç gün ÖNCE yakaladık?".
// ?marka=garanti  ya da  ?domain=garanti.com.tr
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  let marka = (u.searchParams.get("marka") || "").toLowerCase();
  const domain = (u.searchParams.get("domain") || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!marka && domain) {
    const m = KORUNAN_MARKALAR.find((x) => x.resmi.some((r) => domain === r || domain.endsWith("." + r)));
    marka = m?.anahtar || anahtarKok(domain);
  }
  if (!marka) return NextResponse.json({ hata: "marka ya da domain gerekli." }, { status: 400 });
  const erkenlik = await markaErkenlik(marka);
  const markaAdi = KORUNAN_MARKALAR.find((x) => x.anahtar === marka)?.ad || marka;
  return NextResponse.json({ marka, markaAdi, ...erkenlik });
}
