import { NextResponse } from "next/server";
import { markaAdaylariGetir } from "@/lib/store";
import { gercekTaklit } from "@/lib/korunanMarkalar";

export const runtime = "nodejs";

// KONTROL ODASI özeti — sistem-geneli operatör görünümü: tüm markalar, sistem
// sağlığı, kanal durumu. (Son 400 tespit üzerinden anlık tablo.)
export async function GET() {
  const ham = await markaAdaylariGetir(400);
  const gecerli = ham.filter((a) => gercekTaklit(a.domain, a.marka));

  const perMarka: Record<string, { marka: string; markaAdi: string; toplam: number; aktif: number; canli: number; sonZaman: number }> = {};
  for (const a of gecerli) {
    const m = (perMarka[a.marka] ||= { marka: a.marka, markaAdi: a.markaAdi || a.marka, toplam: 0, aktif: 0, canli: 0, sonZaman: 0 });
    m.toplam++;
    if (a.durum === "aktif-tuzak") m.aktif++;
    if (a.durum === "canli" || a.durum === "aktif-tuzak") m.canli++;
    if ((a.zaman || 0) > m.sonZaman) m.sonZaman = a.zaman || 0;
  }
  const markalar = Object.values(perMarka).sort((x, y) => y.toplam - x.toplam);
  const sonTespit = gecerli.length ? Math.max(...gecerli.map((a) => a.zaman || 0)) : 0;
  const now = Date.now();
  const buGun = gecerli.filter((a) => a.zaman && now - a.zaman < 86400000).length;
  const sonlar = [...gecerli].sort((a, b) => (b.zaman || 0) - (a.zaman || 0)).slice(0, 25)
    .map((a) => ({ domain: a.domain, marka: a.markaAdi || a.marka, skor: a.skor, durum: a.durum || "", zaman: a.zaman || 0 }));

  const kanallar = {
    ios: true,
    android: true,
    google: Boolean(process.env.GCP_SA_KEY),
    meta: Boolean(process.env.META_AD_TOKEN),
  };

  return NextResponse.json({
    ozet: { toplam: gecerli.length, marka: markalar.length, buGun, sonTespit, aktif: gecerli.filter((a) => a.durum === "aktif-tuzak").length },
    markalar, sonlar, kanallar,
  });
}
