// MARKA PANELİ (analitik dashboard) — TÜM metrikler GERÇEK saklı veriden hesaplanır.
// Kaynaklar: marka_adaylari (durum/skor/kaynak/zaman/domain/yükselme) + analizler
// (IP/ASN/CA/ülke = alanlar, takipId). Uydurma yok; veri yoksa alan boş döner.
import { markaAdaylariMarka, analizlerTopluGetir, markaErkenlik, type MarkaAday, type MarkaErkenlik, type Yukselme } from "./store";
import { gercekTaklit } from "./korunanMarkalar";

type Say = { ad: string; sayi: number };
const GUN = 86_400_000;

// Bir alanın değerlerini say → en çok tekrar edenler (ortak-nokta motoru).
function topla(degerler: (string | undefined)[], n = 8): Say[] {
  const m: Record<string, number> = {};
  for (const d of degerler) { const v = (d || "").trim(); if (v) m[v] = (m[v] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([ad, sayi]) => ({ ad, sayi }));
}

export type PanelVeri = {
  marka: string;
  toplam: number;
  gunluk: number; haftalik: number; aylik: number;   // son 1/7/30 gün tespit
  tempo: { gun: string; sayi: number }[];             // son 30 gün günlük seri
  saatDagilim: number[];                              // 24 saatlik ısı (0-23)
  durum: Record<string, number>;                      // aktif-tuzak/canli/park/…
  riskHist: { aralik: string; sayi: number }[];       // güven dağılımı
  kaynak: Record<string, number>;                     // certstream/urlscan/…
  tld: Say[];                                          // en çok kötüye kullanılan uzantı
  ortak: { ip: Say[]; asn: Say[]; ca: Say[]; ulke: Say[]; takip: Say[] };
  kume: { tld: string; adet: number } | null;         // en büyük tek-operasyon kümesi
  yukselmeler: { domain: string; sebep: string[]; t: number; simdikiRisk: number }[];
  saglik: { sonTespit: number; buGun: number; intelKapsam: number }; // sistem canlılığı
  erkenlik: MarkaErkenlik;                             // USOM'dan öndelik
};

export async function markaPanel(marka: string): Promise<PanelVeri> {
  const bos: PanelVeri = {
    marka, toplam: 0, gunluk: 0, haftalik: 0, aylik: 0, tempo: [], saatDagilim: Array(24).fill(0),
    durum: {}, riskHist: [], kaynak: {}, tld: [], ortak: { ip: [], asn: [], ca: [], ulke: [], takip: [] },
    kume: null, yukselmeler: [], saglik: { sonTespit: 0, buGun: 0, intelKapsam: 0 }, erkenlik: { toplam: 0, bizOnce: 0, usomdaYok: 0, usomOnce: 0, ortGun: 0, ornekler: [] },
  };
  if (!marka) return bos;
  const ham = await markaAdaylariMarka(marka, 500);
  const adaylar = ham.filter((a) => gercekTaklit(a.domain, a.marka)) as (MarkaAday & { sonYukselme?: Yukselme })[];
  if (!adaylar.length) return bos;
  const now = Date.now();

  // ── TEMPO (son 30 gün günlük seri) ──
  const tempoMap: Record<string, number> = {};
  const gunEtiket = (t: number) => new Date(t).toISOString().slice(5, 10); // MM-DD
  for (let i = 29; i >= 0; i--) tempoMap[gunEtiket(now - i * GUN)] = 0;
  const saatDagilim = Array(24).fill(0);
  let gunluk = 0, haftalik = 0, aylik = 0, buGun = 0;
  const bugunEt = gunEtiket(now);
  for (const a of adaylar) {
    const z = a.zaman || 0;
    const yas = now - z;
    if (yas <= GUN) gunluk++;
    if (yas <= 7 * GUN) haftalik++;
    if (yas <= 30 * GUN) aylik++;
    const et = gunEtiket(z);
    if (et in tempoMap) tempoMap[et]++;
    if (et === bugunEt) buGun++;
    if (z) saatDagilim[new Date(z).getUTCHours()]++;
  }
  const tempo = Object.entries(tempoMap).map(([gun, sayi]) => ({ gun, sayi }));

  // ── KOMPOZİSYON ──
  const durum: Record<string, number> = {};
  const kaynak: Record<string, number> = {};
  const riskB = [0, 0, 0, 0, 0]; // 0-20,20-40,40-60,60-80,80-100
  for (const a of adaylar) {
    durum[a.durum || "belirsiz"] = (durum[a.durum || "belirsiz"] || 0) + 1;
    kaynak[a.kaynak || "bilinmiyor"] = (kaynak[a.kaynak || "bilinmiyor"] || 0) + 1;
    const s = Math.min(99, Math.max(0, a.skor || 0));
    riskB[Math.floor(s / 20)]++;
  }
  const riskHist = [
    { aralik: "0-20", sayi: riskB[0] }, { aralik: "20-40", sayi: riskB[1] }, { aralik: "40-60", sayi: riskB[2] },
    { aralik: "60-80", sayi: riskB[3] }, { aralik: "80-100", sayi: riskB[4] },
  ];
  const tld = topla(adaylar.map((a) => "." + (a.domain.split(".").pop() || "")));

  // ── KÜME (en büyük tek-operasyon) ──
  const tldSay: Record<string, number> = {};
  for (const a of adaylar) { const t = (a.domain.split(".").pop() || "").toLowerCase(); tldSay[t] = (tldSay[t] || 0) + 1; }
  const enKalabalik = Object.entries(tldSay).sort((x, y) => y[1] - x[1])[0];
  const kume = enKalabalik && enKalabalik[1] >= 5 && enKalabalik[1] / adaylar.length > 0.4 ? { tld: enKalabalik[0], adet: enKalabalik[1] } : null;

  // ── YÜKSELMELER (Engine 2: eyleme geçenler) ──
  const yukselmeler = adaylar
    .filter((a) => a.sonYukselme)
    .map((a) => ({ domain: a.domain, sebep: a.sonYukselme!.sebep, t: a.sonYukselme!.t, simdikiRisk: a.sonYukselme!.simdikiRisk }))
    .sort((x, y) => y.t - x.t).slice(0, 12);

  // ── ORTAK NOKTA & ÜLKE (analizler.alanlar'dan) ──
  const intel = await analizlerTopluGetir(adaylar.map((a) => a.domain));
  const alanDeger = (dom: string, ad: string) => (intel[dom]?.alanlar || []).find((x) => x.ad === ad)?.deger;
  // Ülke adını normalize et: CDN-edge notunu at + aynı ülkenin farklı yazımlarını birleştir
  // + Türkçeleştir (ip-api İngilizce döner; "Turkey" ve "Türkiye" ayrı sayılmasın).
  const ULKE_AD: Record<string, string> = {
    "turkey": "Türkiye", "türkiye": "Türkiye", "united states": "ABD", "usa": "ABD",
    "germany": "Almanya", "netherlands": "Hollanda", "united kingdom": "Birleşik Krallık",
    "canada": "Kanada", "france": "Fransa", "russia": "Rusya", "china": "Çin", "singapore": "Singapur",
    "ireland": "İrlanda", "spain": "İspanya", "italy": "İtalya", "poland": "Polonya", "india": "Hindistan",
  };
  const ulkeTemiz = (v?: string): string | undefined => {
    const c = (v || "").replace(/\s*\(CDN edge.*$/i, "").trim();
    if (!c) return undefined;
    return ULKE_AD[c.toLowerCase()] || c;
  };
  const ips: (string | undefined)[] = [], asns: (string | undefined)[] = [], cas: (string | undefined)[] = [], ulkeler: (string | undefined)[] = [], takipler: (string | undefined)[] = [];
  let intelVar = 0;
  for (const a of adaylar) {
    const it = intel[a.domain];
    if (it) intelVar++;
    ips.push(alanDeger(a.domain, "IP adresi"));
    asns.push(alanDeger(a.domain, "Ağ (ASN)"));
    cas.push(alanDeger(a.domain, "SSL veren (CA)"));
    ulkeler.push(ulkeTemiz(alanDeger(a.domain, "Sunucu ülkesi")));
    takipler.push(it?.takipId);
  }
  const ortak = { ip: topla(ips), asn: topla(asns), ca: topla(cas), ulke: topla(ulkeler), takip: topla(takipler) };

  const erkenlik = await markaErkenlik(marka).catch(() => bos.erkenlik);
  const sonTespit = Math.max(0, ...adaylar.map((a) => a.zaman || 0));

  return {
    marka, toplam: adaylar.length, gunluk, haftalik, aylik, tempo, saatDagilim,
    durum, riskHist, kaynak, tld, ortak, kume, yukselmeler,
    saglik: { sonTespit, buGun, intelKapsam: Math.round((intelVar / adaylar.length) * 100) },
    erkenlik,
  };
}
