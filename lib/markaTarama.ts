// Vercel-içi MARKA TARAYICI — ayrı sunucu/CertStream worker'a GEREK YOK.
// Her korunan marka için urlscan'i tarar (page.domain:marka*), marka adını taşıyan
// resmî-OLMAYAN domainleri "aday" olarak kuyruğa (/marka-avci) düşürür. Günlük cron
// (rapor-uret) bunu çağırır → kart/sunucu derdi olmadan kuyruk kendiliğinden dolar.

import { AVCI_MARKALAR, resmiMarkaDomaini, resmiListedeMi } from "./korunanMarkalar";
import { markaAdayKaydet, markaGunlukArtir, kullaniciMarkalariGetir } from "./store";
import { itibarliMi } from "./itibarli";

const RISKLI_TLD = ["xyz", "top", "tk", "buzz", "icu", "cyou", "rest", "monster", "click", "shop", "live", "online", "site", "vip", "club", "fun", "website", "space", "info", "biz"];

const UA = { "User-Agent": "Mozilla/5.0", accept: "application/json" };

type UsSonuc = { page?: { domain?: string; domainAgeDays?: number; ip?: string; country?: string } };

async function urlscanAra(q: string, size = 20): Promise<UsSonuc[]> {
  try {
    const r = await fetch(`https://urlscan.io/api/v1/search/?q=${encodeURIComponent(q)}&size=${size}`, { headers: UA, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: UsSonuc[] };
    return j.results || [];
  } catch {
    return [];
  }
}

function seviye(s: number): "Yüksek" | "Orta" | "Düşük" {
  return s >= 60 ? "Yüksek" : s >= 30 ? "Orta" : "Düşük";
}

async function batch<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

export async function markalariTara(): Promise<{ taranan: number; yeni: number }> {
  const tarih = new Date().toISOString().slice(0, 10);
  let taranan = 0;
  let yeni = 0;

  // Hardcoded markalar + KULLANICI'nın kaydettiği markalar (kısa anahtar hariç → gürültü olmasın).
  const ozel = (await kullaniciMarkalariGetir())
    .filter((m) => m.anahtar.length >= 4)
    .map((m) => ({ anahtar: m.anahtar, ad: m.ad, resmi: m.resmi }));
  const hedefler = [...AVCI_MARKALAR, ...ozel];

  await batch(hedefler, 6, async (m) => {
    const res = await urlscanAra(`page.domain:${m.anahtar}*`, 40);
    const gorulen = new Set<string>();
    for (const r of res) {
      const dom = (r.page?.domain || "").toLowerCase().replace(/^www\./, "");
      if (!dom || gorulen.has(dom) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) continue;
      gorulen.add(dom);
      taranan++;
      // ALLOWLIST: markanın kendi resmî domaini (hardcoded ya da kullanıcının kaydettiği) → aday DEĞİL.
      if (!dom.includes(m.anahtar) || resmiMarkaDomaini(dom) || resmiListedeMi(dom, m.resmi) || itibarliMi(dom)) continue;

      // Hafif skor (aday kuyruğu için — kesin karar değil; "incele"de tam analiz yapılır).
      let skor = 42; // marka adını taşıyan + resmî değil
      const tld = dom.split(".").pop() || "";
      if (RISKLI_TLD.includes(tld)) skor += 14;
      const yas = r.page?.domainAgeDays;
      if (typeof yas === "number" && yas < 90) skor += 16;
      if (typeof yas === "number" && yas < 30) skor += 8;
      skor = Math.min(100, skor);

      try {
        await markaGunlukArtir(m.anahtar, tarih, true);
        await markaAdayKaydet({
          domain: dom,
          marka: m.anahtar,
          markaAdi: m.ad,
          skor,
          seviye: seviye(skor),
          sinyaller: ["urlscan taramasında bulundu — marka adını taşıyan, resmî olmayan domain."],
          kaynak: "vercel-tarama",
          zaman: Date.now(),
        });
        yeni++;
      } catch {
        /* yazma başarısızsa geç */
      }
    }
  });

  return { taranan, yeni };
}
