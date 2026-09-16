import { NextRequest, NextResponse } from "next/server";
import { markaTaraTekil } from "@/lib/markaTarama";
import { KORUNAN_MARKALAR } from "@/lib/korunanMarkalar";
import { kullaniciMarkalariGetir } from "@/lib/store";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// TEK MARKAYI anlık aktif tara (operatör "Tara" butonu). Secret gerekmez çünkü yalnız
// KAYITLI bir markayı tarar (allowlist) + hız-sınırlı → kötüye kullanım sınırlı.
export async function GET(req: NextRequest) {
  const limit = limitAsildi(req, "marka-tara", 12);
  if (limit) return limit;
  const marka = (req.nextUrl.searchParams.get("marka") || "").trim().toLowerCase();
  // Hem hardcoded KORUNAN hem de KULLANICI'nın eklediği markaları çöz — aksi halde kullanıcı
  // markası (ör. tuvturk) "Bilinmeyen marka" dönüp "Şimdi Tara" hiç çalışmıyordu.
  let m = KORUNAN_MARKALAR.find((x) => x.anahtar === marka) as { anahtar: string; ad: string; resmi?: string[] } | undefined;
  if (!m) {
    const ozel = await kullaniciMarkalariGetir().catch(() => []);
    const u = ozel.find((x) => x.anahtar === marka && x.anahtar.length >= 4);
    if (u) m = { anahtar: u.anahtar, ad: u.ad, resmi: u.resmi };
  }
  if (!m) return NextResponse.json({ hata: "Bilinmeyen marka." }, { status: 400 });
  try {
    const sonuc = await markaTaraTekil({ anahtar: m.anahtar, ad: m.ad, resmi: m.resmi });
    return NextResponse.json({ ok: true, marka: m.anahtar, ...sonuc });
  } catch {
    return NextResponse.json({ hata: "Tarama tamamlanamadı." }, { status: 500 });
  }
}
