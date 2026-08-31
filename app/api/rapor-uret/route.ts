import { NextRequest, NextResponse } from "next/server";
import {
  abonelerGetir,
  markaAdaylariGetir,
  markaGunlukGetir,
  raporKaydet,
  type MarkaAday,
} from "@/lib/store";
import { markalariTara } from "@/lib/markaTarama";

export const runtime = "nodejs";
export const maxDuration = 60;

// Günlük Marka Koruma raporunu üretir. Vercel Cron (günde 1) çağırır.
// Güvenlik: CRON_SECRET tanımlıysa Authorization: Bearer <secret> beklenir
// (Vercel cron bu başlığı otomatik ekler). Elle test için de aynı başlık.
export async function GET(req: NextRequest) {
  const sir = process.env.CRON_SECRET;
  if (sir && req.headers.get("authorization") !== `Bearer ${sir}`) {
    return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  }

  // ÖNCE marka taraması (yeni adayları bul) — sonra rapor üret. Böylece ayrı bir
  // CertStream worker / sunucu olmadan kuyruk her gün kendiliğinden dolar.
  try { await markalariTara(); } catch {}

  const tarih = new Date().toISOString().slice(0, 10);
  const aboneler = await abonelerGetir();
  if (!aboneler.length) return NextResponse.json({ ok: true, sayi: 0, not: "abone yok" });

  const tumAdaylar = await markaAdaylariGetir(300);
  const now = Date.now();
  const GUN = 24 * 3600 * 1000;

  let uretilen = 0;
  for (const ab of aboneler) {
    const brand = tumAdaylar.filter((a: MarkaAday) => a.marka === ab.marka && now - a.zaman < GUN);
    const yuksek = brand.filter((a) => a.skor >= 60).sort((x, y) => y.skor - x.skor);
    const orta = brand.filter((a) => a.skor >= 30 && a.skor < 60);
    const stat = await markaGunlukGetir(ab.marka, tarih);

    await raporKaydet({
      marka: ab.marka,
      markaAdi: ab.markaAdi,
      tarih,
      eslesme: stat.eslesme,
      analiz: stat.eslesme, // analiz ettiğimiz = eşleşen (hepsini analiz ediyoruz)
      yuksek,
      orta,
      temiz: yuksek.length === 0,
      zaman: now,
    });
    uretilen++;
  }

  return NextResponse.json({ ok: true, sayi: uretilen, tarih });
}
