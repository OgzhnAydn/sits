import { NextRequest, NextResponse } from "next/server";
import { DEMO_KAYITLAR, normalize } from "@/lib/demoVeri";
import { gostergeSorgula } from "@/lib/store";
import { seedKontrol } from "@/lib/seed";
import { ESIK, GOSTER_ESIK } from "@/lib/esik";

export const runtime = "nodejs";

// durum: "dogrulandi" (>=ESIK farklı bildiren), "az" (1..ESIK-1),
//        "liste" (açık tehdit listesi), "yok" (bulunamadı)
export async function POST(req: NextRequest) {
  const { giris } = await req.json();
  if (!giris || typeof giris !== "string" || giris.trim().length < 3) {
    return NextResponse.json({ hata: "Bir numara, IBAN veya site girin." }, { status: 400 });
  }
  const { deger, tip } = normalize(giris);

  // 1) Kullanıcı bildirimleri (Firestore) — eşik uygulanır.
  const gercek = await gostergeSorgula(deger, tip);
  // TEK bildirim (benzersiz=1) "bulundu" sayılmaz → demo/seed/yok'a düşer.
  if (gercek && gercek.bulundu && gercek.benzersiz >= GOSTER_ESIK) {
    const durum = gercek.benzersiz >= ESIK ? "dogrulandi" : "az";
    return NextResponse.json({
      deger, tip, bulundu: true, durum,
      benzersiz: gercek.benzersiz, kategori: gercek.kategori, esik: ESIK, demo: false,
    });
  }

  // 2) Demo örnekleri (Firebase yoksa) — doğrulanmış sayılır.
  const kayit = DEMO_KAYITLAR.find(
    (k) => k.tip === tip && k.deger.toLowerCase() === deger.toLowerCase()
  );
  if (kayit) {
    return NextResponse.json({
      deger, tip, bulundu: true, durum: "dogrulandi",
      benzersiz: kayit.bildirimSayisi, kategori: kayit.kategori, esik: ESIK, demo: true,
    });
  }

  // 3) Açık tehdit listesi (tohum).
  if (seedKontrol(deger, tip)) {
    return NextResponse.json({
      deger, tip, bulundu: true, durum: "liste",
      benzersiz: 0, kategori: "Zararlı / oltalama site", esik: ESIK, demo: false,
    });
  }

  return NextResponse.json({
    deger, tip, bulundu: false, durum: "yok",
    benzersiz: 0, kategori: null, esik: ESIK, demo: false,
  });
}
