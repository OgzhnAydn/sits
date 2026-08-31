import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Görsel gerçekten var mı (200 + image)? urlscan pasif araması bazen eski/başarısız
// taramanın 404 screenshot'ını döndürür — kırık görüntü göstermemek için doğrula.
async function gorselVar(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(6000) });
    return r.ok && (r.headers.get("content-type") || "").startsWith("image");
  } catch {
    return false;
  }
}

// EKRAN GÖRÜNTÜSÜ — her tespit için görüntü garantisi.
// Önce urlscan'de VAR OLAN taramaya bakar; yoksa AKTİF tarama tetikler (URLSCAN_KEY ile)
// ve istemci uuid ile poll ederek hazır olunca görüntüyü alır.
// GET ?domain=X            → {durum:"hazir",screenshot} | {durum:"taraniyor",uuid} | {durum:"yok"}
// GET ?uuid=Y              → {durum:"hazir",screenshot} | {durum:"taraniyor"}
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const key = process.env.URLSCAN_KEY;
  const uuid = (u.searchParams.get("uuid") || "").replace(/[^a-f0-9-]/gi, "");
  const domain = (u.searchParams.get("domain") || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

  // Poll: aktif taramanın sonucu hazır mı?
  if (uuid) {
    try {
      const r = await fetch(`https://urlscan.io/api/v1/result/${uuid}/`, {
        headers: key ? { "API-Key": key } : {},
        signal: AbortSignal.timeout(9000),
      });
      if (r.ok) {
        const j = (await r.json()) as { task?: { screenshotURL?: string } };
        const shot = j.task?.screenshotURL || `https://urlscan.io/screenshots/${uuid}.png`;
        // Sonuç hazır ama screenshot dosyası henüz oluşmamış olabilir — doğrula.
        if (await gorselVar(shot)) return NextResponse.json({ durum: "hazir", screenshot: shot });
      }
      return NextResponse.json({ durum: "taraniyor", uuid }); // 404 = hâlâ render ediliyor
    } catch {
      return NextResponse.json({ durum: "taraniyor", uuid });
    }
  }

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return NextResponse.json({ durum: "yok" });

  // 1) Var olan (pasif) tarama — anında.
  try {
    const s = (await (await fetch(`https://urlscan.io/api/v1/search/?q=page.domain:%22${encodeURIComponent(domain)}%22&size=1`, {
      headers: key ? { "API-Key": key } : {},
      signal: AbortSignal.timeout(9000),
    })).json()) as { results?: { screenshot?: string }[] };
    const shot = s.results?.[0]?.screenshot;
    // Sadece dosya GERÇEKTEN varsa "hazir" de — yoksa aşağıda aktif tarama tetiklenir.
    if (shot && (await gorselVar(shot))) return NextResponse.json({ durum: "hazir", screenshot: shot });
  } catch {
    /* pasif arama başarısız — aktif taramaya geç */
  }

  // 2) Aktif tarama tetikle (anahtar gerekir). urlscan siteyi gerçekten render eder.
  if (!key) return NextResponse.json({ durum: "yok" });
  try {
    const sub = await fetch("https://urlscan.io/api/v1/scan/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "API-Key": key },
      body: JSON.stringify({ url: `http://${domain}`, visibility: "unlisted" }),
      signal: AbortSignal.timeout(12000),
    });
    const sj = (await sub.json()) as { uuid?: string };
    if (sj.uuid) return NextResponse.json({ durum: "taraniyor", uuid: sj.uuid });
  } catch {
    /* aktif tarama başlatılamadı (kota?) */
  }
  return NextResponse.json({ durum: "yok" });
}
