// Kampanya Çözümleme — tek bir sahte domainden yola çıkıp AYNI phishing
// operasyonunun tüm parçalarını (kardeş domainler, IP'ler, ASN'ler, Telegram/exfil)
// haritalar. urlscan-merkezli, ücretsiz kaynaklar; paralı olanlar sadece anahtar
// varsa "derinleştirici" olarak devreye girer.
//
// Kaynaklar: domainOsint (tohum) + urlscan search (aynı IP/ASN'deki kardeşler +
// giden ağ istekleri → Telegram/exfil) + crt.sh (sertifika kardeşleri) +
// permütasyon (typosquat kardeşleri) + RDAP (zaman çizelgesi).

import { domainOsint, faviconHash } from "./osint";
import { GrafKurucu, alanBul, type Graf } from "./graf";
import { AVCI_MARKALAR, resmiMarkaDomaini } from "./korunanMarkalar";

// ─────────────────────────────────────────────────────────────────────────────
// TOPLULUK KAMPANYA KÜMELEME (trend/nabız sayfası)
// Birlikte bildirilen göstergeleri (komşu bağlarıyla) bağlı bileşenlere ayırır;
// 2+ göstergeli her bileşen bir "kampanya"dır. /api/trend bunu kullanır.
// ─────────────────────────────────────────────────────────────────────────────
type GostergeDugum = { id: string; deger: string; tip: string; kategori: string | null; benzersiz: number; komsu: string[] };
export type TrendKampanya = {
  id: string;
  boyut: number;
  toplamBildiren: number;
  kategori: string;
  uyeler: { deger: string; tip: string; benzersiz: number }[];
};

export function kampanyalariBul(dugumler: GostergeDugum[]): TrendKampanya[] {
  const harita = new Map(dugumler.map((d) => [d.id, d]));
  // Simetrik komşuluk (bağ tek yönlü yazılmış olabilir).
  const komsuluk = new Map<string, Set<string>>();
  const baglan = (a: string, b: string) => {
    if (!komsuluk.has(a)) komsuluk.set(a, new Set());
    komsuluk.get(a)!.add(b);
  };
  for (const d of dugumler) for (const n of d.komsu) { baglan(d.id, n); baglan(n, d.id); }

  const gorulen = new Set<string>();
  const kampanyalar: TrendKampanya[] = [];
  for (const bas of dugumler) {
    if (gorulen.has(bas.id)) continue;
    const kume: GostergeDugum[] = [];
    const kuyruk = [bas.id];
    gorulen.add(bas.id);
    while (kuyruk.length) {
      const id = kuyruk.shift() as string;
      const d = harita.get(id);
      if (d) kume.push(d);
      for (const n of komsuluk.get(id) || []) {
        if (!gorulen.has(n)) { gorulen.add(n); if (harita.has(n)) kuyruk.push(n); }
      }
    }
    if (kume.length >= 2) {
      kampanyalar.push({
        id: bas.id,
        boyut: kume.length,
        toplamBildiren: kume.reduce((s, k) => s + (k.benzersiz || 0), 0),
        kategori: kume.map((k) => k.kategori).find(Boolean) || "Karışık",
        uyeler: kume
          .map((k) => ({ deger: k.deger, tip: k.tip, benzersiz: k.benzersiz }))
          .sort((a, b) => b.benzersiz - a.benzersiz),
      });
    }
  }
  return kampanyalar.sort((a, b) => b.boyut - a.boyut).slice(0, 10);
}

const UA = { "User-Agent": "Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile", accept: "application/json" };

async function jget(url: string, ms = 8000): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

// AKTİF urlscan taraması başlat (URLSCAN_KEY varsa). urlscan sayfayı render edip TÜM
// giden link/istekleri yakalar → dolandırıcının sayfada ifşa ettiği iletişim kanalları
// (Telegram/WhatsApp/Discord) görünür. Başta başlat, sonda oku (tarama ~15-30s sürer).
async function urlscanTaramaBaslat(url: string): Promise<string | null> {
  const key = process.env.URLSCAN_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://urlscan.io/api/v1/scan/", {
      method: "POST",
      headers: { "API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ url, visibility: "unlisted", tags: ["sits-kampanya"] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { uuid?: string };
    return j?.uuid || null;
  } catch {
    return null;
  }
}

