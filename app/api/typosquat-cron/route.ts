import { NextRequest, NextResponse } from "next/server";
import { typosquatUret } from "@/lib/typosquat";
import { AVCI_MARKALAR, gercekTaklit, resmiMarkaDomaini } from "@/lib/korunanMarkalar";
import { itibarliMi } from "@/lib/itibarli";
import { markaAdayKaydet } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// PROAKTİF TYPOSQUAT CRON — markaların olası sahte varyantlarını üretip DNS'te kayıtlı olanları
// SÜREKLİ tarar (biri bakmasa da). 6 saatte bir dönüşümlü ~40 marka → gün içinde tüm markalar kapanır.
// Hız için DERİN skor YOK: çözülen gerçek taklit taban-25 ("Düşük") kaydedilir, tam analiz tıklamada.
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

export async function GET(req: NextRequest) {
  const sir = process.env.CRON_SECRET;
  const verilen = (req.headers.get("authorization") || "").replace(/^Bearer /, "") || new URL(req.url).searchParams.get("secret") || "";
  if (sir && verilen !== sir) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });

  // Dönüşümlü dilim: 6 saatte bir kayan ~40 marka penceresi (4 tur/gün → tüm markalar).
  const hepsi = AVCI_MARKALAR;
  const dilimBoyu = 40;
  const tur = Math.floor(Date.now() / (6 * 3600_000));
  const bas = (tur * dilimBoyu) % hepsi.length;
  const dilim = [...hepsi, ...hepsi].slice(bas, bas + dilimBoyu);

  let uretilen = 0, cozulen = 0, kaydedilen = 0;
  for (const marka of dilim) {
    const adaylar = typosquatUret(marka);
    uretilen += adaylar.length;
    const CHUNK = 30;
    for (let i = 0; i < adaylar.length; i += CHUNK) {
      const batch = adaylar.slice(i, i + CHUNK);
      const res = await Promise.all(batch.map(async (d) => ((await cozuluyorMu(d)) ? d : "")));
      for (const d of res.filter(Boolean)) {
        cozulen++;
        if (!gercekTaklit(d, marka.anahtar) || resmiMarkaDomaini(d) || itibarliMi(d)) continue;
        try {
          await markaAdayKaydet({
            domain: d, marka: marka.anahtar, markaAdi: marka.ad, skor: 25, seviye: "Düşük",
            sinyaller: ["Proaktif typosquat izlemede tespit edildi (marka varyantı kayıtlı + çözülüyor)"],
            kaynak: "typosquat", zaman: Date.now(), durum: "canli",
          });
          kaydedilen++;
        } catch { /* atla */ }
      }
    }
  }
  return NextResponse.json({ ok: true, taranan_marka: dilim.length, uretilen, cozulen, kaydedilen });
}
