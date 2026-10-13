import { NextRequest, NextResponse } from "next/server";
import { markaAdayKaydet, type MarkaAday } from "@/lib/store";

export const runtime = "nodejs";

// RENDER SONUCU — Fly render-worker'ı bir adayı gerçek tarayıcıda açtıktan sonra sinyalleri
// buraya yazar (merge). Tehdit sinyali (clipboard/şüpheli script) varsa kimlik-avı işaretlenir.
// Yetki: MARKA_ADAY_SECRET.
export async function POST(req: NextRequest) {
  const sir = process.env.RENDER_WORKER_SECRET || process.env.MARKA_ADAY_SECRET;
  if (!sir) return NextResponse.json({ hata: "Servis kapalı." }, { status: 503 });
  let body: { secret?: string; domain?: string; marka?: string; render?: NonNullable<MarkaAday["render"]> };
  try { body = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }
  if (body.secret !== sir) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });

  const domain = String(body.domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").trim();
  const marka = String(body.marka || "").toLowerCase().trim();
  const render = body.render;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || !render || !render.zaman) {
    return NextResponse.json({ hata: "Eksik veri." }, { status: 400 });
  }

  const renderTehdit = !!(render.clipboard || (render.supheliScript && render.supheliScript.length));
  // merge: eksik alanlar (skor, seviye, sinyaller…) mevcut kayıttan korunur.
  await markaAdayKaydet({ domain, marka, render, ...(renderTehdit ? { aiKimlikAvi: true } : {}) } as MarkaAday).catch(() => {});
  return NextResponse.json({ ok: true, domain, renderTehdit, cloaking: !!render.cloaking });
}
