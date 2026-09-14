import { NextRequest, NextResponse } from "next/server";
import { bahisImzasi } from "@/lib/bahis";
import { usomBiliniyor } from "@/lib/usom";
import { btkEngelli } from "@/lib/btk";
import { bahisAdayKaydet } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

// CertStream worker'dan gelen olası BAHİS domainini imza motoruyla doğrular, USOM'a
// sorar (biz-önce mi) ve KALICI feed'e (Firestore bahis_adaylari) yazar. Yetki:
// MARKA_ADAY_SECRET (worker aynı sırrı gönderir). Worker kaba ön-filtre yapar; kesin
// karar + skor + TR-hedef + USOM burada üretilir → tek doğruluk kaynağı lib/bahis + lib/usom.
export async function POST(req: NextRequest) {
  const sir = process.env.MARKA_ADAY_SECRET;
  if (!sir) return NextResponse.json({ hata: "Servis kapalı." }, { status: 503 });

  let body: { domain?: string; ca?: string; secret?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }
  if (body.secret !== sir) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });

  const domain = String(body.domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return NextResponse.json({ hata: "Geçersiz domain." }, { status: 400 });

  const im = bahisImzasi(domain);
  if (!im.bahisMi) return NextResponse.json({ ok: true, kaydedildi: false, sebep: "bahis imzası yok" });

  // FIRESTORE KOTA KORUMASI: yalnız DEĞERLİ olanı kalıcı yaz — Türkiye-hedefli VEYA bilinen
  // marka VEYA yüksek güven (≥85). Yabancı jenerik casino gürültüsü (guven 72, TR değil) YAZILMAZ
  // → günlük yazma kotası (Spark plan ~20k) korunur, feed de gürültüsüz kalır ("SADE" ilkesi).
  const degerli = im.trHedefli || !!im.marka || im.guven >= 85;
  if (!degerli) return NextResponse.json({ ok: true, kaydedildi: false, sebep: "düşük değerli (TR-hedefli/marka/yüksek-güven değil)" });

  const [usomda, engelli] = await Promise.all([usomBiliniyor(domain), btkEngelli(domain)]);
  await bahisAdayKaydet({
    domain, guven: im.guven, marka: im.marka, trHedefli: im.trHedefli, usomda, engelli,
    ca: String(body.ca || ""), tld: domain.split(".").pop() || "", isaretler: im.isaretler,
    zaman: Date.now(), kaynak: "certstream",
  });
  const bizOnce = usomda === false && engelli !== true;
  return NextResponse.json({ ok: true, kaydedildi: true, guven: im.guven, bizOnce, engelli: engelli === true, trHedefli: im.trHedefli });
}
