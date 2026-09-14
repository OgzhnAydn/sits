import { NextRequest, NextResponse } from "next/server";
import { KORUNAN_MARKALAR } from "@/lib/korunanMarkalar";
import { aboneKaydet, aboneGetir, kullaniciMarkalariGetir, kullaniciMarkaSil } from "@/lib/store";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Marka Koruma aboneliği — sadece izlediğimiz (KORUNAN_MARKALAR) markalara açık.
// Listede olmayan bir marka için önce sözlüğe eklenmesi gerekir (şimdilik manuel).
export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "abone", 10);
  if (limit) return limit;

  let body: { marka?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }
  const anahtar = String(body.marka || "").toLowerCase();
  let marka: { anahtar: string; ad: string; resmi: string[] } | undefined =
    KORUNAN_MARKALAR.find((m) => m.anahtar === anahtar);
  if (!marka) {
    // Kullanıcının kendi kaydettiği markalar da abone olabilir.
    const km = (await kullaniciMarkalariGetir()).find((m) => m.anahtar === anahtar);
    if (km) marka = { anahtar: km.anahtar, ad: km.ad, resmi: km.resmi };
  }
  if (!marka) return NextResponse.json({ hata: "Bu marka izleme listesinde değil. Önce ekleyin." }, { status: 400 });
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ hata: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  try {
    await aboneKaydet({ marka: marka.anahtar, markaAdi: marka.ad, kayitZaman: Date.now() }, email);
  } catch {
    return NextResponse.json({ hata: "Şu an kaydedilemedi (veritabanı kuralları henüz yayınlanmamış olabilir)." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, markaAdi: marka.ad });
}

// Kullanıcının eklediği markayı KALDIR (bakım/marka-yönetimi). Secret korumalı — yanlış/mükerrer
// kayıt temizliği (ör. 3-harf "ktb" gibi taranamayan hatalı ekleme).
export async function DELETE(req: NextRequest) {
  const sir = process.env.MARKA_ADAY_SECRET;
  let body: { marka?: string; secret?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }
  if (!sir || body.secret !== sir) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  const anahtar = String(body.marka || "").toLowerCase().trim();
  if (!anahtar) return NextResponse.json({ hata: "marka gerekli." }, { status: 400 });
  const ok = await kullaniciMarkaSil(anahtar);
  return NextResponse.json({ ok });
}

// Bir markanın aboneli olup olmadığını sorgula (pano için).
export async function GET(req: NextRequest) {
  const marka = new URL(req.url).searchParams.get("marka") || "";
  const a = await aboneGetir(marka.toLowerCase());
  return NextResponse.json({ aboneli: Boolean(a), abone: a });
}
