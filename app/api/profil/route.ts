import { NextRequest, NextResponse } from "next/server";
import { gostergeCikar } from "@/lib/analyze";
import { domainOsint, telefonOsint, ibanOsint } from "@/lib/osint";
import { kriptoOsint } from "@/lib/kripto";
import { gostergeSorgula, baglantilariGetir } from "@/lib/store";
import { ESIK, GOSTER_ESIK } from "@/lib/esik";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 45;

// Çok-varlıklı BİRLEŞİK RİSK PROFİLİ — bir dolandırıcılık vakasının tüm
// parçalarını (site + IBAN + telefon + kripto) ayrı ayrı analiz edip TEK skora
// ve ilişki bilgisine dönüştürür. "Kanıt değil, sinyallerin birleşimi."

type Varlik = {
  tip: string;
  deger: string;
  risk: number;
  seviye: "Yüksek" | "Orta" | "Düşük";
  ozet: string;
};

function seviye(r: number): "Yüksek" | "Orta" | "Düşük" {
  return r >= 60 ? "Yüksek" : r >= 30 ? "Orta" : "Düşük";
}

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "profil", 15);
  if (limit) return limit;

  const { metin } = await req.json();
  if (!metin || typeof metin !== "string" || metin.trim().length < 3) {
    return NextResponse.json({ hata: "Bir vaka metni ya da değer girin." }, { status: 400 });
  }

  const g = gostergeCikar(metin);
  const kayitlar = [
    ...g.url.map((v) => ({ tip: "url", deger: v })),
    ...g.iban.map((v) => ({ tip: "iban", deger: v })),
    ...g.telefon.map((v) => ({ tip: "telefon", deger: v })),
    ...g.kripto.map((v) => ({ tip: "kripto", deger: v })),
  ].slice(0, 8); // aşırı girdilere karşı sınır

  if (!kayitlar.length) {
    return NextResponse.json({ hata: "Metinde analiz edilecek site/IBAN/telefon/kripto bulunamadı." }, { status: 400 });
  }

  // Her varlığı PARALEL analiz et: OSINT + topluluk bildirimi.
  const varliklar: Varlik[] = await Promise.all(
    kayitlar.map(async (k): Promise<Varlik> => {
      let risk = 0;
      let ozet = "Belirgin sinyal yok.";
      try {
        let rap;
        if (k.tip === "url") rap = await domainOsint(k.deger.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
        else if (k.tip === "telefon") rap = await telefonOsint(k.deger);
        else if (k.tip === "kripto") rap = await kriptoOsint(k.deger);
        else rap = ibanOsint(k.deger);
        risk = Math.min(100, rap.risk);
        if (rap.bulgular.length) ozet = rap.bulgular[0];
        else if (rap.alanlar.length) ozet = `${rap.alanlar[0].ad}: ${rap.alanlar[0].deger}`;
      } catch {
        /* OSINT başarısız → nötr */
      }
      // Topluluk bildirimi varlığı güçlendirir
      const crowd = await gostergeSorgula(k.deger, k.tip);
      if (crowd?.bulundu && crowd.benzersiz >= GOSTER_ESIK) {
        if (crowd.benzersiz >= ESIK) {
          risk = Math.max(risk, 85);
          ozet = `${crowd.benzersiz} farklı kişi dolandırıcı olarak bildirdi.`;
        } else {
          risk = Math.max(risk, 35);
          ozet = `${crowd.benzersiz} kişi bildirmiş (doğrulanmadı). ${ozet}`;
        }
      }
      return { tip: k.tip, deger: k.deger, risk, seviye: seviye(risk), ozet };
    })
  );

  // BİRLEŞİK SKOR: en yüksek varlık temel; ek riskli varlıklar skoru büyütür
  // (birden çok kötü sinyal = organize dolandırıcılık işareti).
  const riskler = varliklar.map((v) => v.risk).sort((a, b) => b - a);
  let skor = riskler[0] || 0;
  for (let i = 1; i < riskler.length; i++) {
    if (riskler[i] >= 25) skor += Math.min(14, Math.round(riskler[i] * 0.2));
  }

  // İLİŞKİ: bu varlıklar daha önce BİRLİKTE bildirildi mi? (aynı altyapı)
  let organize = false;
  const iliskiler: { deger: string; tip: string; sayi: number }[] = [];
  try {
    const ilk = kayitlar[0];
    const bagli = await baglantilariGetir(ilk.deger, ilk.tip);
    if (bagli.length) {
      iliskiler.push(...bagli);
      skor += 10;
      organize = true;
    }
  } catch {}

  // Aynı vakada 3+ varlık birlikte girildiyse zaten örgütlü işaret
  if (kayitlar.length >= 3) organize = true;

  skor = Math.min(100, skor);

  return NextResponse.json({
    skor,
    seviye: seviye(skor),
    varliklar: varliklar.sort((a, b) => b.risk - a.risk),
    organize,
    iliskiler,
    varlikSayisi: kayitlar.length,
  });
}
