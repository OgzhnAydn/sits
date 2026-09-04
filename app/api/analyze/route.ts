import { NextRequest, NextResponse } from "next/server";
import { analizEt } from "@/lib/analyze";
import { bildirimKaydet, kampanyaKaydet } from "@/lib/store";
import { imzaCikar } from "@/lib/kampanyaImza";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";

function referansUret(): string {
  const yil = new Date().getFullYear();
  const rnd = Math.floor(10000 + Math.random() * 89999);
  return `MRL-${yil}-${rnd}`;
}

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "analyze", 15);
  if (limit) return limit;

  try {
    const { metin, bildirenId, secilenKategori } = await req.json();
    if (!metin || typeof metin !== "string" || metin.trim().length < 5) {
      return NextResponse.json(
        { hata: "Lütfen olayı biraz daha açıklayın." },
        { status: 400 }
      );
    }
    const analiz = await analizEt(metin.trim(), typeof secilenKategori === "string" ? secilenKategori : undefined);
    const referansNo = referansUret();

    // Firebase varsa: raporu ve göstergeleri kaydet (döngüyü kapatır).
    let kaydedildi = false;
    try {
      kaydedildi = await bildirimKaydet(analiz, referansNo, bildirenId || "anon");
      // İnsan bunu dolandırıcılık diye bildirdi → kampanya imzasını öğren.
      // Dolandırıcı yarın domaini değiştirse bile aynı kalıbı yakalarız.
      const { imza, yol } = imzaCikar(metin, analiz.gostergeler.url);
      if (imza) await kampanyaKaydet(imza, metin, yol, bildirenId || "anon");
    } catch {
      kaydedildi = false;
    }

    return NextResponse.json({
      ...analiz,
      referansNo,
      kaydedildi,
      tarih: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ hata: "Analiz başarısız oldu." }, { status: 500 });
  }
}