// YÜKSEK SİNYAL iletişim kanalları: dolandırıcının gerçekten kullandığı Telegram/
// WhatsApp/Discord. Instagram/Facebook/Twitter'ı KASTEN dışlarız — sahte sayfalar
// gerçek markanın footer'ını da klonlar → o linkler markanın kendi hesabıdır, yanıltır.
function iletisimCikar(arr: string[]): string[] {
  const out = new Set<string>();
  const kural: RegExp[] = [
    /(?:https?:\/\/)?(?:www\.)?t\.me\/(?:joinchat\/)?[A-Za-z0-9_+-]{3,}/i,
    /(?:https?:\/\/)?wa\.me\/\d{6,}/i,
    /(?:https?:\/\/)?(?:api\.)?whatsapp\.com\/send\?phone=\d{6,}/i,
    /(?:https?:\/\/)?(?:www\.)?discord\.(?:gg|com\/invite)\/[A-Za-z0-9]{4,}/i,
  ];
  for (const s of arr) {
    const str = String(s);
    if (/api\.telegram\.org\/bot\d+:/i.test(str)) { out.add("Telegram bot (veri sızdırma)"); continue; }
    for (const re of kural) {
      const m = str.match(re);
      if (m && !/\/share|sharer|intent\/|\/policies?|\/help|\/about/i.test(str)) out.add(m[0].replace(/^https?:\/\//, ""));
    }
  }
  return [...out].slice(0, 12);
}

// Aktif taramanın sonucunu bekle (hazır olana kadar poll) + iletişim kanallarını çıkar.
async function urlscanSosyalBekle(uuid: string, butceMs = 18000): Promise<string[]> {
  const bitis = Date.now() + butceMs;
  while (Date.now() < bitis) {
    const j = await jget(`https://urlscan.io/api/v1/result/${uuid}/`, 6000);
    if (j) {
      const lists = (j.lists as { domains?: string[]; urls?: string[] } | undefined) || {};
      const links = ((j.data as { links?: { href?: string }[] } | undefined)?.links || []).map((l) => l.href || "");
      const havuz = [...(lists.urls || []), ...links, ...(lists.domains || [])];
      if (havuz.length) return iletisimCikar(havuz); // sonuç hazır (veri geldi)
    }
    await bekle(2500); // henüz işleniyor (404) → bekle
  }
  return [];
}

// RDAP açılış tarihi + kaç gün önce.
async function rdapTarih(domain: string): Promise<{ iso?: string; gun?: number }> {
  const j = await jget(`https://rdap.org/domain/${encodeURIComponent(domain)}`, 6000);
  if (!j) return {};
  const ev = (j.events as { eventAction?: string; eventDate?: string }[] | undefined) || [];
  const kayit = ev.find((e) => e.eventAction === "registration")?.eventDate;
  if (!kayit) return {};
  const gun = Math.floor((Date.now() - new Date(kayit).getTime()) / 86_400_000);
  return { iso: kayit, gun: gun >= 0 ? gun : undefined };
}

type UsSonuc = {
  page?: { domain?: string; ip?: string; asn?: string; asnname?: string; country?: string; url?: string };
  task?: { time?: string; url?: string };
  screenshot?: string;
  result?: string;
};

// urlscan arama — verilen sorguya uyan taramaları döndür.
async function urlscanAra(q: string, size = 25): Promise<UsSonuc[]> {
  const j = await jget(`https://urlscan.io/api/v1/search/?q=${encodeURIComponent(q)}&size=${size}`, 9000);
  return (j?.results as UsSonuc[] | undefined) || [];
}

// urlscan TAM tarama — giden ağ isteklerinden Telegram/exfil hedeflerini çıkar.
async function urlscanExfil(resultUrl: string): Promise<{ zararli: boolean; telegramlar: string[]; exfil: string[]; uuid?: string }> {
  const j = await jget(resultUrl, 9000);
  if (!j) return { zararli: false, telegramlar: [], exfil: [] };
  const uuid = (j.task as { uuid?: string } | undefined)?.uuid;
  const lists = (j.lists as { domains?: string[]; urls?: string[] } | undefined) || {};
  const verdicts = j.verdicts as { overall?: { malicious?: boolean } } | undefined;
  const domains = lists.domains || [];
  const urls = lists.urls || [];
  const telegramlar = [
    ...new Set([
      ...domains.filter((d) => /(^|\.)t\.me$|(^|\.)telegram\.org$/i.test(d)),
      ...urls.filter((u) => /t\.me\/|api\.telegram\.org\/bot/i.test(u)).map((u) => (u.match(/t\.me\/[A-Za-z0-9_]+/i)?.[0] || "api.telegram.org (bot)")),
    ]),
  ].slice(0, 8);
  // exfil: kimlik hırsızı kitlerin tipik "gate" hedefleri
  const exfil = [
    ...new Set(urls.filter((u) => /api\.telegram\.org\/bot|\/gate\.php|\/panel|\/send\.php|\/log\.php|sendMessage/i.test(u))),
  ].slice(0, 10);
  return { zararli: !!verdicts?.overall?.malicious, telegramlar, exfil, uuid };
}

// Bir HTML gövdesinden HANGİ bilgilerin istendiğini (form alanları) çıkar.
function alanlariBul(html: string): string[] {
  const h = html.toLowerCase();
  const kural: [RegExp, string][] = [
    [/type=["']?password|parola|şifre|sifre|passw/, "şifre"],
    [/tckn|kimlik no|t\.?c\.? kimlik|11 hane|identity|national.?id/, "TC kimlik no"],
    [/cardnumber|card-number|card_number|kart\s*num|kredi kart|cc[-_]?num|pan\b/, "kart numarası"],
    [/cvv|cvc|güvenlik kodu|guvenlik kodu|securitycode/, "kart CVV"],
    [/son kullanma|expiry|expire|exp[-_]?date|ay\/yıl|mm\/yy/, "kart son kullanma"],
    [/\bsms\b|\botp\b|doğrulama kodu|onay kodu|tek kullanımlık|verification.?code|one.?time/, "SMS/onay kodu"],
    [/\biban\b/, "IBAN"],
    [/phone|telefon|gsm|cep no|mobile/, "telefon"],
    [/müşteri no|musteri no|customer.?no|user(name)?|kullanıcı ad|login.?id/, "kullanıcı/müşteri no"],
    [/anne kızlık|dogum tarih|doğum tarih|birth/, "kişisel doğrulama bilgisi"],
  ];
  const bulunan: string[] = [];
  for (const [re, ad] of kural) if (re.test(h)) bulunan.push(ad);
  return [...new Set(bulunan)];
}

// CANLI sayfadan form alanları — en iyi çaba (site kapalıysa boş döner).
async function istenenAlanlar(domain: string): Promise<string[]> {
  try {
    const r = await fetch(`https://${domain}`, {
      headers: { "User-Agent": UA["User-Agent"] },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    return alanlariBul((await r.text()).slice(0, 250_000));
  } catch {
    return [];
  }
}

// urlscan'de SAKLI DOM'dan form alanları — site kapalı/erişilemez olsa bile tarama
// anındaki asıl sahte formu görürüz. (uuid = urlscan tarama kimliği)
async function urlscanDomAlanlar(uuid: string): Promise<string[]> {
  try {
    const r = await fetch(`https://urlscan.io/dom/${uuid}/`, {
      headers: { "User-Agent": UA["User-Agent"] },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    return alanlariBul((await r.text()).slice(0, 400_000));
  } catch {
    return [];
  }
}

export type KampanyaDugum = {
  domain: string;
  ip?: string;
  asn?: string;
  ulke?: string;
  yil?: string;
  gunOnce?: number;
  ekran?: string;
  zararli?: boolean;
  canli: boolean;
  favEslesme?: boolean; // tohumla aynı favicon (aynı klon kit) mi
  neden: string; // operasyona bağlanma gerekçesi
};

export type Kampanya = {
  seed: string;
  marka?: string;
  ozet: string;
  domainler: KampanyaDugum[];
  ipler: string[];
  asnler: string[];
  telegramlar: string[];
  iletisimKanallari: string[]; // sayfanın ifşa ettiği Telegram/WhatsApp/Discord (dolandırıcı kanalları)
  exfil: string[];
  istenenAlanlar: string[];
  diger: string[]; // aynı markayı taşıyan ama farklı altyapıdaki domainler (ayrı kampanya olabilir)
  ilkTarih?: string;
  ilkGunOnce?: number;
  graf: Graf;
};

// ASN dizesinden sade numarayı çıkar ("AS16509 Amazon" → "AS16509").
function asnSade(s: string | null): string | undefined {
  if (!s) return undefined;
  const m = s.match(/AS\d+/i);
  return m ? m[0].toUpperCase() : undefined;
}

export async function kampanyaCozumle(seed: string): Promise<Kampanya> {
  const kok = seed.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

  // 0) AKTİF TARAMAYI HEMEN BAŞLAT (anahtar varsa) — render süresi (~20s) aşağıdaki
  // kümeleme işiyle ÖRTÜŞSÜN; sonuçları en sonda okuruz. Anahtar yoksa null → atlanır.
  const taramaUuid = await urlscanTaramaBaslat(`https://${kok}`);

  // 1) TOHUM: tam analiz (IP, ASN, taklit markası) + favicon parmak izi.
  // Dayanıklı: domainOsint/faviconHash bir domainde patlarsa akış çökmesin.
  const [rapor, seedFav] = await Promise.all([
    domainOsint(kok).catch(() => null),
    faviconHash(kok).catch(() => null),
  ]);
  let seedIp = rapor ? alanBul(rapor.alanlar, "ip adresi") : null;
  let seedAsn = rapor ? asnSade(alanBul(rapor.alanlar, "ağ (asn)", "asn")) : undefined;
  const taklit = rapor ? alanBul(rapor.alanlar, "taklit") : null;
  // domainOsint IP veremediyse tohumu urlscan'den tamamla (kümeleme IP'ye dayanıyor).
  if (!seedIp) {
    const su = await urlscanAra(`page.domain:"${kok}"`, 1);
    if (su[0]?.page?.ip) seedIp = su[0].page.ip;
    if (!seedAsn && su[0]?.page?.asn) seedAsn = asnSade(su[0].page.asn);
  }
  // Marka anahtarını bul (taklit alanından ya da domainin kendisinden).
  const marka = AVCI_MARKALAR.find(
    (m) => (taklit && taklit.toLowerCase().includes(m.anahtar)) || kok.includes(m.anahtar)
  );

  // 2) KEŞİF — urlscan brand search (ASIL kaynak; crt.sh Vercel'den timeout ediyor).
  // urlscan JS render eder → domain+IP+ASN+ekran'ı TEK çağrıda verir (ayrı prob yok).
  // urlscan sorgu notu: serbest metin (q=turkcell) ve baştan-joker (*turkcell*) BOŞ
  // döner; çalışan tek biçim PREFIX: page.domain:turkcell* → gerçek kümeyi bulur.
  const [markaSonuc, ipSonuc] = await Promise.all([
    marka ? urlscanAra(`page.domain:${marka.anahtar}*`, 40) : Promise.resolve([] as UsSonuc[]),
    seedIp ? urlscanAra(`page.ip:"${seedIp}"`, 20) : Promise.resolve([] as UsSonuc[]),
  ]);

  type Aday = { domain: string; ip?: string; asn?: string; ulke?: string; ekran?: string; markaAd: boolean; ipKaynak: boolean };
  const adayMap = new Map<string, Aday>();
  const koy = (domRaw: string | undefined, ip?: string, asn?: string, ulke?: string, ekran?: string, kaynak?: string) => {
    const d = (domRaw || "").toLowerCase().replace(/^www\./, "").trim();
    if (!d || d === kok || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) || resmiMarkaDomaini(d)) return;
    const markaAd = Boolean(marka && d.includes(marka.anahtar));
    const cur = adayMap.get(d) || { domain: d, markaAd, ipKaynak: false };
    if (ip && !cur.ip) cur.ip = ip;
    if (asn && !cur.asn) cur.asn = asnSade(asn);
    if (ulke && !cur.ulke) cur.ulke = ulke;
    if (ekran && !cur.ekran) cur.ekran = ekran;
    if (kaynak === "ip") cur.ipKaynak = true;
    cur.markaAd = cur.markaAd || markaAd;
    adayMap.set(d, cur);
  };
  for (const s of markaSonuc) koy(s.page?.domain, s.page?.ip, s.page?.asn, s.page?.country, s.screenshot, "marka");
  for (const s of ipSonuc) koy(s.page?.domain, s.page?.ip, s.page?.asn, s.page?.country, s.screenshot, "ip");
  const adaylar = [...adayMap.values()].slice(0, 45);

  // 3) FAVICON — yalnızca tohumla AYNI IP'deki, marka-adı OLMAYAN kiracılar için
  // (aynı klon kit mi?). Paylaşımlı hosting'deki masum kiracıyı elemenin tek yolu.
  const favAdaylar = seedFav ? adaylar.filter((a) => a.ipKaynak && !a.markaAd && a.ip === seedIp).slice(0, 8) : [];
  const favEsit = new Set<string>();
  await Promise.all(
    favAdaylar.map(async (a) => {
      const f = await faviconHash(a.domain).catch(() => null);
      if (f && f === seedFav) favEsit.add(a.domain);
    })
  );

  // 4) ÜYELİK + BAĞLI BİLEŞEN. "Aynı operasyon" = tohumla ALTYAPIYI paylaşan marka
  // klonları: aynı IP (güçlü) ya da aynı ASN+marka (orta). Aynı markayı taşıyıp farklı
  // altyapıdakiler AYRI kampanya olabilir → 'diger' olarak dürüstçe ayrılır.
  const uyeAdaylar = adaylar.filter((a) => a.markaAd || favEsit.has(a.domain));
  const uyeler: KampanyaDugum[] = [];
  const diger: string[] = []; // aynı marka, farklı altyapı (ayrı operasyon olabilir)
  for (const a of uyeAdaylar) {
    const ayniIpMi = seedIp && a.ip === seedIp;
    const ayniAsnMi = seedAsn && a.asn === seedAsn;
    let neden: string | null = null;
    if (favEsit.has(a.domain)) neden = "aynı sunucu + aynı klon sayfa";
    else if (ayniIpMi) neden = "aynı sunucu (IP) + marka adı";
    else if (ayniAsnMi && a.markaAd) neden = "aynı ağ (ASN) + marka adı";
    if (neden) uyeler.push({ domain: a.domain, ip: a.ip, asn: a.asn, ulke: a.ulke, ekran: a.ekran, canli: Boolean(a.ip), neden });
    else if (a.markaAd) diger.push(a.domain); // marka klonu ama tohumun altyapısında değil
  }
  // Üyeler için RDAP tarihleri (zaman çizelgesi) — sınırlı.
  await Promise.all(
    uyeler.slice(0, 14).map(async (u) => {
      const t = await rdapTarih(u.domain);
      u.yil = t.iso?.slice(0, 4);
      u.gunOnce = t.gun;
    })
  );

  // 5) TELEGRAM / EXFIL + tohum taraması. urlscan tam taramasından giden istekler
  // (Telegram/exfil) + tarama kimliği (uuid → saklı DOM).
  let telegramlar: string[] = [];
  let exfil: string[] = [];
  let seedZararli = false;
  let seedUuid: string | undefined;
  const seedUs = await urlscanAra(`page.domain:"${kok}"`, 1);
  if (seedUs[0]?.result) {
    const e = await urlscanExfil(seedUs[0].result);
    telegramlar = e.telegramlar;
    exfil = e.exfil;
    seedZararli = e.zararli;
    seedUuid = e.uuid;
  }

  // 6) İSTENEN ALANLAR — önce CANLI sayfa; boşsa urlscan'de SAKLI DOM'dan (site
  // kapalı/erişilemez olsa bile tarama anındaki asıl sahte formu görürüz).
  let alanlar = await istenenAlanlar(kok);
  if (!alanlar.length && seedUuid) alanlar = await urlscanDomAlanlar(seedUuid);

  // 6b) İLETİŞİM KANALLARI — başta başlattığımız aktif taramanın sonucundan sayfanın
  // ifşa ettiği Telegram/WhatsApp/Discord (dolandırıcının gerçek kanalları).
  const aktifIletisim = taramaUuid ? await urlscanSosyalBekle(taramaUuid) : [];
  const iletisimKanallari = [...new Set([...telegramlar, ...aktifIletisim])].slice(0, 12);

  // 7) ZAMAN ÇİZELGESİ — tohum + üyeler arasında en eski açılış.
  const seedTarih = await rdapTarih(kok);
  const tumTarihli = [
    { domain: kok, gun: seedTarih.gun, iso: seedTarih.iso },
    ...uyeler.map((u) => ({ domain: u.domain, gun: u.gunOnce, iso: undefined as string | undefined })),
  ].filter((x) => typeof x.gun === "number");
  tumTarihli.sort((a, b) => (b.gun ?? 0) - (a.gun ?? 0)); // en eski (en çok gün) önce
  const ilk = tumTarihli[0];

  // 8) GRAF — domain→IP→ASN + tohum kökü.
  const g = new GrafKurucu();
  const seedDugum = g.dugum({ id: kok, tur: "domain", etiket: kok, kok: true, risk: rapor?.risk, url: `https://${kok}` });
  if (seedIp) { g.dugum({ id: seedIp, tur: "ip", etiket: seedIp }); g.kenar(seedDugum, seedIp, "resolves"); }
  if (seedAsn) { g.dugum({ id: seedAsn, tur: "asn", etiket: seedAsn }); if (seedIp) g.kenar(seedIp, seedAsn, "asn"); }
  for (const u of uyeler) {
    g.dugum({ id: u.domain, tur: "domain", etiket: u.domain, alt: u.neden, url: `https://${u.domain}` });
    if (u.ip) { g.dugum({ id: u.ip, tur: "ip", etiket: u.ip }); g.kenar(u.domain, u.ip, "resolves"); }
    if (u.asn) { g.dugum({ id: u.asn, tur: "asn", etiket: u.asn }); if (u.ip) g.kenar(u.ip, u.asn, "asn"); }
  }
  for (const t of iletisimKanallari) { g.dugum({ id: t, tur: "ioc", etiket: t, alt: "iletişim kanalı" }); g.kenar(seedDugum, t, "ioc"); }

  // Envanteri derle.
  const tumDomainler: KampanyaDugum[] = [
    { domain: kok, ip: seedIp || undefined, asn: seedAsn, yil: seedTarih.iso?.slice(0, 4), gunOnce: seedTarih.gun, canli: true, zararli: seedZararli, neden: "tohum (sorgulanan)", ekran: seedUs[0]?.screenshot },
    ...uyeler,
  ];
  const ipler = [...new Set(tumDomainler.map((d) => d.ip).filter(Boolean) as string[])];
  const asnler = [...new Set(tumDomainler.map((d) => d.asn).filter(Boolean) as string[])];

  // ÖZET cümlesi (kullanıcının istediği tarz). Kardeş bulunduysa "operasyon",
  // bulunmadıysa dürüstçe "tek domain / geniş ağ görünmüyor".
  const parcalar: string[] = [];
  if (uyeler.length > 0) {
    parcalar.push(`Bu ${tumDomainler.length} domain, ${ipler.length} IP ve ${asnler.length} ASN üzerinden ${marka ? `${marka.ad} taklidi ` : ""}aynı operasyonun parçası görünüyor.`);
    if (ilk && typeof ilk.gun === "number") parcalar.push(`En eski parça ${ilk.gun} gün önce açılmış (${ilk.domain}).`);
  } else {
    parcalar.push(`${marka ? `${marka.ad} taklidi görünen ` : ""}bu domaine bağlı geniş bir kampanya ağı (kardeş domain/sunucu) şu an bulunamadı — tek başına ya da parçaları henüz görünür değil.`);
    if (typeof seedTarih.gun === "number") parcalar.push(`Domain ${seedTarih.gun} gün önce açılmış.`);
  }
  if (alanlar.length) parcalar.push(`Sayfa şu bilgileri istiyor: ${alanlar.join(", ")}.`);
  if (iletisimKanallari.length) parcalar.push(`Sayfada ${iletisimKanallari.length} iletişim kanalı (Telegram/WhatsApp/Discord) ifşa olmuş.`);
  else if (telegramlar.length) parcalar.push(`Çalınan veri ${telegramlar.length} Telegram hedefine gidiyor.`);
  if (diger.length) parcalar.push(`Ayrıca ${marka?.ad || "aynı marka"} adını taşıyan ${diger.length} sahte domain daha başka sunucularda görüldü (ayrı kampanyalar olabilir).`);
  const ozet = parcalar.join(" ");

  return {
    seed: kok,
    marka: marka?.ad,
    ozet,
    domainler: tumDomainler,
    ipler,
    asnler,
    telegramlar,
    iletisimKanallari,
    exfil,
    istenenAlanlar: alanlar,
    diger: diger.slice(0, 20),
    ilkTarih: ilk?.iso,
    ilkGunOnce: typeof ilk?.gun === "number" ? ilk.gun : undefined,
    graf: g.sonuc(),
  };
}
