import { NextRequest, NextResponse } from "next/server";
import { faviconMarkaEslesme } from "@/lib/faviconMarka";
import { domainOsint } from "@/lib/osint";
import { itibarliMi } from "@/lib/itibarli";
import { resmiMarkaDomaini } from "@/lib/korunanMarkalar";
import { markaAdayKaydet, markaGunlukArtir } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

// İÇERİK-tabanlı taklit tespiti: isim markayı içermese bile, favicon markanınkiyle
// birebir aynıysa → sahte. Worker, şüpheli-desen domainlerini buraya yollar.
// HAFİF: önce sadece favicon karşılaştırılır; eşleşmezse ucuz çıkış (domainOsint YOK).
function seviye(s: number) {
  return s >= 60 ? "Yüksek" : s >= 30 ? "Orta" : "Düşük";
}

export async function POST(req: NextRequest) {
  const sir = process.env.MARKA_ADAY_SECRET;
  if (!sir) return NextResponse.json({ hata: "Servis kapalı." }, { status: 503 });

  let body: { domain?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }
  if (body.secret !== sir) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });

  const domain = String(body.domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ hata: "Geçersiz domain." }, { status: 400 });
  }
  if (resmiMarkaDomaini(domain) || itibarliMi(domain)) {
    return NextResponse.json({ ok: true, eslesme: false, sebep: "resmi/itibarlı" });
  }

  // HAFİF ADIM: sadece favicon karşılaştır. Eşleşme yoksa burada dur (ucuz).
  const marka = await faviconMarkaEslesme(domain);
  if (!marka) return NextResponse.json({ ok: true, eslesme: false });

  // Favicon BİREBİR eşleşti → isim alakasız olsa bile güçlü taklit. Tam analiz + kaydet.
  let skor = 70;
  let sinyaller: string[] = [];
  try {
    const r = await domainOsint(domain);
    skor = Math.min(100, Math.max(70, r.risk + 30)); // favicon-kopya tek başına yüksek
    sinyaller = r.bulgular.slice(0, 4);
  } catch {
    /* analiz olmasa da favicon eşleşmesi yeterli */
  }
  sinyaller = [
    `İsim markayı içermese de, ${marka.ad}'ın favicon'unu (logosunu) BİREBİR kopyalamış — güçlü taklit işareti.`,
    ...sinyaller,
  ];

  await markaGunlukArtir(marka.anahtar, new Date().toISOString().slice(0, 10), true);
  await markaAdayKaydet({
    domain,
    marka: marka.anahtar,
    markaAdi: marka.ad,
    skor,
    seviye: seviye(skor),
    sinyaller,
    kaynak: "favicon",
    zaman: Date.now(),
  });

  return NextResponse.json({ ok: true, eslesme: true, marka: marka.ad, skor });
}
