import { NextResponse } from "next/server";
import { KORUNAN_MARKALAR, AVCI_MARKALAR } from "@/lib/korunanMarkalar";
import { kullaniciMarkalariGetir } from "@/lib/store";

export const runtime = "nodejs";

// Hardcoded markalar + KULLANICI'nın kendi kaydettiği markalar birleşik döner.
// VARSAYILAN: anahtar-taraması güvenli olanlar (>=4 harf) — worker/hunt kısa
// anahtarlarda ("ern" → "modern", "intern") gürültü yapmasın.
// ?all=1: tam liste (kısa anahtarlar dahil) — UI dropdown'ı bunu kullanır.
export async function GET(req: Request) {
  const tumu = new URL(req.url).searchParams.get("all") === "1";
  const temel = tumu ? KORUNAN_MARKALAR : AVCI_MARKALAR;
  const anahtarlar = new Set(temel.map((m) => m.anahtar));
  const ozel = (await kullaniciMarkalariGetir())
    .filter((m) => !anahtarlar.has(m.anahtar) && (tumu || m.anahtar.length >= 4))
    .map((m) => ({ anahtar: m.anahtar, ad: m.ad, resmi: m.resmi }));
  return NextResponse.json({
    markalar: [...temel.map((m) => ({ anahtar: m.anahtar, ad: m.ad, resmi: m.resmi })), ...ozel],
  });
}
