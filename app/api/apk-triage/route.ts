import { NextRequest, NextResponse } from "next/server";
import { triageGonder, triageOzet, triageYapilandi } from "@/lib/triage";
import { apkTriageKaydet, apkTriageGetir, apkTriageOzetYaz } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SAHTE APK DAVRANIŞ ANALİZİ (Triage/tria.ge).
//  POST {domain, apkUrl, secret}  → APK'yı Triage'a gönderir (yeni ise), sample id döner.
//  GET  ?domain=<domain>          → o domain için Triage raporunu döner (hazırsa özet; değilse "running").
// GET public (malware davranış raporu gösterimi); POST secret ister (MARKA_ADAY_SECRET).
const CORS: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

export async function OPTIONS() {
  return new NextResponse(null, { headers: { ...CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
}

function domSade(v: string) {
  return String(v || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
}

export async function POST(req: NextRequest) {
  if (!triageYapilandi) return NextResponse.json({ hata: "Triage yapılandırılmadı — TRIAGE_KEY gerekli." }, { status: 503, headers: CORS });
  const sir = process.env.MARKA_ADAY_SECRET;
  let body: { domain?: string; apkUrl?: string; secret?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400, headers: CORS }); }
  if (sir && body.secret !== sir) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401, headers: CORS });

  const domain = domSade(body.domain || "");
  const apkUrl = String(body.apkUrl || "");
  if (!domain || !/^https?:\/\/.+\.apk(\?|#|$)/i.test(apkUrl)) return NextResponse.json({ hata: "domain + geçerli .apk URL gerekli." }, { status: 400, headers: CORS });

  // Zaten gönderilmişse tekrar gönderme (kota + mükerrer detonasyon koruması).
  const mevcut = await apkTriageGetir(domain).catch(() => null);
  if (mevcut?.triageId) return NextResponse.json({ ok: true, id: mevcut.triageId, durum: mevcut.durum || "running", yeni: false }, { headers: CORS });

  const id = await triageGonder(apkUrl);
  if (!id) return NextResponse.json({ hata: "Triage gönderimi başarısız (anahtar/kota/URL)." }, { status: 502, headers: CORS });
  await apkTriageKaydet(domain, apkUrl, id).catch(() => {});
  return NextResponse.json({ ok: true, id, durum: "running", yeni: true }, { headers: CORS });
}

export async function GET(req: NextRequest) {
  const domain = domSade(new URL(req.url).searchParams.get("domain") || "");
  if (!domain) return NextResponse.json({ hata: "domain gerekli." }, { status: 400, headers: CORS });

  const kayit = await apkTriageGetir(domain).catch(() => null);
  if (!kayit?.triageId) return NextResponse.json({ ok: true, durum: "yok", not: "Bu domain için Triage'a gönderilmiş APK yok." }, { headers: CORS });

  // Zaten raporlanmış + saklanmışsa onu döndür (tekrar Triage'a gitme).
  if (kayit.durum === "reported" && kayit.ozet) return NextResponse.json({ ok: true, durum: "reported", ozet: kayit.ozet }, { headers: CORS });

  if (!triageYapilandi) return NextResponse.json({ ok: true, durum: kayit.durum || "running", not: "Triage anahtarı yok; güncel durum çekilemiyor." }, { headers: CORS });

  // Henüz hazır değil → Triage'dan güncel durumu çek; hazırsa kalıcı yaz.
  const ozet = await triageOzet(kayit.triageId).catch(() => null);
  if (!ozet) return NextResponse.json({ ok: true, durum: kayit.durum || "running" }, { headers: CORS });
  if (ozet.durum === "reported") { await apkTriageOzetYaz(domain, ozet).catch(() => {}); return NextResponse.json({ ok: true, durum: "reported", ozet }, { headers: CORS }); }
  return NextResponse.json({ ok: true, durum: ozet.durum, link: ozet.link }, { headers: CORS });
}
