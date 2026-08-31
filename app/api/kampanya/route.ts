import { NextRequest, NextResponse } from "next/server";
import { limitAsildi } from "@/lib/rateLimit";
import { normalize } from "@/lib/demoVeri";
import { kampanyaCozumle } from "@/lib/kampanya";

export const runtime = "nodejs";
export const maxDuration = 60; // çok kaynaklı kümeleme — uzun sürebilir

// Kampanya çözümleme: bir sahte domainden yola çıkıp AYNI operasyonun tüm
// parçalarını (kardeş domainler, IP/ASN, Telegram/exfil, zaman çizelgesi) haritalar.
export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "kampanya", 6); // pahalı → düşük kota
  if (limit) return limit;

  const { giris } = await req.json();
  if (!giris || typeof giris !== "string" || giris.trim().length < 4) {
    return NextResponse.json({ hata: "Bir alan adı (domain) girin." }, { status: 400 });
  }
  const { deger, tip } = normalize(giris);
  if (tip !== "url") {
    return NextResponse.json({ hata: "Kampanya çözümleme yalnızca site/domain için çalışır." }, { status: 400 });
  }

  try {
    const sonuc = await kampanyaCozumle(deger);
    return NextResponse.json(sonuc);
  } catch {
    return NextResponse.json({ hata: "Çözümleme tamamlanamadı, tekrar dene." }, { status: 502 });
  }
}
