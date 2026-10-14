import { NextResponse } from "next/server";
import { hizliDomainSkor } from "@/lib/osint";
import { gercekTaklit, resmiMarkaDomaini, KORUNAN_MARKALAR } from "@/lib/korunanMarkalar";
import { itibarliMi } from "@/lib/itibarli";
import { markaAdayKaydet } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

// urlscan.io'yu KAYNAK olarak kullan (ekranda kayan liste DEĞİL): dünyada SON taranan, sayfa alan
// adında marka anahtarı geçen adresleri çek → gercekTaklit SÜZGECİnden geçir (toki/Japonca gürültüsü
// elenir, TR-bağlam/riskli-TLD korunur) → GERÇEK taklitleri normal aday hattına yaz. Böylece
// CertStream'in kaçırdıklarını (eski domain, path, geç sertifika) urlscan yakalar ve "Sahte adresler"
// listesinde PUANLI bir uyarı olarak görünür — müşteri gürültüyle boğulmaz.
type UrlscanRow = { _id?: string; page?: { domain?: string }; task?: { time?: string } };

export async function GET(req: Request) {
  const u = new URL(req.url);
  const kw = (u.searchParams.get("marka") || u.searchParams.get("q") || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (kw.length < 3) return NextResponse.json({ kaydedilen: 0, incelenen: 0, aday: 0 }, { headers: CORS });

  const marka = KORUNAN_MARKALAR.find((m) => m.anahtar === kw);
  const markaAdi = marka?.ad || kw;
  const key = process.env.URLSCAN_KEY;

  let rows: UrlscanRow[] = [];
  try {
    const q = key ? `page.domain:*${kw}*` : `page.domain:${kw}*`;
    const r = await fetch(`https://urlscan.io/api/v1/search/?q=${encodeURIComponent(q)}&size=50`, {
      headers: key ? { "API-Key": key } : {},
      signal: AbortSignal.timeout(9000),
    });
    if (r.ok) rows = ((await r.json()) as { results?: UrlscanRow[] }).results || [];
  } catch {
    return NextResponse.json({ kaydedilen: 0, incelenen: 0, aday: 0, hata: "urlscan erişilemedi" }, { headers: CORS });
  }

  // SÜZGEÇ: gerçek taklit mi? (gürültü elenir) + resmî/itibarlı değil. Benzersizleştir, 10 ile sınırla.
  const aday = [...new Map(
    rows
      .map((x) => ({ domain: (x.page?.domain || "").toLowerCase().replace(/^www\./, ""), zaman: x.task?.time ? Date.parse(x.task.time) : Date.now() }))
      .filter((s) => s.domain && gercekTaklit(s.domain, kw) && !resmiMarkaDomaini(s.domain) && !itibarliMi(s.domain))
      .map((s) => [s.domain, s] as const)
  ).values()].slice(0, 10);

  // Normal aday hattına yaz (CertStream ile AYNI hızlı skorlama + kayıt). kaynak="urlscan".
  let kaydedilen = 0;
  await Promise.all(
    aday.map(async (s) => {
      try {
        const h = await hizliDomainSkor(s.domain);
        const skor = Math.max(h.skor, 25); // taban 25 — yaş/USOM sinyali gelmese de kaydedilir, "Düşük" öncelik
        await markaAdayKaydet({
          domain: s.domain,
          marka: kw,
          markaAdi,
          skor,
          seviye: skor >= 60 ? "Yüksek" : skor >= 30 ? "Orta" : "Düşük",
          sinyaller: [...h.sinyaller.slice(0, 5), "urlscan.io canlı taramasında görüldü (dünya genelinde)"],
          kaynak: "urlscan",
          zaman: s.zaman,
          durum: h.durum,
        });
        kaydedilen++;
      } catch { /* bu domaini atla */ }
    })
  );

  return NextResponse.json({ kaydedilen, incelenen: rows.length, aday: aday.length }, { headers: CORS });
}
