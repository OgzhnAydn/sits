import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs } from "firebase/firestore";
import { db, firebaseHazir } from "@/lib/firebase";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Gizli yönetim istatistiği — SADECE doğru ADMIN_KEY ile.
// "Gerçek kişi" = tarayıcının ürettiği UUID biçimli cihaz kimliği.
// Test/geliştirme kimlikleri (cihaz-A, testA, anon…) ayrı sayılır.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "istatistik", 30);
  if (limit) return limit;

  const { key } = await req.json();
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  }
  if (!firebaseHazir || !db) {
    return NextResponse.json({ hata: "Veritabanı bağlı değil." }, { status: 503 });
  }

  try {
    const gercek = new Set<string>();
    const hepsi = new Set<string>();
    let gostergeSayisi = 0;
    let toplamBildirim = 0;
    const enCok: { deger: string; tip: string; sayi: number; kategori: string | null }[] = [];
    // TAM KAYIT LİSTESİ: her giriş + ne zaman + kim (cihaz kimliği).
    const kayitlar: { tip: string; deger: string; kategori: string | null; nezaman: number | null; kim: string[]; sayi: number }[] = [];
    const ms = (t: unknown): number | null => {
      const o = t as { toMillis?: () => number; seconds?: number } | undefined;
      return o?.toMillis?.() ?? (typeof o?.seconds === "number" ? o.seconds * 1000 : null);
    };

    const gs = await getDocs(collection(db, "gostergeler"));
    gs.forEach((d) => {
      gostergeSayisi++;
      const x = d.data();
      const bildirim = Number(x.bildirimSayisi || 0);
      toplamBildirim += bildirim;
      const kim = [...new Set([...(x.soranlar || []), ...(x.bildirenler || [])].map(String))];
      for (const c of kim) {
        hepsi.add(c);
        if (UUID.test(c)) gercek.add(c);
      }
      kayitlar.push({
        tip: String(x.tip || "?"),
        deger: String(x.deger || d.id),
        kategori: x.kategori ?? null,
        nezaman: ms(x.sonSorgu) ?? ms(x.sonBildirim),
        kim,
        sayi: Number(x.sorulmaSayisi || x.bildirimSayisi || 0),
      });
      if (bildirim > 0) {
        enCok.push({ deger: String(x.deger || d.id), tip: String(x.tip || "?"), sayi: bildirim, kategori: x.kategori ?? null });
      }
    });

    // MESAJLAR (kampanya parmak izi — tam metin örneği saklanıyor).
    const ks = await getDocs(collection(db, "kampanyalar"));
    ks.forEach((d) => {
      const x = d.data();
      const kim = [...new Set((x.kaynaklar || []).map(String))] as string[];
      for (const c of kim) { hepsi.add(c); if (UUID.test(c)) gercek.add(c); }
      kayitlar.push({
        tip: "mesaj",
        deger: String(x.ornek || d.id),
        kategori: null,
        nezaman: ms(x.sonGorulme),
        kim,
        sayi: Number(x.sayi || 0),
      });
    });
    kayitlar.sort((a, b) => (b.nezaman ?? 0) - (a.nezaman ?? 0));

    let paylasimSayisi = 0;
    const ps = await getDocs(collection(db, "paylasimlar"));
    ps.forEach((d) => {
      paylasimSayisi++;
      const x = d.data();
      for (const c of x.bildirenler || []) {
        hepsi.add(c);
        if (UUID.test(String(c))) gercek.add(String(c));
      }
    });

    enCok.sort((a, b) => b.sayi - a.sayi);

    return NextResponse.json({
      gercekKisi: gercek.size,
      tumCihaz: hepsi.size,
      testCihaz: hepsi.size - gercek.size,
      gostergeSayisi,
      paylasimSayisi,
      toplamBildirim,
      enCok: enCok.slice(0, 10),
      kayitlar: kayitlar.slice(0, 400), // tam liste (ne zaman + kim)
    });
  } catch {
    return NextResponse.json({ hata: "İstatistik okunamadı." }, { status: 500 });
  }
}
