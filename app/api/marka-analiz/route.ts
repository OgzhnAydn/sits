import { NextRequest, NextResponse } from "next/server";
import { markaAdaylariMarka, markaAdayKaydet, yasamGecisUygula, type MarkaAday } from "@/lib/store";
import { domainOsint, saldiriAsamasi, domainDurumu } from "@/lib/osint";
import { renderAday } from "@/lib/trVantage";
import { pasifDns } from "@/lib/passiveDns";
import { itibarliMi } from "@/lib/itibarli";
import { gercekTaklit, AVCI_MARKALAR, resmiMarkaDomaini } from "@/lib/korunanMarkalar";

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

      // ── GERÇEK TARAYICI RENDER (otomatik; her aday Chromium'da TR locale ile açılır) ──
      // Bot'a temiz görünen sayfanın kurbana gösterdiği GERÇEK halini + dinamik davranışı yakalar.
      const render = (await renderAday(a.domain, r.alanlar.find((x) => x.ad === "Sayfa başlığı")?.deger).catch(() => null)) || undefined;
      const renderTehdit = !!(render && (render.clipboard || (render.supheliScript && render.supheliScript.length)));

      const kimlikAvi = asama >= 6 || renderTehdit || r.bulgular.some((b) => /kimlik.?av|kart bilgisi isteniyor|üçüncü bir tarafa aktar|şifre.*girme/i.test(b));
      const cloakNot = render?.cloaking ? "Cloaking: bot'a temiz, gerçek tarayıcıda farklı sayfa. " : "";
      const aiNot = (cloakNot + ((r.alanlar.find((x) => x.ad === "Görsel notu")?.deger) || (r.bulgular[0] || ""))).slice(0, 150);
      const guncel: MarkaAday = { ...a, aiTur: aiTur || undefined, aiKimlikAvi: kimlikAvi, aiNot: aiNot || undefined, analizZaman: Date.now(), ...(render ? { render } : {}) };
      await markaAdayKaydet(guncel).catch(() => {});
      // YAŞAM DÖNGÜSÜ: derin analiz verdicti geçişi sürer (kimlik-avı/canlı → DOGRULANDI, park → IZLEMEDE).
      await yasamGecisUygula(a.domain, a.yasamDurumu, { tur: "derin-analiz", canliDurum: domainDurumu(r).durum, aktifTehdit: kimlikAvi, skor: r.risk }).catch(() => {});

      // ── KAMPANYA AVI (passive DNS) — gerçek tehditse IP'sindeki KARDEŞ domainlerden markaya uyanları
      // OTOMATİK aday yap: "1 yakalama → tüm saldırgan altyapısı/kampanyası". Ücretsiz reverse-IP.
      let kardesAday = 0;
      if (kimlikAvi || r.risk >= 60) {
        try {
          const pd = await pasifDns(a.domain);
          for (const kd of (pd.kardesDomainler || []).slice(0, 25)) {
            const d = kd.domain.toLowerCase().replace(/^www\./, "").replace(/\/.*$/, "");
            if (d === a.domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) continue;
            const mm = AVCI_MARKALAR.find((x) => gercekTaklit(d, x.anahtar));
            if (mm && !resmiMarkaDomaini(d) && !itibarliMi(d)) {
              await markaAdayKaydet({
                domain: d, marka: mm.anahtar, markaAdi: mm.ad, skor: 52, seviye: "Orta",
                sinyaller: [`Kampanya: ${a.domain} ile AYNI sunucuda (${kd.pivot}) barınıyor — aynı saldırgan altyapısı.`],
                kaynak: "kardes-pdns", zaman: Date.now(),
              }).catch(() => {});
              kardesAday++;
            }
          }
        } catch { /* passive DNS başarısız → geç */ }
      }

      return { domain: a.domain, aiTur, aiKimlikAvi: kimlikAvi, aiNot, risk: r.risk, kardesAday, render: render ? { cloaking: render.cloaking, clipboard: render.clipboard, supheli: render.supheliScript?.length || 0 } : null };
    } catch {
      return { domain: a.domain, aiTur: "", aiKimlikAvi: false, aiNot: "", risk: 0 };
    }
  });

  return NextResponse.json({ ok: true, marka, analizEdilen: sonuc.length, kimlikAviSayisi: sonuc.filter((s) => s.aiKimlikAvi).length, kardesToplam: sonuc.reduce((t, s) => t + (s.kardesAday || 0), 0), sonuc }, { headers: { "Cache-Control": "no-store" } });
}
