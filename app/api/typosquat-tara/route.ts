import { NextResponse } from "next/server";
import { typosquatUret } from "@/lib/typosquat";
import { gercekTaklit, resmiMarkaDomaini, KORUNAN_MARKALAR } from "@/lib/korunanMarkalar";
import { itibarliMi } from "@/lib/itibarli";
import { hizliDomainSkor } from "@/lib/osint";
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

// Bir domain DNS'te A kaydına çözülüyor mu? (çözülüyor = kayıtlı + kurulmuş). DoH (dns.google).
async function cozuluyorMu(d: string): Promise<boolean> {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(d)}&type=A`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return false;
    const j = (await r.json()) as { Answer?: { type?: number }[] };
    return Array.isArray(j.Answer) && j.Answer.some((a) => a.type === 1);
  } catch {
    return false;
  }
}

// PROAKTİF TYPOSQUAT TARAMASI — markanın olası sahte varyantlarını ÜRET → DNS'te çözülenleri (kayıtlı)
// bul → gerçek taklit olanları aday hattına yaz. Sertifika/tarama BEKLEMEZ: adres kaydedilir edilmez
// (çözülür çözülmez) yakalanır. Sıfır-kaçırma + anlık tespitin proaktif ayağı.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const kw = (u.searchParams.get("marka") || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const marka = KORUNAN_MARKALAR.find((m) => m.anahtar === kw);
  if (!marka) return NextResponse.json({ uretilen: 0, cozulen: 0, kaydedilen: 0 }, { headers: CORS });

  const adaylar0 = typosquatUret(marka);

  // DNS'te çözülenleri bul (chunk'lı paralel — DoH'u dövmeden).
  const cozulen: string[] = [];
  const CHUNK = 20;
  for (let i = 0; i < adaylar0.length; i += CHUNK) {
    const batch = adaylar0.slice(i, i + CHUNK);
    const res = await Promise.all(batch.map(async (d) => ((await cozuluyorMu(d)) ? d : "")));
    cozulen.push(...res.filter(Boolean));
  }

  // Çözülenlerden GERÇEK taklitleri (süzgeç) seç, resmî/itibarlı değil. 12 ile sınırla.
  const gercek = cozulen
    .filter((d) => gercekTaklit(d, kw) && !resmiMarkaDomaini(d) && !itibarliMi(d))
    .slice(0, 12);

  // Aday hattına yaz (hizliDomainSkor + markaAdayKaydet). kaynak="typosquat".
  let kaydedilen = 0;
  await Promise.all(
    gercek.map(async (d) => {
      try {
        const h = await hizliDomainSkor(d);
        const skor = Math.max(h.skor, 25);
        await markaAdayKaydet({
          domain: d,
          marka: kw,
          markaAdi: marka.ad,
          skor,
          seviye: skor >= 60 ? "Yüksek" : skor >= 30 ? "Orta" : "Düşük",
          sinyaller: [...h.sinyaller.slice(0, 5), "Proaktif typosquat izlemede tespit edildi (marka varyantı kayıtlı + çözülüyor)"],
          kaynak: "typosquat",
          zaman: Date.now(),
          durum: h.durum,
        });
        kaydedilen++;
      } catch { /* bu domaini atla */ }
    })
  );

  return NextResponse.json({ uretilen: adaylar0.length, cozulen: cozulen.length, kaydedilen }, { headers: CORS });
}
