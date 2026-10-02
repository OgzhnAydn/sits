import { NextRequest, NextResponse } from "next/server";
import { trVantageRender } from "@/lib/trVantage";

export const runtime = "nodejs";
export const maxDuration = 45;

// DİNAMİK DAVRANIŞ RAPORU (urlcheckup tarzı) — tespit edilen domaini KENDİ tarayıcımızla (TR-vantage)
// ziyaret edip canlı ekran görüntüsü + TÜM ağ istekleri + clipboard (ele geçirme) + script analizini
// döndürür. RENDER_URL (render servisi) yapılandırılmamışsa açık uyarı verir.
export async function GET(req: NextRequest) {
  const domain = (req.nextUrl.searchParams.get("domain") || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return NextResponse.json({ hata: "Geçerli domain gerekli." }, { status: 400 });
  if (!process.env.RENDER_URL) return NextResponse.json({ hata: "Render servisi yapılandırılmamış (RENDER_URL).", kurulumGerekli: true }, { status: 503 });

  const r = await trVantageRender(domain);
  if (!r) return NextResponse.json({ hata: "Render servisi yanıt vermedi / siteye erişilemedi." }, { status: 502 });

  // Dış adresler = taranan domain dışındaki bağlanılan host'lar (3rd-party / olası veri hedefi).
  const disHostlar = [...new Set((r.network || [])
    .map((n) => { try { return new URL(n.u).hostname.replace(/^www\./, ""); } catch { return ""; } })
    .filter((h) => h && h !== domain && !h.endsWith("." + domain) && !domain.endsWith("." + h)))].slice(0, 20);

  return NextResponse.json({
    ok: true, domain,
    durum: r.status, sonUrl: r.finalUrl, baslik: r.title, proxyTR: r.proxy,
    ekran: r.shotB64 ? `data:image/jpeg;base64,${r.shotB64}` : null,
    yonlendirme: r.chain || [],
    ag: r.network || [],
    disHostlar,
    clipboard: r.clipboard || [],
    scripts: r.scripts || { inlineN: 0, external: [], supheli: [] },
  }, { headers: { "Cache-Control": "no-store" } });
}
