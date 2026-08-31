import { NextRequest, NextResponse } from "next/server";
import { anahtarKok, domainSade } from "@/lib/korunanMarkalar";
import { markaKayitEt } from "@/lib/store";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Self-servis marka kaydı: kullanıcı markasını + RESMÎ domainlerini ekler.
// Resmî domainler ALLOWLIST olur → markanın kendi siteleri asla "sahte" işaretlenmez.
export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "markakayit", 6);
  if (limit) return limit;

  let body: { ad?: string; resmi?: string | string[]; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }

  const ad = String(body.ad || "").trim().slice(0, 80);
  const ham = Array.isArray(body.resmi) ? body.resmi : String(body.resmi || "").split(/[\s,;\n]+/);
  const resmi = [...new Set(ham.map(domainSade).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))].slice(0, 8);
  if (!resmi.length) return NextResponse.json({ hata: "En az bir geçerli resmî alan adı gir (ör. markam.com)." }, { status: 400 });

  const anahtar = anahtarKok(resmi[0]);
  if (anahtar.length < 2) return NextResponse.json({ hata: "Alan adından anahtar çıkarılamadı." }, { status: 400 });
  const markaAdi = ad || anahtar.charAt(0).toUpperCase() + anahtar.slice(1);

  const email = String(body.email || "").trim().toLowerCase();
  const emailGecerli = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  try {
    await markaKayitEt({ anahtar, ad: markaAdi, resmi, zaman: Date.now(), onay: true }, emailGecerli ? email : undefined);
  } catch {
    return NextResponse.json({ hata: "Şu an kaydedilemedi (veritabanı kuralları henüz yayınlanmamış olabilir)." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, anahtar, markaAdi, resmi });
}
