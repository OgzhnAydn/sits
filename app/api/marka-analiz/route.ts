import { NextRequest, NextResponse } from "next/server";
import { markaAdaylariMarka, markaAdayKaydet, yasamGecisUygula, type MarkaAday } from "@/lib/store";
import { domainOsint, saldiriAsamasi, domainDurumu } from "@/lib/osint";
import { gercekTaklit } from "@/lib/korunanMarkalar";

export const runtime = "nodejs";
export const maxDuration = 300;

// MARKA TESPİTLERİNİ TOPLU AI/İÇERİK ANALİZİ — bir markanın adaylarını (bounded) domainOsint
// (içerik + ekran görüntüsü + Gemini görsel analiz) ile işler; AI verdict'i aday kaydına yazar.
// Böylece operatör mercek'te HER birine tıklamadan içerik/AI yorumunu görür. Ölçek için bounded
// (tur başına ~6); öncelik: henüz analiz edilmemiş + yüksek skor. Gemini/urlscan kotası korunur.
async function parcali<T, R>(liste: T[], boyut: number, isle: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < liste.length; i += boyut) out.push(...(await Promise.all(liste.slice(i, i + boyut).map(isle))));
  return out;
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const marka = (u.searchParams.get("marka") || "").toLowerCase().trim();
  if (!marka) return NextResponse.json({ hata: "marka gerekli." }, { status: 400 });
  const adet = Math.min(12, Math.max(1, Number(u.searchParams.get("adet")) || 6));
  const force = u.searchParams.get("force") === "1";
  const BAYAT_MS = 3 * 3600 * 1000; // analiz 3 saatten eskiyse verdict bayat → yeniden analiz et

  const ham = await markaAdaylariMarka(marka, 300).catch(() => [] as MarkaAday[]);
  const gecerli = ham.filter((a) => gercekTaklit(a.domain, a.marka));
  const bayatMi = (a: MarkaAday) => !a.analizZaman || (Date.now() - a.analizZaman) > BAYAT_MS;
  // force → tümü yeniden; aksi halde yalnız hiç-analiz-edilmemiş VEYA bayat (>3s) olanlar.
  const aday = force ? gecerli : gecerli.filter((a) => bayatMi(a));
  // Öncelik: (force değilse) hiç-analiz-edilmemiş önce; sonra yüksek skor > yeni.
  const secili = [...aday].sort((a, b) => {
    const an = force ? 0 : (a.analizZaman ? 1 : 0), bn = force ? 0 : (b.analizZaman ? 1 : 0);
    return (an - bn) || ((b.skor || 0) - (a.skor || 0)) || ((b.zaman || 0) - (a.zaman || 0));
  }).slice(0, adet);

  const sonuc = await parcali(secili, 2, async (a) => {
    try {
      const r = await domainOsint(a.domain, undefined, true); // içerik + ekran + Gemini görsel analiz
      const aiTur = r.alanlar.find((x) => x.ad === "Görsel analiz (AI)" || x.ad === "İçerik analizi (AI)")?.deger || "";
      const asama = saldiriAsamasi(r);
      const kimlikAvi = asama >= 6 || r.bulgular.some((b) => /kimlik.?av|kart bilgisi isteniyor|üçüncü bir tarafa aktar|şifre.*girme/i.test(b));
      const aiNot = (r.alanlar.find((x) => x.ad === "Görsel notu")?.deger) || (r.bulgular[0] || "").slice(0, 130);
      const guncel: MarkaAday = { ...a, aiTur: aiTur || undefined, aiKimlikAvi: kimlikAvi, aiNot: aiNot || undefined, analizZaman: Date.now() };
      await markaAdayKaydet(guncel).catch(() => {});
      // YAŞAM DÖNGÜSÜ: derin analiz verdicti geçişi sürer (kimlik-avı/canlı → DOGRULANDI, park → IZLEMEDE).
      await yasamGecisUygula(a.domain, a.yasamDurumu, { tur: "derin-analiz", canliDurum: domainDurumu(r).durum, aktifTehdit: kimlikAvi, skor: r.risk }).catch(() => {});
      return { domain: a.domain, aiTur, aiKimlikAvi: kimlikAvi, aiNot, risk: r.risk };
    } catch {
      return { domain: a.domain, aiTur: "", aiKimlikAvi: false, aiNot: "", risk: 0 };
    }
  });

  return NextResponse.json({ ok: true, marka, analizEdilen: sonuc.length, kimlikAviSayisi: sonuc.filter((s) => s.aiKimlikAvi).length, sonuc }, { headers: { "Cache-Control": "no-store" } });
}
