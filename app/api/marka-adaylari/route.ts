import { NextRequest, NextResponse } from "next/server";
import { markaAdaylariGetir, markaAdaylariMarka, type MarkaAday } from "@/lib/store";
import { gercekTaklit, bilinenSahteler } from "@/lib/korunanMarkalar";

export const runtime = "nodejs";

// Müşteri paneli (ayrı origin) bu ucu okur → CORS açık (salt-okunur GET).
const CORS: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
export async function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

// Marka Taklit Avcısı — yakalanan sahte-site adayları (inceleme kuyruğu).
// GERÇEK taklit süzgeci: markanın kendi domainleri (vodafone.com/.gr alt alanları) ve
// marka adını başka kelimede taşıyanlar (paparazzi, kennisbank, autogarantia) gösterilmez.
// Düzeltmeden önce kaydedilmiş yanlış-pozitifler böylece okurken elenir.
// ?marka=X → O MARKAYA kilitli kokpit için: global "en yeni" listesi değil, markanın
// TÜM adayları (adayları eski olsa da kaçmasın). Marka yoksa → global son liste.
export async function GET(req: NextRequest) {
  const marka = (new URL(req.url).searchParams.get("marka") || "").trim().toLowerCase();
  const ham = marka ? await markaAdaylariMarka(marka, 300) : await markaAdaylariGetir(200);
  // STATİK bilinen sahteler (operatör-doğrulanmış içerik-kopyaları) — DB'de olmasa da göster.
  const statik = (marka ? bilinenSahteler(marka) : []) as unknown as MarkaAday[];
  const varOlan = new Set(ham.map((a) => a.domain));
  const birlesik = [...statik.filter((s) => !varOlan.has(s.domain)), ...ham];
  // DNS taraması adayları yazılırken zaten doğrulandı (DNS-CANLI + marka kalıbı + resmî DEĞİL +
  // itibarlı DEĞİL). Bu, operatör-onaylı (manuel) kadar sağlam bir ön-eleme → okurken tekrar strict
  // gercekTaklit'e takılıp "aradaki kayıplar" (gedizelektrik.com/.com.tr gibi gerçek taklitler)
  // gizlenmesin. Bilinen exact-isim FP tuzağı yazma-anında zaten elendiği için güvenli.
  // Not: "logo-gorsel" (salt-logo taklidi) adayları domain adında marka GEÇMEZ → gercekTaklit
  // onları eler; ama görsel AI logosu zaten güçlü kanıt + itibarlı/resmî domain yazma-anında elendi.
  const gecerli = birlesik.filter(
    (a) => a.manuel || a.kaynak === "dns-tarama" || a.kaynak === "logo-gorsel" || a.kaynak === "dork-url" || gercekTaklit(a.domain, a.marka),
  );
  const adaylar = marka ? gecerli.slice(0, 300) : gecerli.slice(0, 80);
  // ?incele=1 → elenenleri de göster (süzgeç kalitesini görmek için)
  if (new URL(req.url).searchParams.get("incele") === "1") {
    const elenen = ham.filter((a) => !gercekTaklit(a.domain, a.marka)).map((a) => ({ domain: a.domain, marka: a.marka, skor: a.skor }));
    return NextResponse.json({ taranan: ham.length, gosterilen: adaylar.length, elenen: elenen.length, elenenler: elenen }, { headers: CORS });
  }
  return NextResponse.json({ adaylar, taranan: ham.length, gosterilen: adaylar.length }, { headers: CORS });
}
