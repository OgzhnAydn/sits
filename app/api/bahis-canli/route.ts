import { NextResponse } from "next/server";
import { bahisAdaylariGetir, type BahisAday } from "@/lib/store";
import { canlilikProbe } from "@/lib/canlilik";

export const runtime = "nodejs";
export const maxDuration = 60;

// YALNIZ CANLI bahis siteleri — demo/şov için. Bahis korpusundan en DEĞERLİ adayları
// (biz-önce + TR-hedefli + yüksek güven) canlilikProbe ile dener; YALNIZ içerik sunan
// (durum "live") olanları döndürür. Bounded (top ~40 probe) → hızlı. Feed'in tamamını
// değil, "canlı vitrini" verir — çünkü akıştan yakalananların çoğu henüz yayında değil.
async function parcali<T, R>(liste: T[], boyut: number, isle: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < liste.length; i += boyut) out.push(...(await Promise.all(liste.slice(i, i + boyut).map(isle))));
  return out;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const kacProbe = Math.min(60, Math.max(10, Number(u.searchParams.get("n")) || 40));

  let korpus: BahisAday[] = [];
  try { korpus = await bahisAdaylariGetir(500); } catch { korpus = []; }

  const bizOnce = (y: BahisAday) => y.usomda === false && y.engelli !== true;
  const puan = (y: BahisAday) => (bizOnce(y) ? 4 : 0) + (y.trHedefli ? 2 : 0) + (y.guven >= 85 ? 1 : 0);
  const adaylar = korpus
    .filter((y) => y.engelli !== true) // zaten engelli olanı vitrine koyma (canlı istiyoruz)
    .sort((a, b) => puan(b) - puan(a) || (b.zaman - a.zaman))
    .slice(0, kacProbe);

  const sonuc = await parcali(adaylar, 12, async (y) => {
    try { const c = await canlilikProbe(y.domain); return { y, durum: c.durum, kokNeden: c.kokNeden }; }
    catch { return { y, durum: "bilinmiyor", kokNeden: "" }; }
  });

  // Yalnız GERÇEKTEN içerik sunan (live). (redirect/park/dead/erisim_kisitli/bilinmiyor = vitrine girmez.)
  const liste = sonuc
    .filter((s) => s.durum === "live")
    .map((s) => ({ ...s.y, canliDurum: s.durum, canliNeden: s.kokNeden }))
    .sort((a, b) => (Number(b.trHedefli) - Number(a.trHedefli)) || (b.guven - a.guven) || (b.zaman - a.zaman));

  return NextResponse.json(
    { ok: true, probe: adaylar.length, canliSayi: liste.length, liste },
    { headers: { "Cache-Control": "no-store" } },
  );
}
