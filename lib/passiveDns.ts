// ── Passive DNS + Altyapı Korelasyonu ────────────────────────────────────────
// "Domain'in ötesini gör": bir domainin ZAMAN İÇİNDE çözüldüğü IP'ler (mnemonic pDNS)
// + AYNI IP'yi paylaşan KARDEŞ domainler (HackerTarget reverse-IP). Böylece tek sahte
// site yerine arkasındaki ALTYAPI AĞI ortaya çıkar.
//
// UYDURMA YOK: kaynak veri yoksa boş döner; asla domain üretmez.
// EN KRİTİK KAPI — PAYLAŞIMLI ALTYAPI YANLIŞ-POZİTİFİ (bkz. osint-paylasimli-altyapi):
//   Cloudflare/CDN/paylaşımlı-hosting IP'si binlerce ALAKASIZ domain barındırır. Bir IP
//   FANOUT_ESIK'ten fazla domain taşıyorsa "kardeş" SAYILMAZ (aynı saldırgan değil) —
//   yalnızca DÜŞÜK-fanout, adanmış IP'ler gerçek altyapı-bağı sayılır.

export type PasifKayit = { ip: string; ilkGorulen?: number; sonGorulen?: number; adet?: number };
export type KardesDomain = { domain: string; pivot: string; pivotTur: "ip" };
export type PasifDnsSonuc = {
  gecmisIpler: PasifKayit[];        // domainin zaman içinde çözüldüğü IP'ler (yeni→eski)
  kardesDomainler: KardesDomain[];  // düşük-fanout IP paylaşan GERÇEK kardeş domainler
  paylasimliAltyapi: boolean;       // pivot(lar) CDN/yüksek-fanout → korelasyon anlamsız
  pivotSayisi: number;              // kardeş çıkarımında kullanılan adanmış IP sayısı
  not?: string;
};

const FANOUT_ESIK = 60;       // bir IP bundan fazla domain barındırıyorsa → paylaşımlı, kardeş sayma
const MAX_PIVOT = 3;          // ücretsiz reverse-IP kotasını koru: en çok 3 IP sorgula
const MAX_KARDES = 40;        // panelde/grafikte gösterilecek azami kardeş

const gecerliDomain = (d: string) => /^[a-z0-9.-]{4,253}\.[a-z]{2,}$/i.test(d) && !d.includes("..");
const kokAlan = (d: string) => d.toLowerCase().replace(/^\*?\./, "").split(".").slice(-2).join(".");
function ozelIp(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // IPv4 değil → atla
  return p[0] === 10 || p[0] === 127 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 169 && p[1] === 254) || p[0] === 0 || p[0] >= 224;
}

async function metinCek(url: string, ms = 10000): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "user-agent": "MirLeon-PassiveDNS/1.0" } });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

// mnemonic passive DNS: domainin GEÇMİŞ A/AAAA çözümlemeleri (ilk/son görülme + kaç kez).
export async function mnemonicGecmis(domain: string): Promise<PasifKayit[]> {
  const t = await metinCek(`https://api.mnemonic.no/pdns/v3/${encodeURIComponent(domain)}?limit=50`, 10000);
  if (!t) return [];
  let j: { data?: { answer: string; rrtype: string; firstSeenTimestamp?: number; lastSeenTimestamp?: number; times?: number }[] };
  try { j = JSON.parse(t); } catch { return []; }
  const kayitlar = (j.data || [])
    .filter((d) => (d.rrtype === "a" || d.rrtype === "aaaa") && d.answer && !ozelIp(d.answer))
    .map((d) => ({ ip: d.answer, ilkGorulen: d.firstSeenTimestamp, sonGorulen: d.lastSeenTimestamp, adet: d.times }));
  // IP başına tekilleştir (en yeni sonGorulen kalsın), yeni→eski sırala.
  const harita = new Map<string, PasifKayit>();
  for (const k of kayitlar) {
    const v = harita.get(k.ip);
    if (!v || (k.sonGorulen || 0) > (v.sonGorulen || 0)) harita.set(k.ip, k);
  }
  return [...harita.values()].sort((a, b) => (b.sonGorulen || 0) - (a.sonGorulen || 0));
}

// HackerTarget reverse-IP: bir IP'de barındırılan domainler. Döner: {domainler, toplam}.
// toplam > FANOUT_ESIK ise paylaşımlı/CDN kabul edilir (kardeş çıkarımı yapılmaz).
export async function ayniIpDomainler(ip: string): Promise<{ domainler: string[]; toplam: number } | null> {
  if (ozelIp(ip)) return null;
  const t = await metinCek(`https://api.hackertarget.com/reverseiplookup/?q=${encodeURIComponent(ip)}`, 12000);
  if (!t) return null;
  // Hata/kota dizeleri: "error ...", "API count exceeded ...", "No DNS ..."
  if (/^error|api count exceeded|no records|no dns/i.test(t.trim())) return null;
  const satirlar = t.split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    .filter((d) => gecerliDomain(d) && !d.endsWith(".arpa"));
  const tekil = [...new Set(satirlar)];
  return { domainler: tekil, toplam: tekil.length };
}

// Ana orkestrasyon: geçmiş IP'ler + düşük-fanout pivotlardan gerçek kardeş domainler.
export async function pasifDns(domain: string, mevcutIp?: string): Promise<PasifDnsSonuc> {
  const hedef = domain.toLowerCase().trim();
  const hedefKok = kokAlan(hedef);
  if (!gecerliDomain(hedef)) return { gecmisIpler: [], kardesDomainler: [], paylasimliAltyapi: false, pivotSayisi: 0, not: "geçersiz domain" };

  const gecmis = await mnemonicGecmis(hedef);

  // Pivot adayları: mevcut IP + en yeni geçmiş IP'ler (mnemonic). En çok MAX_PIVOT.
  const pivotAdayları: string[] = [];
  if (mevcutIp && !ozelIp(mevcutIp)) pivotAdayları.push(mevcutIp);
  for (const g of gecmis) if (!pivotAdayları.includes(g.ip)) pivotAdayları.push(g.ip);
  const pivotlar = pivotAdayları.slice(0, MAX_PIVOT);

  const kardes = new Map<string, KardesDomain>();
  let paylasimli = false, adanmisPivot = 0;
  for (const ip of pivotlar) {
    const rev = await ayniIpDomainler(ip);
    if (!rev) continue;
    if (rev.toplam > FANOUT_ESIK) { paylasimli = true; continue; } // paylaşımlı/CDN → kardeş SAYMA
    adanmisPivot++;
    for (const ham of rev.domainler) {
      const d = ham.replace(/^www\./, ""); // www.x ve x aynı sayılsın
      if (d === hedef || kokAlan(d) === hedefKok) continue; // kendisi/kendi alt-alanı değil
      if (!kardes.has(d)) kardes.set(d, { domain: d, pivot: ip, pivotTur: "ip" });
    }
  }

  const kardesDomainler = [...kardes.values()].slice(0, MAX_KARDES);
  return {
    gecmisIpler: gecmis,
    kardesDomainler,
    paylasimliAltyapi: paylasimli && adanmisPivot === 0,
    pivotSayisi: adanmisPivot,
    not: paylasimli && adanmisPivot === 0
      ? "Altyapı paylaşımlı (CDN/ortak barındırma) — aynı IP'deki domainler alakalı sayılmaz."
      : kardesDomainler.length ? undefined : "Adanmış IP'de başka domain görülmedi.",
  };
}
