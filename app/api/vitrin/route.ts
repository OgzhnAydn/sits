import { NextResponse } from "next/server";
import { analizlerGetir, type AnalizKaydi } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// VİTRİN — MirLeon tanıtım sitesi için GERÇEK son tespitler (public, CORS açık).
// Yalnız yüksek-kaliteli tehditleri döner: risk≥70 + bir tehdit kategorisi Yüksek/Orta.
// Böylece landing "örnek" değil GERÇEK, en-yeni yakalamaları gösterir. Uydurma YOK.
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}

export async function GET(req: Request) {
  const n = Math.min(24, Math.max(1, Number(new URL(req.url).searchParams.get("n")) || 12));
  const ham = await analizlerGetir(150).catch(() => [] as AnalizKaydi[]);

  const alan = (k: AnalizKaydi, ...adlar: string[]) => {
    for (const ad of adlar) { const f = (k.alanlar || []).find((x) => x.ad === ad); if (f?.deger) return f.deger; }
    return "";
  };
  // En güçlü (Yüksek > Orta) tehdit kategorisini seç; "Yok" olanları atla.
  const ustKategori = (k: AnalizKaydi) =>
    (k.kategoriler || []).find((c) => c.seviye === "Yüksek") || (k.kategoriler || []).find((c) => c.seviye === "Orta");

  const gorulen = new Set<string>();
  const tespitler: {
    domain: string; risk: number; seviye: string; kategori: string; icerik: string; altyapi: string; zaman: number; ekran?: string;
  }[] = [];

  for (const k of ham) {
    const dom = (k.domain || "").toLowerCase();
    if (!dom || gorulen.has(dom)) continue;
    const kat = ustKategori(k);
    // GERÇEK, yüksek-kaliteli tehdit filtresi (vitrin kalitesi). Resmî/temiz zaten risk<70.
    if ((k.risk || 0) < 70 || !kat) continue;
    gorulen.add(dom);
    tespitler.push({
      domain: dom,
      risk: k.risk,
      seviye: k.seviye || "Yüksek",
      kategori: kat.ad, // "Kimlik Avı" / "Marka Taklidi" …
      icerik: alan(k, "Site durumu", "Sayfa durumu", "Sayfa içeriği", "Sayfa başlığı") || "Aktif tehdit içeriği",
      altyapi: alan(k, "Barındırma", "Ağ (ASN)", "Sunucu ülkesi") || "—",
      zaman: k.zaman || 0,
      ...(k.ekranGoruntusu ? { ekran: k.ekranGoruntusu } : {}),
    });
    if (tespitler.length >= n) break;
  }

  return NextResponse.json({ adet: tespitler.length, tespitler }, { headers: CORS });
}
