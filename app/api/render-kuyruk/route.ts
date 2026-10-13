import { NextRequest, NextResponse } from "next/server";
import { markaAdaylariGetir, type MarkaAday } from "@/lib/store";
import { gercekTaklit } from "@/lib/korunanMarkalar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RENDER KUYRUĞU — Fly render-worker'ı bunu sorgular: gerçek-tarayıcıda açılması gereken
// (render'ı HİÇ olmayan ya da BAYAT) aktif adayları döner. Worker her birini Chromium'da
// açıp /api/render-sonuc'a yazar → "yakalanan her link kısa sürede otomatik render edilir".
// Yetki: MARKA_ADAY_SECRET (diğer worker'larla aynı sır).
const BAYAT_MS = 12 * 3600 * 1000; // render 12 saatten eskiyse yeniden render

export async function GET(req: NextRequest) {
  const sir = process.env.RENDER_WORKER_SECRET || process.env.MARKA_ADAY_SECRET;
  if (!sir) return NextResponse.json({ hata: "Servis kapalı." }, { status: 503 });
  const u = new URL(req.url);
  const verilen = u.searchParams.get("secret") || (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (verilen !== sir) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  const n = Math.min(20, Math.max(1, Number(u.searchParams.get("n")) || 8));

  const ham = await markaAdaylariGetir(300).catch(() => [] as MarkaAday[]);
  const now = Date.now();
  const gecerli = ham.filter((a) => gercekTaklit(a.domain, a.marka));
  const bekleyen = gecerli
    .filter((a) => !a.render || !a.render.zaman || (now - a.render.zaman) > BAYAT_MS)
    // öncelik: hiç render edilmemiş > en yüksek skor > en yeni
    .sort((a, b) => (a.render ? 1 : 0) - (b.render ? 1 : 0) || (b.skor || 0) - (a.skor || 0) || (b.zaman || 0) - (a.zaman || 0))
    .slice(0, n)
    .map((a) => ({ domain: a.domain, marka: a.marka }));

  return NextResponse.json({ adaylar: bekleyen, _tani: { toplam: ham.length, gecerli: gecerli.length, bekleyen: bekleyen.length } }, { headers: { "Cache-Control": "no-store" } });
}
