import { NextRequest, NextResponse } from "next/server";
import { markaAdaylariGetir } from "@/lib/store";
import { gercekTaklit } from "@/lib/korunanMarkalar";

export const runtime = "nodejs";

// Marka Taklit Avcısı — yakalanan sahte-site adayları (inceleme kuyruğu).
// GERÇEK taklit süzgeci: markanın kendi domainleri (vodafone.com/.gr alt alanları) ve
// marka adını başka kelimede taşıyanlar (paparazzi, kennisbank, autogarantia) gösterilmez.
// Düzeltmeden önce kaydedilmiş yanlış-pozitifler böylece okurken elenir.
export async function GET(req: NextRequest) {
  const ham = await markaAdaylariGetir(200);
  const adaylar = ham.filter((a) => gercekTaklit(a.domain, a.marka)).slice(0, 80);
  // ?incele=1 → elenenleri de göster (süzgeç kalitesini görmek için)
  if (new URL(req.url).searchParams.get("incele") === "1") {
    const elenen = ham.filter((a) => !gercekTaklit(a.domain, a.marka)).map((a) => ({ domain: a.domain, marka: a.marka, skor: a.skor }));
    return NextResponse.json({ taranan: ham.length, gosterilen: adaylar.length, elenen: elenen.length, elenenler: elenen });
  }
  return NextResponse.json({ adaylar, taranan: ham.length, gosterilen: adaylar.length });
}
