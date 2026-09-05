// Açık kaynak istihbarat (OSINT) zenginleştirme — ücretsiz, anahtarsız kaynaklar.
// domain: RDAP (yaş/registrar) + DNS (IP) + ip-api (barındırma) + TLD sezgisi
// telefon: operatör (prefix) + geçerlilik
// iban: banka (kod) + geçerlilik (mod-97)

export type Alan = { ad: string; deger: string };
export type OsintRapor = {
  tip: string;
  deger: string;
  alanlar: Alan[];
  bulgular: string[]; // risk artıran gözlemler
  risk: number; // 0-100 (crowd/seed sinyalleri API'de eklenir)
  ekranGoruntusu?: string; // urlscan.io ekran görüntüsü URL'i
  ekranNotu?: string; // ekran görüntüsü yanıltıcıysa (varsayılan/boş sayfa) dürüst not
  sayfa?: SayfaBilgi; // paylaşılan sayfanın içerik özeti (başlık/tür/açıklama)
};

import tls from "node:tls";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { tehditKontrol } from "./tehditListeleri";
import { itibarliMi } from "./itibarli";
import { seonTelefon } from "./seon";
import { AVCI_MARKALAR, resmiMarkaDomaini, KAMU_KURUMLARI, tescilliBilgi } from "./korunanMarkalar";
import { geminiVarMi, geminiGorselJson } from "./gemini";
import { faviconMarkaEslesme } from "./faviconMarka";

// Canlı TLS sertifikasını okur: CA (issuer), geçerlilik başlangıcı ve
// sertifikanın geçerli/güvenilir olup olmadığı (kendinden-imzalı/uyumsuz = risk).
function sslBilgi(
  host: string,
  ms = 6000
): Promise<{ authorized: boolean; issuer?: string; notBefore?: string } | null> {
  return new Promise((resolve) => {
    let bitti = false;
    let socket: tls.TLSSocket | null = null;
    const bit = (v: { authorized: boolean; issuer?: string; notBefore?: string } | null) => {
      if (bitti) return;
      bitti = true;
      try { socket?.destroy(); } catch {}
      resolve(v);
    };
    try {
      socket = tls.connect({ host, port: 443, servername: host, timeout: ms, rejectUnauthorized: false }, () => {
        const c = socket!.getPeerCertificate();
        if (!c || !c.valid_from) return bit(null);
        const ham = c.issuer ? c.issuer.O ?? c.issuer.CN : undefined;
        const issuer = Array.isArray(ham) ? ham[0] : ham;
        bit({ authorized: socket!.authorized, issuer, notBefore: c.valid_from });
      });
      socket.on("error", () => bit(null));
      socket.on("timeout", () => bit(null));
    } catch {
      bit(null);
    }
    setTimeout(() => bit(null), ms + 500);
  });
}

// /favicon.ico'yu çekip içeriğinin parmak izini (hash + boyut) döner.
// İki sitenin aynı parmak izi = aynı favicon = biri diğerini kopyalamış.
export async function faviconHash(domain: string, ms = 5000): Promise<string | null> {
  try {
    const r = await guvenliGetir(`https://${domain}/favicon.ico`, ms, TARAYICI_BASLIK); // SSRF-korumalı
    if (!r || !r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 16) return null;
    let h = 5381;
    for (let i = 0; i < buf.length; i++) h = ((h << 5) + h + buf[i]) >>> 0; // djb2
    return `${h.toString(16)}_${buf.length}`;
  } catch {
    return null;
  }
}

// FAVİCON PİVOT (adım 9): domainin favicon'unu al → SHA256 → urlscan'de aynı favicon'a
// sahip DİĞER domainleri bul. Aynı favicon = çoğu zaman aynı phishing-kit/operasyon.
export async function faviconPivot(domain: string, ms = 6000): Promise<string[]> {
  try {
    const r = await guvenliGetir(`https://${domain}/favicon.ico`, ms, TARAYICI_BASLIK);
    if (!r || !r.ok) return [];
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 16) return [];
    const sha = createHash("sha256").update(buf).digest("hex");
    const key = process.env.URLSCAN_KEY;
    const us = await fetch(`https://urlscan.io/api/v1/search/?q=hash:${sha}&size=25`, {
      headers: key ? { "API-Key": key } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (!us.ok) return [];
    const j = (await us.json()) as { results?: { page?: { domain?: string } }[] };
    const doms = new Set<string>();
    for (const res of j.results || []) {
      const d = (res.page?.domain || "").toLowerCase().replace(/^www\./, "");
      if (d && d !== domain && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) doms.add(d);
    }
    return [...doms].slice(0, 15);
  } catch {
    return [];
  }
}

async function json(url: string, ms = 6000): Promise<Record<string, unknown> | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Bir domainin ilk A kaydını (IP) DoH ile çöz.
async function ilkA(domain: string): Promise<string | null> {
  const j = await json(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, 4000);
  const ans = (j?.Answer as { type?: number; data?: string }[] | undefined) || [];
  return ans.find((a) => a.type === 1 && a.data)?.data || null;
}

// IPv4 /22 ağ öneki. Kurumlar genelde bitişik /24'ler kullanır (DNS round-robin
// farklı /24'e düşebilir) → /24 çok dar, /22 (4×/24) "aynı kurum bloğu" için sağlam.
export function pref22(ip: string): string | null {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => isNaN(n))) return null;
  return `${o[0]}.${o[1]}.${o[2] & 0xfc}`;
}

const RISKLI_TLD = ["xyz", "top", "tk", "buzz", "icu", "cyou", "rest", "monster", "click", "shop", "live", "online", "site"];

// Sık taklit edilen Türk marka/kurumları: anahtar kelime -> resmi alan(lar).
// Tek kaynak: korunan marka listesi (avcı + typosquatting + favicon karşılaştırması ORTAK).
const MARKALAR = AVCI_MARKALAR; // kısa anahtar (ern) substring gürültüsünü dışla

// SSRF koruması: özel/ayrılmış (iç ağ, loopback, link-local, bulut-metadata,
// CGNAT, çoklu-yayın) IP aralıkları. IPv4 + IPv6. (test için export)
export function ozelIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v.includes(":")) {
    // IPv6
    if (v === "::1" || v === "::") return true; // loopback / unspecified
    if (/^(fe80:|fc|fd)/.test(v)) return true; // link-local + unique-local
    if (/^::ffff:(\d{1,3}\.){3}\d{1,3}$/.test(v)) return ozelIp(v.split(":").pop() || ""); // IPv4-mapped
    if (/^(2001:db8:|64:ff9b:)/.test(v)) return true;
    return false;
  }
  const p = v.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => isNaN(n) || n < 0 || n > 255)) return true; // biçimsiz → engelle
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + bulut metadata (169.254.169.254)
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0/24 + 192.0.2 (TEST-NET)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224) return true; // çoklu-yayın + ayrılmış
  return false;
}

// Bir host'un ÇÖZÜMLENDİĞİ tüm IP'ler güvenli (public) mi? SSRF için şart.
async function hostGuvenli(host: string): Promise<boolean> {
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !ozelIp(a.address));
  } catch {
    return false;
  }
}

// Güvenli sunucu-tarafı getirme: her adımda host→IP doğrular, redirect'i MANUEL
// takip edip yeni host'u yeniden doğrular (iç ağa yönlendirme SSRF'ini engeller).
async function guvenliGetir(url: string, ms: number, headers: Record<string, string>): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try { u = new URL(current); } catch { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!(await hostGuvenli(u.hostname))) return null; // özel/iç adres → reddet
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    let r: Response;
    try {
      r = await fetch(current, { signal: ctrl.signal, redirect: "manual", headers });
    } catch {
      return null; // zaman aşımı / bağlantı hatası → siteyi güvenle "yanıtsız" say (analiz çökmesin)
    } finally {
      clearTimeout(t);
    }
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc) return r;
      current = new URL(loc, current).toString(); // rölatif redirect'i çöz → başta yeniden doğrula
      continue;
    }
    return r;
  }
  return null; // çok fazla redirect
}

// Sayfa GÖVDESİNDEN istemci-taraflı yönlendirme hedefini çıkar — RENDER GEREKMEZ.
// Dolandırıcılar HTTP 3xx yerine sıklıkla meta-refresh ya da JS ile atar; urlscan
// taze siteyi taramamış olabilir, bu yüzden hedefi HTML'in kendisinden okuyoruz.
function istemciYonlendirmesi(html: string, taban: string): string | null {
  const cozumle = (u: string): string | null => {
    try { return new URL(u.replace(/^['"]|['"]$/g, "").trim(), taban).href; } catch { return null; }
  };
  // 1) <meta http-equiv="refresh" content="0; url=..."> — kesin yönlendirme sinyali
  const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/i);
  if (meta) return cozumle(meta[1]);
  // 2) JS yönlendirme — yalnız sayfanın BAŞINDA (redirect stub'ları en üstte olur;
  //    derindeki analytics location'larını yakalamamak için ilk 8KB ile sınırla).
  const bas = html.slice(0, 8000);
  const js =
    bas.match(/(?:window\.|top\.|self\.|document\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i) ||
    bas.match(/location\.(?:replace|assign)\s*\(\s*["']([^"']+)["']/i);
  if (js) { const h = cozumle(js[1]); if (h && /^https?:/i.test(h)) return h; }
  return null;
}

// YÖNLENDİRME ZİNCİRİ: linke gidince nereye nereye atıyor? (temiz link → ara durak →
// asıl sahte sayfa numarası). HTTP 3xx YANINDA meta-refresh + JS yönlendirmesini de
// (render'sız, HTML'den) izler; her adımı SSRF'e karşı doğrular.
async function yonlendirmeZinciri(basla: string, ms = 8000): Promise<string[]> {
  const zincir: string[] = [];
  let current = /^https?:\/\//.test(basla) ? basla : `http://${basla}`;
  for (let hop = 0; hop < 6; hop++) {
    let u: URL;
    try { u = new URL(current); } catch { break; }
    if (u.protocol !== "https:" && u.protocol !== "http:") break;
    if (!(await hostGuvenli(u.hostname))) break;
    zincir.push(u.href);
    let r: Response;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      try { r = await fetch(current, { signal: ctrl.signal, redirect: "manual", headers: TARAYICI_BASLIK }); }
      finally { clearTimeout(t); }
    } catch { break; }
    // HTTP 3xx sunucu yönlendirmesi
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc) break;
      const sonraki = new URL(loc, current).href;
      if (zincir.includes(sonraki)) break; // döngü
      current = sonraki;
      continue;
    }
    // HTTP 200: sayfanın İÇİNDE istemci-taraflı (meta/JS) yönlendirme var mı?
    if (r.status === 200) {
      let govde = "";
      try {
        const buf = await r.arrayBuffer();
        govde = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 60000));
      } catch { break; }
      const hedef = istemciYonlendirmesi(govde, current);
      if (hedef && !zincir.includes(hedef)) { current = hedef; continue; }
    }
    break; // yönlendirme bitti (son sayfa)
  }
  return zincir;
}

// Bir görsel URL'i GERÇEKTEN var mı (200) — urlscan pasif araması bazen eski/başarısız
// taramanın screenshot'ını döndürür ama dosya 404'tür (park sitelerde sık). Kırık
// <img> göstermemek için set etmeden önce doğrula.
async function gorselVar(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return r.ok && (r.headers.get("content-type") || "").startsWith("image");
  } catch {
    return false;
  }
}

// Gerçek bir Türk vatandaşının telefon tarayıcısı gibi görün: WAF'lar bilinen
// güvenlik tarayıcılarını (VT, urlscan) engeller ama sıradan bir ziyaretçiyi
// içeri alır — çünkü kurbanın kendisi tam olarak böyle görünür.
const TARAYICI_BASLIK = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.6",
  "Upgrade-Insecure-Requests": "1",
};

// Reverse-IP: bir IP'de barındırılan domain sayısı (HackerTarget, ücretsiz/kotalı).
// Kota dolduğunda ya da hata olduğunda null döner → çağıran sessiz geçer.
// GreyNoise (community, ücretsiz/anahtarsız) — IP zararlı aktör mü / bilinen
// kurumsal altyapı mı (riot). Çoğu phishing host'u "gözlemlenmedi" döner; asıl
// değeri: 'malicious' zararlı sinyali + 'riot/benign' yanlış-pozitif azaltıcı.
async function greyNoise(ip: string): Promise<{ classification?: string; riot: boolean; ad?: string } | null> {
  try {
    const r = await fetch(`https://api.greynoise.io/v3/community/${encodeURIComponent(ip)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { classification: j?.classification, riot: !!j?.riot, ad: j?.name };
  } catch {
    return null;
  }
}

// AbuseIPDB — sunucu IP'sinin kötüye kullanım itibarı (ABUSEIPDB_KEY varsa).
async function abuseIp(ip: string): Promise<{ skor: number; rapor: number } | null> {
  const key = process.env.ABUSEIPDB_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
      { headers: { Key: key, Accept: "application/json" }, signal: AbortSignal.timeout(6000) }
    );
    const j = await r.json();
    const x = j?.data;
    if (!x) return null;
    return { skor: Number(x.abuseConfidenceScore || 0), rapor: Number(x.totalReports || 0) };
  } catch {
    return null;
  }
}

async function reverseIpSayisi(ip: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.hackertarget.com/reverseiplookup/?q=${encodeURIComponent(ip)}`, {
      headers: TARAYICI_BASLIK,
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const t = (await r.text()).trim();
    // Kota/hata metinleri: "API count exceeded", "error", "No DNS A records"
    if (!t || /error|exceeded|no records|invalid/i.test(t)) return null;
    const satirlar = t.split(/\r?\n/).filter((s) => s.includes("."));
    return satirlar.length || null;
  } catch {
    return null;
  }
}

// HTML'den bir öznitelik/etiket değeri çıkar (basit, bağımlılıksız).
function nitelik(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 300) : null;
}

export type SayfaBilgi = {
  baslik: string | null;
  aciklama: string | null;
  siteAdi: string | null;
  tur: string; // "Haber sitesi", "Giriş/oturum sayfası", "Alışveriş", …
  ozetMetin: string; // görünür metinden kısa örnek (AI'ya bağlam)
};

// Paylaşılan sayfanın NE OLDUĞUNU çıkar: başlık, açıklama, site adı, içerik türü.
function sayfaBilgiCikar(html: string): SayfaBilgi {
  const baslik =
    nitelik(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    nitelik(html, /<title[^>]*>([^<]+)<\/title>/i);
  const aciklama =
    nitelik(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    nitelik(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const siteAdi = nitelik(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);

  const t = html.toLowerCase();
  const ogType = nitelik(t, /<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i) || "";
  // Görünür metin örneği (etiketleri kabaca temizle)
  const govde = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const gorunur = govde.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // İçerik türü — kural tabanlı sınıflama. SIRA ÖNEMLİ: haber/alışveriş gibi
  // içerik sinyalleri, "giriş yap" gibi her sitenin header'ında olan zayıf
  // ipuçlarından ÖNCE gelir. "Giriş sayfası" ancak GERÇEK şifre alanı varsa.
  const sifreAlani = /type=["']?password/.test(t);
  let tur = "Genel web sayfası";
  if (/(bahis|casino|iddaa|slot makine|jackpot|deneme bonus|bonus veren|güncel giriş adresi)/.test(t))
    tur = "Bahis / kumar (yasa dışı olabilir)";
  else if (ogType.includes("article") || /(son dakika|manşet|gündem|haberler|muhabir|köşe yazı|gazete|haber merkezi)/.test(t))
    tur = "Haber / makale sitesi";
  else if (/(sepete ekle|satın al|ücretsiz kargo|stokta|ürün detay)/.test(t) || (/(sepet|checkout|cart)/.test(t) && /(fiyat|₺|indirim)/.test(t)))
    tur = "Alışveriş / e-ticaret sitesi";
  else if (/(bitcoin|kripto para|usdt|binance|airdrop|yatırım getiri|kazanç garanti)/.test(t))
    tur = "Kripto / yatırım";
  else if (/(kargo takip|gönderi takip|teslimat adresi|gümrük ödeme)/.test(t))
    tur = "Kargo / teslimat";
  else if (ogType.includes("profile") || /(takipçi|followers|gönderi paylaş)/.test(t))
    tur = "Sosyal medya / profil";
  else if (sifreAlani)
    tur = "Giriş / oturum açma sayfası";

  return { baslik, aciklama, siteAdi, tur, ozetMetin: gorunur.slice(0, 600) };
}

// Bilinen kimlik/ödeme sağlayıcıları — meşru sitelerin veri POST'ladığı yerler
// (dış-adres = oltalama SANMA). recaptcha/analytics de dahil (üçüncü-taraf ama zararsız).
const GUVENLI_HEDEF = /(google|gstatic|recaptcha|hcaptcha|facebook|fbcdn|apple|microsoft(online)?|live\.com|okta|auth0|stripe|paypal|adyen|braintree|iyzico|paytr|payu|cloudflare|cognito|firebaseapp|googleapis|doubleclick|analytics|sentry|hotjar|cloudfront)/i;

// ── REKLAM / PARA-KAZANMA TESPİTİ ──────────────────────────────────────────
// "Bu sayfanın amacı ne? İçinde reklam var mı?" sorusunun cevabı. İki sınıf:
//  YAYGIN — AdSense/media.net/Taboola gibi ağlar; MEŞRU haber/blog sitelerinde de
//    olur, tek başına suç DEĞİL (yanlış-pozitif tuzağı burada).
//  AGRESİF — popads/adsterra/propellerads gibi pop-up/zorla-yönlendirme ağları;
//    meşru bir markada NEREDEYSE hiç görülmez, tipik typosquat/warez para-kazanması.
const REKLAM_YAYGIN = /(pagead2\.googlesyndication|adsbygoogle|data-ad-client|ca-pub-|securepubads|googletag(services|\.cmd)|contextual\.media\.net|\bmedia\.net\b|taboola|outbrain|amazon-adsystem|adnxs\.com|criteo|pubmatic|\bmgid\b|revcontent|yieldmo|sharethrough)/i;
const REKLAM_AGRESIF = /(popads|popcash|propellerads|propeller-tracking|adsterra|hilltopads|\badcash\b|clickadu|ad-maven|admaven|onclickads|exoclick|juicyads|adnium|clicksor|popmyads)/i;
function reklamAglari(ham: string): { yaygin: boolean; agresif: boolean } {
  return { yaygin: REKLAM_YAYGIN.test(ham), agresif: REKLAM_AGRESIF.test(ham) };
}

// ── VARSAYILAN / BOŞ KURULUM SAYFASI TESPİTİ ─────────────────────────────────
// urlscan görüntüsü bazen sahte içeriği DEĞİL, hosting'in varsayılan sayfasını
// gösterir (CyberPanel/nginx/Apache…). Sebep: zararlı içerik kaldırılmış YA DA
// tarayıcıya gizleniyor (cloaking). Bunu "kanıt" gibi sunmayalım — dürüst not düşelim.
const VARSAYILAN_SAYFA = /(successfully installed cyberpanel|please remove this page and upload|welcome to nginx|apache2? (ubuntu |debian )?default page|<title>\s*it works!|index of \/<|default web (page|site)|site not (yet )?configured|litespeed web server|this is the default (index|welcome)|hosting.{0,20}default page|domain (default|park))/i;
function varsayilanSayfaMi(ham: string): boolean {
  return VARSAYILAN_SAYFA.test(ham);
}

// ── TAKİP KİMLİĞİ PİVOTU ────────────────────────────────────────────────────
// Sayfaya gömülü analytics/reklam hesap kimlikleri (Google Analytics, GTM, AdSense
// yayıncı, Yandex Metrica, Facebook Pixel). Değeri: aynı kimliği taşıyan iki farklı
// domain NEREDEYSE KESİN aynı kişiye/operasyona aittir — altyapı (IP/NS) değişse bile
// saldırgan aynı ölçümleme hesabını yeniden kullanır. En güçlü tekil atıf sinyali.
function takipKimlikleri(ham: string): string[] {
  const set = new Set<string>();
  const ekle = (re: RegExp, on: string) => { for (const m of ham.matchAll(re)) set.add(on + m[1]); };
  ekle(/\b(UA-\d{4,10}-\d{1,4})\b/g, "");                       // Universal Analytics
  ekle(/\b(G-[A-Z0-9]{6,12})\b/g, "");                          // GA4
  ekle(/\b(GTM-[A-Z0-9]{5,9})\b/g, "");                         // Google Tag Manager
  ekle(/\b(?:ca-)?pub-(\d{15,17})\b/g, "AdSense pub-");         // AdSense yayıncı
  ekle(/ym\(\s*(\d{5,10})\s*,/g, "Yandex ");                    // Yandex Metrica
  ekle(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,17})['"]/g, "FB Pixel "); // Facebook Pixel
  return [...set].slice(0, 6);
}

function iceriktenBulgu(ham: string, r: OsintRapor) {
  const t = ham.toLowerCase();
  // Diğer sinyaller şüpheli mi? (yeni domain, taklit, IDN, geçersiz SSL, riskli TLD…)
  // Meşru bir giriş sayfasındaki şifre alanı tek başına suç değildir; ancak
  // başka şüphe varsa şifre/kart alanı güçlü bir oltalama işaretidir.
  const supheli =
    r.risk >= 25 || r.alanlar.some((a) => ["Taklit uyarısı", "IDN uyarısı", "SSL uyarısı"].includes(a.ad));
  const sifreVar = /type=["']?password/.test(t);
  const kartVar = /autocomplete=["']?cc-number|kart\s*(numara|no)|card\s*number|cvv|cvc/.test(t);

  if (sifreVar) {
    if (supheli) {
      r.risk += 25;
      r.bulgular.push("Şüpheli bir sitede ŞİFRE giriş alanı var — kimlik bilgini çalmaya çalışıyor olabilir.");
    } else {
      r.risk += 6; // muhtemelen meşru giriş sayfası — sadece hafif temkin
    }
  }
  if (kartVar) {
    // Meşru bir sitede ödeme/kart alanı NORMALDİR — sadece BAŞKA şüphe varsa uyar.
    if (supheli) {
      r.risk += 30;
      r.bulgular.push("Şüpheli bir sitede KART bilgisi isteniyor — ödeme yapmadan önce adrese ve kilit simgesine iki kez bak.");
    }
  }
  if (/(kazand[ıi]n[ıi]z|hediye kazan|çekiliş|son \d+ saat|acele et|ücretsiz iphone|tıkla.{0,10}kazan)/.test(t)) {
    r.risk += 12;
    r.bulgular.push("Sayfada 'kazandınız / acele et' gibi baskı-tuzak ifadeleri var.");
  }

  // ── İÇERİK KURUM TAKLİDİ: domaindeki isimden BAĞIMSIZ, sayfada taklit edilen kamu kurumu ──
  // Örn. domainde "garanti" var ama içerik Ticaret Bakanlığı adı+logosuyla sahte turizm sitesi.
  // Sayfa bir kamu kurumu adı taşıyor + resmî .gov.tr DEĞİL → kurum taklidi.
  const buDomain = String(r.deger).split("/")[0];
  const kurumAdlari = new Set<string>();
  for (const k of KAMU_KURUMLARI) {
    if (buDomain === k.resmi || buDomain.endsWith("." + k.resmi)) continue; // resmî kurum sitesi → atla
    if (k.kelimeler.some((kel) => t.includes(kel))) kurumAdlari.add(k.ad);
  }
  if (kurumAdlari.size) {
    const adlar = [...kurumAdlari];
    if (supheli) {
      r.risk += 40;
      r.bulgular.unshift(`Sayfa bir KAMU KURUMUNU taklit ediyor: ${adlar.slice(0, 3).join(", ")} — ama resmî .gov.tr adresi DEĞİL. Devlet kurumu adına açılmış sahte site olabilir; kişisel/ödeme bilgisi girme.`);
      r.alanlar.push({ ad: "İçerikte kurum taklidi", deger: adlar.slice(0, 4).join(", ") });
    } else {
      // Şüphe yoksa (haber sitesi kurumu ANABİLİR) sadece bilgi olarak not düş.
      r.alanlar.push({ ad: "İçerikte kurum adı", deger: `${adlar.slice(0, 3).join(", ")} (bahsediliyor — resmî adresi doğrula)` });
    }
  }

  // ── KLON TESPİTİ (delil): sayfa BAŞKA bir sitenin KOPYASI mı? ──
  // "saved from url=(NN)http://X" işareti = sayfa X'ten kazınıp kaydedilmiş bir kopya.
  // Bir ödeme/marka sitesini klonlayıp benzer/typo bir adrese koymak klasik sahte
  // sayfa hazırlığıdır (ör. turcell.com.tr'ye konmuş TaakPay.com kopyası).
  const klon = ham.match(/saved from url=\(\d+\)\s*(https?:\/\/[^\s"'>]+)/i);
  if (klon) {
    const kaynakHost = (klon[1].match(/^https?:\/\/([^/]+)/i)?.[1] || "").replace(/^www\./, "").toLowerCase();
    const buHost = buDomain.replace(/^www\./, "");
    // Kaynak markası bu domainin markasından FARKLIYSA → başka bir sitenin kopyası.
    if (kaynakHost && tescilliBilgi(buHost).label !== tescilliBilgi(kaynakHost).label) {
      r.risk += 35;
      r.bulgular.unshift(`Bu sayfa BAŞKA bir sitenin (${kaynakHost}) BİREBİR KOPYASI — kaynağından kazınıp bu adrese konmuş. Gerçek ${kaynakHost} değil; taklit/sahte sayfa güçlü ihtimal, bilgi/ödeme girme.`);
      r.alanlar.push({ ad: "Klon kaynağı", deger: `${kaynakHost} kopyası (sayfa oradan kaydedilmiş)` });
    }
  }

  // PARK / SATILIK sayfası tespiti (canlı durum için) — içerik metninden.
  if (/this domain (is|may be) (for sale|available)|is available to be registered|available to be registered|parklogic|sedoparking|parkingcrew|hugedomains|dan\.com|buy this domain|domain (is )?for sale|this (web )?page is parked|bu alan ad[ıi] sat[ıi]l|alan ad[ıi] sat[ıi]l[ıi]k/i.test(ham)) {
    if (!r.alanlar.some((x) => x.ad === "Site durumu")) r.alanlar.push({ ad: "Site durumu", deger: "Park / satılık sayfası (aktif içerik yok)" });
  }

  // ── FORM / EXFİL ANALİZİ (adım 8): form/fetch NEREYE veri gönderiyor? ──
  // Girdiğin bilgiler BAŞKA bir alan adına aktarılıyorsa (kendi sitesi/IdP/ödeme değil)
  // bu güçlü bir oltalama işaretidir. Rölatif hedefler (kendi sitesi) ve bilinen
  // sağlayıcılar (Stripe/Google/reCAPTCHA…) güvenli sayılır → yanlış-pozitif yok.
  const buKok = String(r.deger).split("/")[0].split(".").slice(-2).join(".");
  const hedefler: string[] = [];
  for (const m of ham.matchAll(/<form[^>]+action\s*=\s*["']([^"']+)["']/gi)) hedefler.push(m[1]);
  for (const m of ham.matchAll(/(?:fetch|axios(?:\.\w+)?)\s*\(\s*["'`]([^"'`]+)["'`]/gi)) hedefler.push(m[1]);
  for (const m of ham.matchAll(/\.open\s*\(\s*["'][A-Za-z]+["']\s*,\s*["'`]([^"'`]+)["'`]/gi)) hedefler.push(m[1]);
  const disHedefler = new Set<string>();
  for (const h of hedefler) {
    const mm = h.match(/^https?:\/\/([^/]+)/i);
    if (!mm) continue; // rölatif/aynı-origin → kendi sitesi, atla
    const host = mm[1].toLowerCase().replace(/:\d+$/, "");
    const kok = host.split(".").slice(-2).join(".");
    if (kok !== buKok && !GUVENLI_HEDEF.test(host) && !itibarliMi(host)) disHedefler.add(host);
  }
  if (disHedefler.size) {
    const liste = [...disHedefler].slice(0, 3).join(", ");
    if (sifreVar || kartVar) {
      r.risk += 35;
      r.bulgular.push(`Sayfadaki form/veri gönderimi BAŞKA bir adrese (${[...disHedefler][0]}) gidiyor — girdiğin şifre/kart bilgileri üçüncü bir tarafa aktarılıyor olabilir. Bu güçlü bir kimlik-avı işaretidir.`);
      r.alanlar.push({ ad: "Veri gönderimi", deger: `Dış adrese: ${liste}` });
    } else {
      r.alanlar.push({ ad: "Dış veri hedefi", deger: liste });
    }
  }

  // ── VARSAYILAN/BOŞ SAYFA: ekran görüntüsü yanıltıcı olabilir → dürüst not ──
  if (varsayilanSayfaMi(ham)) {
    r.ekranNotu = "Bu görüntü sitenin varsayılan/boş kurulum sayfası (hosting default) — zararlı içeriğin kendisi değil. Tehdit büyük olasılıkla kaldırıldı ya da tarayıcıdan gizleniyor (cloaking); tehlike kararı bu görüntüye değil, diğer resmî/teknik sinyallere dayanır.";
    if (!r.alanlar.some((x) => x.ad === "Sayfa içeriği" || x.ad === "Site durumu")) r.alanlar.push({ ad: "Sayfa içeriği", deger: "Varsayılan/boş kurulum sayfası (hosting default)" });
  }

  // ── TAKİP KİMLİĞİ (pivot): sayfaya gömülü analytics/reklam hesap kimliği ──
  // Risk EKLEMEZ (meşru sitede de olur); yalnız atıf/kümeleme için kaydeder. Aynı
  // kimliği taşıyan başka bir taklit domain = aynı operatör (altyapiDna kullanır).
  const takip = takipKimlikleri(ham);
  if (takip.length) r.alanlar.push({ ad: "Takip kimliği", deger: takip.join(", ") });

  // ── REKLAM / PARA-KAZANMA (adım 9): sayfanın amacı reklam geliri mi? ──
  // Değer: markayı taşıyan bir sayfa aktif kimlik-avı DEĞİL ama reklam geliri için
  // markayı sömürüyorsa bunu AYRI bir kategori olarak (marka-istismarı: reklam) doğru
  // etiketleriz. Böylece (1) "içinde reklam var mı, amacı ne" sorusu cevaplanır,
  // (2) kimlik-avı riski şişmez, (3) meşru haber/blog sitesi SUÇLANMAZ (yalnız betimleyici).
  const reklam = reklamAglari(ham);
  if (reklam.yaygin || reklam.agresif) {
    const tur = reklam.agresif ? "agresif reklam ağı (pop-up / zorla yönlendirme)" : "reklam ağı (AdSense / benzeri)";
    r.alanlar.push({ ad: "Para kazanma", deger: `Sayfada ${tur} — reklam geliri amaçlı` });
    // Meşru sitede reklam NORMALDİR → yalnız BAŞKA şüphe varken kategoriye yaz.
    // Agresif ağlar meşru markada görülmez; şüphe olmasa bile tek başına işarettir.
    if (reklam.agresif || supheli) {
      r.risk += reklam.agresif ? 16 : 8;
      r.bulgular.push(reklam.agresif
        ? "Marka adını taşıyan sayfa agresif reklam ağıyla para kazanıyor — kimlik-avı değil ama markayı izinsiz reklam gelirine sömüren bir istismar."
        : "Sayfa markayı taşıyıp reklam geliri elde ediyor olabilir — aktif tuzak değil, marka-istismarı (reklam) kategorisinde değerlendirilmeli.");
      if (!r.alanlar.some((x) => x.ad === "Site durumu")) r.alanlar.push({ ad: "Site durumu", deger: "Marka-istismarı: reklam / para kazanma" });
    }
  }
}

// Certificate Transparency (crt.sh) — sertifikaların kamuya açık, değiştirilemez
// kaydı. İki değeri var: (1) SANs'tan ALT ALAN (subdomain) keşfi — normal DNS'te
// görünmeyen login./panel./secure. gibi phishing altyapısı; (2) sertifikanın
// gerçekte ne zaman/hangi CA tarafından çıkarıldığı. CT'de kayıt = güvenli DEMEK
// DEĞİL; yalnızca diğer sinyallerle birlikte kullanılır.
type CtBilgi = { sayi: number; enYeni?: string; enEski?: string; ca?: string; subdomainler: string[]; yeniMi: boolean };

function caCikar(issuer?: string): string | undefined {
  if (!issuer) return undefined;
  const m = issuer.match(/O\s*=\s*"?([^,"]+)"?/);
  return m ? m[1].trim() : undefined;
}

const CT_UA = { "User-Agent": "Mozilla/5.0 (compatible; SITS-Nazar/1.0)", accept: "application/json" };

// crt.sh ve certSpotter sonuçlarını ortak biçime indirger. names alanı sağlayıcıya
// göre değişir (crt.sh: name_value satırları; certSpotter: dns_names dizisi).
function ctTopla(
  kayitlar: { names: string[]; notBefore?: string; issuer?: string }[],
  domain: string
): CtBilgi {
  const names = new Set<string>();
  let enYeniMs = 0, enYeni: string | undefined, ca: string | undefined;
  let enEskiMs = Infinity, enEski: string | undefined;
  for (const c of kayitlar) {
    for (let n of c.names) {
      n = String(n).trim().toLowerCase().replace(/^\*\./, "");
      if (n && n !== domain && n.endsWith("." + domain)) names.add(n);
    }
    const nb = Date.parse(c.notBefore || "");
    if (!isNaN(nb)) {
      if (nb > enYeniMs) { enYeniMs = nb; enYeni = new Date(nb).toISOString().slice(0, 10); ca = caCikar(c.issuer); }
      if (nb < enEskiMs) { enEskiMs = nb; enEski = new Date(nb).toISOString().slice(0, 10); }
    }
  }
  return {
    sayi: kayitlar.length,
    enYeni, enEski, ca,
    subdomainler: [...names].sort().slice(0, 15),
    yeniMi: enYeniMs > 0 && Date.now() - enYeniMs < 7 * 86400000,
  };
}

async function certTransparency(domain: string): Promise<CtBilgi | null> {
  // Birincil: certSpotter (SSLMate) — hızlı, yapısal, ücretsiz. Opsiyonel
  // SSLMATE_API_KEY kotayı artırır. Yedek: crt.sh (sık sık yavaş/erişilemez).
  const key = process.env.SSLMATE_API_KEY;
  try {
    const r = await fetch(
      `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names&expand=issuer`,
      { headers: { ...CT_UA, ...(key ? { Authorization: `Bearer ${key}` } : {}) }, signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) {
        return ctTopla(
          arr.map((c: { dns_names?: string[]; not_before?: string; issuer?: { name?: string } }) => ({
            names: Array.isArray(c.dns_names) ? c.dns_names : [],
            notBefore: c.not_before,
            issuer: c.issuer?.name,
          })),
          domain
        );
      }
    }
  } catch {
    // certSpotter başarısız → crt.sh yedeğine düş
  }
  try {
    const r = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {
      headers: CT_UA,
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) return null;
    return ctTopla(
      arr.map((c: { name_value?: string; not_before?: string; issuer_name?: string }) => ({
        names: String(c.name_value || "").split(/\n/),
        notBefore: c.not_before,
        issuer: c.issuer_name,
      })),
      domain
    );
  } catch {
    return null;
  }
}

// İki dizi arası düzenleme (edit) mesafesi — "akbnk" ↔ "akbank" = 1 (typosquat tespiti).
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let onceki = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const simdi = [i, ...Array(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      const bedel = a[i - 1] === b[j - 1] ? 0 : 1;
      simdi[j] = Math.min(onceki[j] + 1, simdi[j - 1] + 1, onceki[j - 1] + bedel);
    }
    onceki = simdi;
  }
  return onceki[n];
}

// ── KATEGORİ SKOR KARTI (adım 11+12): tek skor yerine suç türü başına değerlendirme ──
export type KategoriDurum = { ad: string; ikon: string; skor: number; seviye: "Yok" | "Belirsiz" | "Şüpheli" | "Yüksek" };

export function kSeviye(s: number): KategoriDurum["seviye"] {
  return s >= 60 ? "Yüksek" : s >= 35 ? "Şüpheli" : s > 0 ? "Belirsiz" : "Yok";
}

// ── ALTYAPI DNA (attacker fingerprint) ──────────────────────────────────────
// Saldırganın altyapı parmak izini toplanan sinyallerden çıkarır: ad sunucusu +
// sertifika CA + ASN/barındırma (+ favicon eşi). Aynı imzayı taşıyan farklı
// domainler AYNI kampanya/altyapıdır → yeni domaini bilinen operasyona bağlar.
export function altyapiDna(r: OsintRapor): { imza: string; parcalar: { k: string; v: string }[] } | null {
  const ad = (x: string) => r.alanlar.find((a) => a.ad.startsWith(x))?.deger || "";
  const kok = (h: string) => h.trim().toLowerCase().split(".").slice(-2).join(".");
  const parcalar: { k: string; v: string }[] = [];
  const ns = ad("Ad sunucusu (NS)").split(",")[0];
  if (ns) parcalar.push({ k: "NS", v: kok(ns) });
  const ca = ad("SSL veren (CA)") || (ad("En yeni sertifika").split("·")[1] || "").trim();
  if (ca) parcalar.push({ k: "CA", v: ca.replace(/,?\s*Inc\.?|LLC/gi, "").trim().slice(0, 22) });
  const asn = ad("Ağ (ASN)").replace(/^AS\d+\s*/, "").replace(/,?\s*Inc\.?/gi, "").trim();
  if (asn) parcalar.push({ k: "ASN", v: asn.slice(0, 22) });
  const fav = ad("Favicon"); if (fav && /aynı|birebir/i.test(fav)) parcalar.push({ k: "favicon", v: "eş" });
  const mx = ad("E-posta (MX)"); const mxh = mx.match(/·\s*([a-z0-9.-]+\.[a-z]{2,})/i); if (mxh) parcalar.push({ k: "MX", v: kok(mxh[1]) });
  if (parcalar.length < 2) return null;
  return { imza: parcalar.map((p) => p.k + ":" + p.v).join("|").toLowerCase(), parcalar };
}

// Rapordaki birincil takip kimliği (GA/GTM/AdSense/Pixel) — operatör pivotu için.
// altyapiDna'dan AYRI: altyapı değişse de bu tek başına aynı operatörü işaret eder.
export function takipIdBirincil(r: OsintRapor): string | undefined {
  const v = r.alanlar.find((a) => a.ad === "Takip kimliği")?.deger || "";
  const ilk = v.split(",")[0].trim().toLowerCase();
  return ilk ? ilk.slice(0, 40) : undefined;
}

// ── SALDIRI OLGUNLAŞMA AŞAMASI ──────────────────────────────────────────────
// Bir domainin "doğumdan → aktif saldırıya" yaşam döngüsünde nerede olduğunu,
// toplanan GERÇEK sinyallerden türetir. Yörünge motoru bunu zamanla kaydeder.
export const SALDIRI_ASAMALARI = [
  "Domain kaydı", "DNS aktif", "TLS sertifika", "Web yayında",
  "Marka varlıkları", "Login formu", "Kimlik toplama",
];
export function saldiriAsamasi(r: OsintRapor): number {
  const ad = (x: string) => r.alanlar.find((a) => a.ad.startsWith(x))?.deger || "";
  const havuz = (r.bulgular.join(" ") + " " + r.alanlar.map((a) => a.ad + " " + a.deger).join(" ")).toLowerCase();
  let s = 0; // 0: kayıtlı (varlık var)
  if (ad("IP adresi") || ad("Ad sunucusu (NS)") || ad("E-posta (MX)") || ad("CNAME")) s = 1;            // DNS aktif
  if (ad("SSL veren") || ad("En yeni sertifika") || ad("Sertifika") || ad("CT kayıt")) s = Math.max(s, 2); // TLS
  if (r.sayfa || ad("Sayfa başlığı") || ad("Güvenli bağlantı") || ad("Görsel analiz")) s = Math.max(s, 3); // Web yayında
  if (ad("Logo taklidi (görsel)") || ad("İçerikte kurum taklidi") || ad("Klon kaynağı") || ad("Marka taklidi güveni") || ad("Favicon")) s = Math.max(s, 4); // marka varlıkları
  if (/şifre giriş alanı|giriş\/oturum|login formu|type=["']?password|kullanıcı.*şifre/.test(havuz)) s = Math.max(s, 5); // login formu
  if (/kart bilgisi isteniyor|kimlik av|üçüncü bir tarafa aktarılıyor|dış veri hedefi|kimlik toplama/.test(havuz)) s = Math.max(s, 6); // kimlik toplama
  return s;
}

// Toplanan sinyallerden (bulgular + alanlar) her suç kategorisini ayrı ayrı puanla.
export function kategoriKarti(rapor: OsintRapor): KategoriDurum[] {
  const metin = (rapor.bulgular.join(" ") + " " + rapor.alanlar.map((x) => `${x.ad} ${x.deger}`).join(" ")).toLowerCase();
  const has = (re: RegExp) => re.test(metin);
  const alan = (ad: string) => (rapor.alanlar.find((x) => x.ad.toLowerCase() === ad.toLowerCase())?.deger || "").toLowerCase();
  const gorsel = alan("görsel analiz (ai)");

  // Kimlik Avı (Phishing)
  let phishing = 0;
  if (has(/kimlik.?av|şifre giriş alanı var|kart bilgisi isteniyor|üçüncü bir tarafa aktarılıyor|kategori: oltalama|phishing/)) phishing = 80;
  else if (has(/dış veri hedefi|şüpheli.*şifre|giriş.*form/)) phishing = 40;
  if (/banka giriş|giriş\/oturum|ödeme\/kart|kimlik.?av/.test(gorsel)) phishing = Math.max(phishing, 70);

  // Marka Taklidi — çok-modlu güven skoru varsa onu kullan (kelime-eşleşmesinden kanıta).
  let marka = 0;
  if (rapor.alanlar.some((x) => x.ad === "Taklit uyarısı")) marka = 55;
  if (has(/favicon.*kopya|birebir kopya|logo.*ayn[ıi]/)) marka = 85;
  else if (rapor.alanlar.some((x) => x.ad === "Not" && /adını taşıyor|benziyor/.test(x.deger))) marka = Math.max(marka, 35);
  const mg = alan("marka taklidi güveni").match(/(\d+)\s*\/\s*100/);
  if (mg) marka = Number(mg[1]); // çok-modlu değerlendirme daha güvenilir → onu kullan
  // İçerik/logo taklidi (kamu kurumu ya da görsel logo) → domaindeki isimden bağımsız, güçlü.
  if (rapor.alanlar.some((x) => x.ad === "İçerikte kurum taklidi" || x.ad === "Logo taklidi (görsel)")) marka = Math.max(marka, 85);
  // Klon: sayfa başka bir sitenin birebir kopyası → neredeyse kesin marka taklidi.
  if (rapor.alanlar.some((x) => x.ad === "Klon kaynağı")) marka = Math.max(marka, 85);

  // Zararlı Yazılım (Malware)
  let malware = 0;
  if (has(/malware|zararlı yazılım|social_engineering|unwanted_software|truva|trojan/)) malware = 70;
  const vt = alan("virustotal").match(/(\d+)\s*\/\s*\d+/);
  if (vt && Number(vt[1]) >= 3) malware = Math.max(malware, 60);
  else if (vt && Number(vt[1]) >= 1) malware = Math.max(malware, 30);

  // Dolandırıcılık (Scam)
  let scam = 0;
  if (has(/kazand[ıi]n[ıi]z|acele et|baskı-tuzak|çekiliş|dolandırıcı olarak bildirdi/)) scam = 50;
  if (has(/kripto|yatırım getiri|kazanç garanti|airdrop|usdt/)) scam = Math.max(scam, 55);
  if (has(/\d+ farklı kişi dolandırıcı/)) scam = Math.max(scam, 65);
  if (rapor.alanlar.some((x) => x.ad === "Klon kaynağı")) scam = Math.max(scam, 50); // klon ödeme/marka sayfası = dolandırıcılık hazırlığı

  // Yasadışı Bahis
  let bahis = 0;
  if (has(/yasa dışı bahis|bahis\/kumar|casino|iddaa|kumar/)) bahis = 70;

  return [
    { ad: "Kimlik Avı", ikon: "phishing", skor: phishing, seviye: kSeviye(phishing) },
    { ad: "Marka Taklidi", ikon: "verified_user", skor: marka, seviye: kSeviye(marka) },
    { ad: "Zararlı Yazılım", ikon: "coronavirus", skor: malware, seviye: kSeviye(malware) },
    { ad: "Dolandırıcılık", ikon: "currency_exchange", skor: scam, seviye: kSeviye(scam) },
    { ad: "Yasadışı Bahis", ikon: "casino", skor: bahis, seviye: kSeviye(bahis) },
  ];
}

// ── CANLI DURUM (aktif-tuzak / park / yayında-değil / canlı) ─────────────────
// Riskten/kategoriden AYRI: domainin ŞU ANKİ hâli. USOM "phishing" dese bile site
// bugün park edilmişse "aktif tuzak" değildir — bu ayrım "marka kötüye kullanımına
// ADAY (park) ile AKTİF saldırı"yı ayırır. Park adayları ayrı izlenmelidir.
export type DomainDurum = "aktif-tuzak" | "park" | "yayinda-degil" | "canli";
export function domainDurumu(rapor: OsintRapor): { durum: DomainDurum; etiket: string; ikon: string } {
  const alan = (ad: string) => (rapor.alanlar.find((x) => x.ad.toLowerCase() === ad.toLowerCase())?.deger || "").toLowerCase();
  const b = rapor.bulgular.join(" ").toLowerCase();
  const gorsel = alan("görsel analiz (ai)");
  const not = alan("not");
  const parkServis = alan("barındırma servisi").includes("park") || alan("site durumu").includes("park");
  const parkGorsel = /park|satılık/.test(gorsel);
  const parkMetin = /park edilmiş|satılık|available to be registered|parklogic|domain for sale|bu alan adı sat|for sale/.test(b + " " + not);
  const cozulmuyor = /çözülmüyor|yayında değil|kapatılmış/.test(b);
  const aktifForm =
    /şifre giriş alanı var|kart bilgisi isteniyor|üçüncü bir tarafa aktarılıyor|aktif.*tuzak|aktif.*kimlik/.test(b) ||
    /banka giriş|giriş\/oturum|ödeme\/kart|kimlik.?av/.test(gorsel);

  if (aktifForm && !parkGorsel) return { durum: "aktif-tuzak", etiket: "Aktif — bilgi/giriş formu içeriyor", ikon: "gpp_bad" };
  if (parkServis || parkGorsel || parkMetin) return { durum: "park", etiket: "Park edilmiş — şu an aktif tuzak değil (izlemede)", ikon: "inventory_2" };
  if (cozulmuyor) return { durum: "yayinda-degil", etiket: "Yayında değil / çözülmüyor", ikon: "cloud_off" };
  // Kayıtlı ama şu an A kaydı yok → "canlı" DEĞİL ama "kaldırılmış" da değil (dürüst ara durum).
  if (alan("dns durumu").includes("a kaydı yok")) return { durum: "yayinda-degil", etiket: "Şu an erişilemiyor — kayıtlı, A kaydı yok", ikon: "cloud_off" };
  return { durum: "canli", etiket: "Canlı — içerik yayında", ikon: "public" };
}

export async function domainOsint(domain: string, tamUrl?: string): Promise<OsintRapor> {
  // www. ve olası şema/yol kalıntısını ayıkla — RDAP/DNS registrable domain ister
  // (www.haberturk.com için RDAP başarısız olup yanlış "yeni domain" sinyali üretiyordu).
  domain = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const r: OsintRapor = { tip: "url", deger: domain, alanlar: [], bulgular: [], risk: 0 };
  let domainYasGun: number | null = null; // RDAP'ten; CT sinyallerini bağlamlandırmak için
  let barindirmaMetni = ""; // isp+org+asn (marka kendi altyapısında mı barınıyor kontrolü)

  // BİLİNEN-KÖTÜ LİSTELERİ — sıfırdan analizden önce, resmi/global kara listeler.
  // USOM = Türkiye'nin resmi zararlı bağlantı listesi; en güçlü tek sinyalimiz.
  try {
    const t = await tehditKontrol(domain);
    if (t.kaynaklar.length) {
      r.risk += t.usom ? 70 : 60; // resmi/onaylı kaynak = neredeyse kesin
      r.alanlar.push({ ad: "Kara liste", deger: t.kaynaklar.join(", ") });
      if (t.usom) {
        const detay = [
          t.usomTur ? `kategori: ${t.usomTur}` : null,
          t.usomKritiklik ? `kritiklik: ${t.usomKritiklik}/5` : null,
        ].filter(Boolean).join(", ");
        r.bulgular.push(
          `Bu adres T.C. Siber Güvenlik Başkanlığı (USOM) resmi zararlı bağlantı listesinde — devlet tarafından tehlikeli olarak işaretlenmiş${detay ? ` (${detay})` : ""}.`
        );
      } else {
        r.bulgular.push(`Bu adres bilinen dolandırıcılık/zararlı listelerinde: ${t.kaynaklar.join(", ")}.`);
      }
    }
  } catch {
    // Liste alınamazsa diğer sinyallerle devam
  }

  // RDAP — kayıt tarihi, yaş, registrar. rdap.org kararsız olabildiği için 1 kez tekrar dene.
  let rd = await json(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  if (!rd) rd = await json(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  if (rd) {
    const events = (rd.events as { eventAction: string; eventDate: string }[]) || [];
    const kayit = events.find((e) => e.eventAction === "registration")?.eventDate;
    if (kayit) {
      const yasGun = Math.floor((Date.now() - Date.parse(kayit)) / 86400000);
      domainYasGun = yasGun;
      r.alanlar.push({ ad: "Kayıt tarihi", deger: kayit.slice(0, 10) });
      r.alanlar.push({ ad: "Domain yaşı", deger: `${yasGun} gün` });
      if (yasGun < 7) { r.risk += 40; r.bulgular.push("Domain 1 haftadan yeni — dolandırıcı siteler neredeyse her zaman çok yenidir."); }
      else if (yasGun < 30) { r.risk += 25; r.bulgular.push("Domain 1 aydan yeni — temkinli ol."); }
      else if (yasGun < 90) { r.risk += 10; r.bulgular.push("Domain nispeten yeni (90 günden az)."); }
    }
    const entities = (rd.entities as { roles?: string[]; vcardArray?: unknown[] }[]) || [];
    const reg = entities.find((e) => (e.roles || []).includes("registrar"));
    const vcard = reg?.vcardArray?.[1] as unknown[][] | undefined;
    const fn = vcard?.find((x) => x[0] === "fn")?.[3] as string | undefined;
    if (fn) r.alanlar.push({ ad: "Kayıt firması", deger: fn });
    // REGISTRAR DURUMU: domain askıya alınmış/kaldırılıyor mu? (clientHold/serverHold =
    // kötüye kullanım nedeniyle dondurulmuş; pendingDelete/redemption = siliniyor.)
    const rdurum = (rd.status as string[]) || [];
    const askida = rdurum.filter((s) => /client ?hold|server ?hold|pending ?delete|redemption/i.test(s));
    if (askida.length) {
      r.risk += 15;
      r.bulgular.push("Domain, kayıt kuruluşu tarafından ASKIYA ALINMIŞ / kaldırılma sürecinde (hold) — kötüye kullanım nedeniyle dondurulmuş olabilir.");
      r.alanlar.push({ ad: "Registrar durumu", deger: `${askida.join(", ")} (askıda/kaldırılıyor)` });
    }
  } else {
    // RDAP yanıt vermedi — RDAP servisleri kararsızdır; bu TEK BAŞINA risk DEĞİL,
    // "çok yeni" de DEMEK değil. Sadece bilgi olarak not düş (gerekçe/risk üretme).
    r.alanlar.push({ ad: "Kayıt bilgisi", deger: "Şu an alınamadı (RDAP yanıt vermedi)" });
  }

  // DNS -> IP -> barındırma
  const dns = await json(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`);
  const ans = (dns?.Answer as { type: number; data: string }[]) || [];
  const ip = ans.find((a) => a.type === 1)?.data;
  if (ip) {
    r.alanlar.push({ ad: "IP adresi", deger: ip });
    const geo = await json(`http://ip-api.com/json/${ip}?fields=country,isp,org,as,hosting,proxy`);
    // CDN/proxy (Cloudflare, Akamai…) arkasındaysa: ülke = edge konumu, reverse-IP
    // = milyonlarca site → bu alanlar YANILTICI. Bilgiyi buna göre bağlamlandır.
    barindirmaMetni = `${geo?.isp || ""} ${geo?.org || ""} ${geo?.as || ""}`.toLowerCase();
    const cdn = /cloudflare|akamai|fastly|cloudfront|amazon|google|incapsula|imperva|sucuri|stackpath|bunny|ddos-guard|qrator/i.test(barindirmaMetni);
    if (geo?.country) r.alanlar.push({ ad: "Sunucu ülkesi", deger: cdn ? `${geo.country} (CDN edge — gerçek konum gizli)` : String(geo.country) });
    if (geo?.isp) r.alanlar.push({ ad: "Barındırma", deger: String(geo.isp) });
    if (geo?.as) r.alanlar.push({ ad: "Ağ (ASN)", deger: String(geo.as) });
    // Altyapı tipi — bilgi amaçlı (tek başına suç değil; Cloudflare vb. meşrudur).
    const tipler: string[] = [];
    if (cdn) tipler.push("CDN/proxy arkasında");
    else if (geo?.hosting) tipler.push("veri merkezi");
    if (geo?.proxy && !cdn) tipler.push("proxy/anonimleştirme");
    if (tipler.length) r.alanlar.push({ ad: "Altyapı tipi", deger: tipler.join(", ") });

    if (!ozelIp(ip)) {
      // Reverse-IP: aynı sunucuda barındırılan site sayısı. CDN arkasında ANLAMSIZ
      // (Cloudflare IP'sinde milyonlarca site) → CDN'de atla, yanlış sinyali olmasın.
      if (!cdn) {
        const say = await reverseIpSayisi(ip);
        if (say !== null) {
          r.alanlar.push({ ad: "Aynı IP'de site", deger: say >= 500 ? "500+" : String(say) });
        }
      }
      // AbuseIPDB — IP kötüye kullanım itibarı.
      const ab = await abuseIp(ip);
      if (ab) {
        if (cdn) {
          // PAYLAŞIMLI CDN/proxy edge IP'si (CloudFront/Cloudflare…): skor BİNLERCE
          // başka siteden gelir, bu ADRESE AİT DEĞİL → risk EKLEME, "kötüye kullanım"
          // diye sunma. (chat.deepseek.com meşru olduğu halde CloudFront IP'sinin
          // 54/100'ünü tehlike sandık — yanlış-pozitif.) Sadece nötr bilgi olarak göster.
          if (ab.rapor > 0) r.alanlar.push({ ad: "IP itibarı (AbuseIPDB)", deger: `${ab.skor}/100 — paylaşımlı CDN IP'si (bu siteye özel değil)` });
        } else {
          if (ab.skor >= 50) {
            r.risk += 25;
            r.bulgular.push(`Bu sunucu IP'si YÜKSEK kötüye kullanım skoruna sahip (AbuseIPDB: ${ab.skor}/100, ${ab.rapor} rapor).`);
          } else if (ab.skor >= 25) {
            r.risk += 12;
            r.bulgular.push(`Bu sunucu IP'si kötüye kullanım raporlarına sahip (AbuseIPDB: ${ab.skor}/100, ${ab.rapor} rapor).`);
          }
          if (ab.rapor > 0) r.alanlar.push({ ad: "IP itibarı (AbuseIPDB)", deger: `${ab.skor}/100 · ${ab.rapor} rapor` });
        }
      }

      // GreyNoise — zararlı IP sinyali / bilinen kurumsal altyapı
      const gn = await greyNoise(ip);
      if (gn) {
        if (gn.classification === "malicious") {
          r.risk += 20;
          r.bulgular.push("GreyNoise: bu IP internet üzerinde zararlı aktivitede (tarama/saldırı) gözlemlendi.");
          r.alanlar.push({ ad: "GreyNoise", deger: "Zararlı aktör" });
        } else if (gn.riot || gn.classification === "benign") {
          r.alanlar.push({ ad: "GreyNoise", deger: gn.ad ? `Bilinen altyapı: ${gn.ad}` : "Bilinen/zararsız altyapı" });
        }
      }
    }
  } else {
    // A kaydı yok. AMA "kaldırılmış" demeden önce ayır: NXDOMAIN (Status=3, gerçekten
    // yok) mu, yoksa domain KAYITLI ama şu an A kaydı yok mu (Status=0 → NS var, cert
    // alabilir; ferganiuzay.com.tr gibi — geçici erişilemez, KALDIRILMIŞ DEĞİL).
    if (dns?.Status === 3) {
      r.bulgular.push("Domain DNS'te yok (NXDOMAIN) — tescilli değil ya da kaldırılmış.");
    } else {
      r.alanlar.push({ ad: "DNS durumu", deger: "Kayıtlı, şu an A kaydı yok (web sunucusu tanımlı değil / geçici erişilemez — kaldırılmış değil)" });
    }
  }

  // ── DNS İSTİHBARATI (adım 2): CNAME/MX/NS/TXT — subdomain hangi servise bağlı, mail var mı ──
  // Hepsi BİLGİ amaçlı (tek başına suç değil). CNAME özellikle değerli: subdomainin
  // arkasındaki gerçek platformu (CloudFront/Azure/Pages/Workers…) ortaya çıkarır.
  try {
    const dnsKayit = async (t: string): Promise<string[]> => {
      const j = await json(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${t}`, 4000);
      return (((j?.Answer as { type: number; data: string }[]) || []).map((x) => x.data).filter(Boolean));
    };
    const [cname, mx, ns, txt] = await Promise.all([dnsKayit("CNAME"), dnsKayit("MX"), dnsKayit("NS"), dnsKayit("TXT")]);
    if (cname.length) {
      const hedef = cname[0].replace(/\.$/, "");
      r.alanlar.push({ ad: "CNAME (bağlı servis)", deger: hedef });
      const servis =
        /cloudfront\.net/.test(hedef) ? "AWS CloudFront" :
        /azurewebsites\.net|azureedge/.test(hedef) ? "Microsoft Azure" :
        /github\.io/.test(hedef) ? "GitHub Pages" :
        /pages\.dev/.test(hedef) ? "Cloudflare Pages" :
        /workers\.dev/.test(hedef) ? "Cloudflare Workers" :
        /vercel\.app|vercel-dns/.test(hedef) ? "Vercel" :
        /netlify/.test(hedef) ? "Netlify" :
        /herokuapp\.com/.test(hedef) ? "Heroku" :
        /myshopify\.com/.test(hedef) ? "Shopify" :
        /wixdns|wix\.com|wixsite/.test(hedef) ? "Wix" :
        /(sedoparking|parkingcrew|bodis|above\.com|dan\.com|afternic|hugedomains)/.test(hedef) ? "Park/satılık servisi" :
        /(github|gitlab)usercontent|firebaseapp|web\.app/.test(hedef) ? "Firebase/statik barındırma" : null;
      if (servis) r.alanlar.push({ ad: "Barındırma servisi", deger: servis });
    }
    if (mx.length) {
      const ilk = (mx[0].split(/\s+/).pop() || mx[0]).replace(/\.$/, "");
      r.alanlar.push({ ad: "E-posta (MX)", deger: `${mx.length} kayıt · ${ilk}` });
    } else {
      r.alanlar.push({ ad: "E-posta (MX)", deger: "yok — mail sunucusu tanımlı değil" });
    }
    if (ns.length) r.alanlar.push({ ad: "Ad sunucusu (NS)", deger: ns.slice(0, 2).map((x) => x.replace(/\.$/, "")).join(", ") });
    if (txt.some((x) => /v=spf1/i.test(x))) r.alanlar.push({ ad: "SPF kaydı", deger: "var (e-posta doğrulama tanımlı)" });
  } catch {
    /* DNS zenginleştirme başarısızsa sessiz geç */
  }

  // ── YÖNLENDİRME ZİNCİRİ: link nereye atıyor? (yalnız çözülen domainde) ──
  // Son varış noktasını sakla — marka-taklidi kontrolü bunu kullanır: bir site
  // markanın KENDİ resmi adresine yönlendiriyorsa taklit DEĞİL, markanın kendisidir.
  let yonlendirmeHedefi: string | null = null;
  let mesruYonlendirme = false; // markanın kendi/resmî adresine yönlendiren stub domain mi?
  if (ip && !ozelIp(ip)) {
    try {
      const zincir = await yonlendirmeZinciri(tamUrl && tamUrl.includes(domain) ? tamUrl : domain);
      const hostlar = [...new Set(zincir.map((z) => { try { return new URL(z).hostname.replace(/^www\./, ""); } catch { return z; } }))];
      if (hostlar.length > 1) {
        r.alanlar.push({ ad: "Yönlendirme zinciri", deger: hostlar.join(" → ") });
        const sonHost = hostlar[hostlar.length - 1];
        yonlendirmeHedefi = sonHost;
        const kaynakLabel = tescilliBilgi(domain).label;
        const hedefLabel = tescilliBilgi(sonHost).label;
        // MEŞRU birleştirme mi? (a) aynı marka etiketi: fnss.com → fnss.com.tr
        // (b) hedef, korunan bir markanın RESMÎ adresi (c) itibarlı site.
        const ayniMarka = !!kaynakLabel && kaynakLabel === hedefLabel;
        const mesruHedef = ayniMarka || resmiMarkaDomaini(sonHost) || itibarliMi(sonHost);
        if (mesruHedef) {
          mesruYonlendirme = true;
          r.alanlar.push({ ad: "Not", deger: `Kendi/resmî marka adresine yönlendiriyor (${sonHost}) — meşru birleştirme` });
        } else if (hedefLabel !== kaynakLabel) {
          r.risk += 14;
          r.bulgular.push(`Bu adres seni BAŞKA bir siteye (${sonHost}) yönlendiriyor — dolandırıcılar asıl sahte sayfayı böyle gizler. Gittiğin yeri iki kez kontrol et.`);
        }
      }
    } catch {
      /* yönlendirme izlenemedi */
    }
  }

  // SSL sertifikası (doğrudan TLS) — CA + geçerlilik + geçersiz/kendinden-imzalı tespiti.
  // Sadece gerçek bir sunucuya çözülüyorsa dener.
  if (ip && !ozelIp(ip)) {
    const ssl = await sslBilgi(domain);
    if (ssl) {
      if (ssl.issuer) r.alanlar.push({ ad: "SSL veren (CA)", deger: ssl.issuer });
      if (ssl.notBefore) {
        const d = Date.parse(ssl.notBefore);
        if (!isNaN(d)) {
          r.alanlar.push({ ad: "Sertifika başlangıcı", deger: new Date(d).toISOString().slice(0, 10) });
          // NOT: TLS sertifikasının "yeni" olması domain yaşı DEĞİLDİR — Let's Encrypt
          // her ~60-90 günde yeniler, yani her HTTPS sitenin sertifikası "yeni"dir.
          // Bunu "yeni kurulmuş" sinyali olarak KULLANMA (RDAP başarısız olunca 18.9
          // yıllık siteyi "yeni" sanıyordu). Domain yaşı yalnız RDAP/CT'den gelir.
        }
      }
      if (!ssl.authorized) {
        if (mesruYonlendirme) {
          // Sadece resmî adrese yönlendiren stub domain — kendi sertifikası önemsiz
          // (kullanıcı zaten resmî güvenli siteye varıyor). Risk EKLEME, bilgi olarak göster.
          r.alanlar.push({ ad: "SSL notu", deger: "Yönlendirme stub'ının kendi sertifikası uyuşmuyor (varış resmî adres)" });
        } else {
          r.risk += 22;
          r.bulgular.push("SSL sertifikası geçersiz/kendinden imzalı ya da alan adıyla uyuşmuyor — güvenli site böyle olmaz.");
          r.alanlar.push({ ad: "SSL uyarısı", deger: "Geçersiz sertifika" });
        }
      }
    }
  }

  // Certificate Transparency (crt.sh) — sertifika istihbaratı + subdomain keşfi.
  // İtibarlı/resmî domainlerde atla: dev sertifika listesi (yük) + zaten güvenli.
  if (!itibarliMi(domain)) {
    const ct = await certTransparency(domain);
    if (ct) {
      if (ct.enYeni) r.alanlar.push({ ad: "En yeni sertifika (CT)", deger: ct.ca ? `${ct.enYeni} · ${ct.ca}` : ct.enYeni });
      if (ct.sayi) r.alanlar.push({ ad: "CT kayıt sayısı", deger: String(ct.sayi) });
      // ── SERTİFİKA ZAMAN ÇİZELGESİ (adım 5): ilk→son sertifika, ne kadar süredir aktif ──
      if (ct.enEski && ct.enYeni) {
        const ilkMs = Date.parse(ct.enEski), sonMs = Date.parse(ct.enYeni);
        const gunFark = Math.max(0, Math.floor((sonMs - ilkMs) / 86400000));
        const yasGun = Math.floor((Date.now() - ilkMs) / 86400000);
        const sure = gunFark >= 365 ? `${Math.floor(gunFark / 365)} yıl` : gunFark >= 30 ? `${Math.floor(gunFark / 30)} ay` : `${gunFark} gün`;
        r.alanlar.push({ ad: "Sertifika geçmişi", deger: ct.enEski === ct.enYeni ? `Tek sertifika (${ct.enEski})` : `${ct.enEski} → ${ct.enYeni} (${sure} boyunca ${ct.sayi} sertifika)` });
        // CT'de İLK görülme, RDAP kaydı ile tutarsızsa: RDAP başarısız olduğunda CT bir
        // alt-sınır yaş verir (domain en az bu kadar eskidir → "taze oltalama" yanlışını engeller).
        if (domainYasGun === null && yasGun > 90) {
          r.alanlar.push({ ad: "CT ilk görülme", deger: `${ct.enEski} (≈${yasGun} gün — CT'ye göre en az)` });
        }
        // Uzun geçmiş + son sertifika ÇOK YENİ = uyuyan domain yeniden aktive edilmiş olabilir
        // (park → silahlanma kalıbı). Sadece bilgi/bağlam, tek başına risk değil.
        if (yasGun > 365 && ct.yeniMi) {
          r.bulgular.push("Domain eski (CT geçmişi 1 yıldan uzun) ama SON sertifika bu hafta alınmış — uzun süredir pasif bir adres yeniden aktive edilmiş olabilir; içeriği değiştiyse dikkat.");
        }
      }
      // ÖNEMLİ: subdomain/yeni-sertifika sinyalleri YALNIZCA POZİTİF genç domainde
      // (yaşı BİLİNİYOR ve < 90 gün) risk üretir. "Yaş bilinmiyor" (RDAP başarısız)
      // ≠ "genç" — yoksa 18.9 yıllık maltego.com'un auth.maltego.com'unu oltalama
      // sanıyorduk. login/auth/checkout her büyük sitede NORMALDİR.
      const pozitifGenc = domainYasGun !== null && domainYasGun < 90;
      if (ct.subdomainler.length) {
        const goster = ct.subdomainler.slice(0, 8);
        r.alanlar.push({
          ad: "Keşfedilen alt alanlar",
          deger: goster.join(", ") + (ct.subdomainler.length > 8 ? ` +${ct.subdomainler.length - 8}` : ""),
        });
        if (pozitifGenc) {
          const supheliAlt = ct.subdomainler.filter((s) =>
            /^(login|signin|secure|verify|account|panel|banka|bank|update|confirm|auth|wallet|odeme|payment|dogrulama)\./.test(s)
          );
          if (supheliAlt.length) {
            r.risk += 8;
            r.bulgular.push(`Yeni bir domainde giriş/ödeme temalı alt alanlar var (${supheliAlt.slice(0, 3).join(", ")}) — oltalama altyapısı olabilir.`);
          }
        }
      }
      if (ct.yeniMi && pozitifGenc) {
        r.alanlar.push({ ad: "CT durumu", deger: "Son 7 günde yeni sertifika" });
        r.risk += 6;
      }
    }
  }

  const tld = domain.split(".").pop() || "";
  if (RISKLI_TLD.includes(tld)) {
    r.risk += 12;
    r.bulgular.push(`Riskli/ucuz uzantı (.${tld}) — dolandırıcılar sıkça kullanır.`);
  }

  // IDN / homograph — göz aldatan alan adları (ör. Kiril 'а' ile "аkbank.com")
  if (domain.includes("xn--")) {
    r.risk += 25;
    r.bulgular.push("Alan adı uluslararası (IDN/punycode) karakter içeriyor — tanınmış bir markayı taklit eden 'göz aldatan' adres olabilir.");
    r.alanlar.push({ ad: "IDN uyarısı", deger: "Punycode (xn--) içeriyor" });
  } else if (/[^\x00-\x7F]/.test(domain)) {
    r.risk += 25;
    r.bulgular.push("Alan adında Latin dışı karakterler var — göz aldatan (homograph) taklit olabilir.");
    r.alanlar.push({ ad: "IDN uyarısı", deger: "Latin dışı karakter" });
  }

  // Marka taklidi (typosquatting) — İKİ yol:
  //  (a) alt-dize: "akbank-giris.com" (marka kelimesini içerir)
  //  (b) HARF FARKI: "akbnk.com" (akbank'tan 1-2 harf eksik/değişik) — edit-distance.
  // (b) olmadan, bir harf eksik typosquat'lar (akbnk, garnti…) düşük skor alıp
  // "güvenli" görünüyordu; en tehlikeli tuzak tipi tam bu.
  let taklit: { ad: string; resmi: string[] } | null = null;
  let markaEslesme: string | null = null; // marka adını taşıyan (typosquat VEYA eski domain) — görsel analiz için
  let markaAnahtarE: string | null = null; // eşleşen markanın anahtarı (çok-modlu benzerlik için)
  const etiket = domain.split(".")[0];
  // Domain HERHANGİ bir korunan markanın RESMÎ adresiyse (halkbank.com) hiçbir
  // typosquat kontrolü yapma. Yoksa edit-distance "halkbank"≈"akbank" (2 harf) →
  // halkbank.com'u Akbank taklidi sanıyordu (sonra vision "Akbank phishing" uydurdu).
  const yhedef = yonlendirmeHedefi; // marka döngüsünde daralma sorunu olmasın
  if (!resmiMarkaDomaini(domain)) for (const m of MARKALAR) {
    if (m.resmi.some((d) => domain === d || domain.endsWith("." + d))) continue; // resmî → atla
    // Site markanın KENDİ resmî adresine yönlendiriyorsa (fnss.com → fnss.com.tr)
    // bu markanın kendisidir/kontrolündedir, taklit DEĞİL — atla.
    if (yhedef && m.resmi.some((d) => yhedef === d || yhedef.endsWith("." + d))) continue;
    const altDize = domain.includes(m.anahtar);
    const yakinTypo =
      m.anahtar.length >= 5 &&
      Math.abs(etiket.length - m.anahtar.length) <= 2 &&
      levenshtein(etiket, m.anahtar) <= 2;
    if (altDize || yakinTypo) {
      // MARKA KENDİ ALTYAPISINDA MI? (ASN/org marka adını içeriyorsa → gerçek markanın
      // kendi defansif domaini, sahte DEĞİL. Örn. halkbank.com, Halkbank'ın kendi
      // ASN'inde barınır → taklit sayma.) ip-api'ye bağlı, o yüzden tek dayanak değil.
      // Marka KENDİ ASN/altyapısında mı? Org adı marka kelimesini içeriyorsa → kendi
      // defansif/ele-geçirilmiş domaini, "taklit" DEĞİL. Türkçe ad uyuşmazlığı için
      // (VakıfBank = "Türkiye VAKIFLAR Bankası"; "vakifbank" org'da geçmez) markanın
      // 5-harf KÖKÜNÜ de dene ("vakif","garan","akban","turkc","ziraa"…) — aday zaten
      // markayı içerdiği için bu kök org'da varsa neredeyse kesin markanın kendi ASN'i.
      const kok5 = m.anahtar.slice(0, 5);
      const markaAltyapisi =
        barindirmaMetni.includes(m.anahtar) ||
        m.resmi.some((d) => barindirmaMetni.includes(d.split(".")[0])) ||
        (kok5.length >= 5 && barindirmaMetni.includes(kok5));
      if (markaAltyapisi) continue;
      // IP BLOĞU: aday, markanın RESMÎ domainiyle AYNI /24'te mi? → markanın KENDİ
      // savunma domaini (ör. vakifbank.tr, bankanın IP bloğunda). org adı net olmasa
      // da IP eşleşince "kendi" anlar — vakifbank.tr %100 yanlış-pozitifinin kökü.
      if (ip && !ozelIp(ip)) {
        const resmiIp = await ilkA(m.resmi[0]);
        const b1 = pref22(ip);
        const b2 = resmiIp && !ozelIp(resmiIp) ? pref22(resmiIp) : null;
        if (b1 && b2 && b1 === b2) {
          r.alanlar.push({ ad: "Not", deger: `${m.ad}'ın kendi IP bloğunda — savunma domaini (sahte değil)` });
          break;
        }
      }
      // ÇOK ESKİ domain (5+ yıl) TAZE OLTALAMA DEĞİLDİR — ya markanın kendi/eski
      // defansif domaini ya da uzun süredir park edilmiş. "Sahte/dolandırıcılık"
      // deme (RDAP yaşına dayanır, ip-api'den bağımsız → sağlam). Fresh typosquat
      // (yeni domain) asıl tehlikedir, o tam ağırlık alır.
      if (domainYasGun !== null && domainYasGun > 1825) {
        r.risk += 8;
        r.bulgular.push(`Bu adres "${m.ad}" adresine benziyor ama resmi adresi (${m.resmi[0]}) değil. Yine de çok eski bir domain — muhtemelen markanın kendi/eski bir adresi ya da park edilmiş. Yine de işlem yapmadan resmi adresi doğrula.`);
        r.alanlar.push({ ad: "Not", deger: `${m.ad}'a benziyor (eski domain)` });
        markaEslesme = m.ad; markaAnahtarE = m.anahtar;
        break;
      }
      // BİREBİR marka adı + farklı uzantı (mirleon.com ← mirleon.ai) mı, yoksa BOZUK/
      // harf-oyunu typosquat (mirleon-giris, mirlean) mı? Birebir ad "göz aldatan taklit"
      // DEĞİLDİR (harf oyunu yok) — markanın kendi/başka uzantısı ya da benzer isimli
      // farklı site olabilir. HAFİF işaretle; asıl kararı içerik/tehdit sinyalleri
      // (VT/USOM/genç domain/risky TLD/görsel) versin. Yoksa "hep yanıltıcı uyarı" olur.
      if (etiket === m.anahtar) {
        r.risk += 12;
        r.bulgular.push(`Bu adres "${m.ad}" adını taşıyor ama resmi uzantısı (${m.resmi[0]}) DEĞİL — yalnız uzantı farkı, harf oyunu yok. Markanın başka bir adresi ya da benzer isimli farklı bir site olabilir; yine de resmi adresi doğrula.`);
        r.alanlar.push({ ad: "Not", deger: `"${m.ad}" adını taşıyor (resmi uzantı ${m.resmi[0]} değil)` });
      } else {
        r.risk += 45;
        r.bulgular.push(
          yakinTypo && !altDize
            ? `Bu adres "${m.ad}" adresine çok benziyor (sadece birkaç harf farkı) ama resmi adresi DEĞİL — göz aldatan taklit (typosquatting) olabilir. Böyle adreslere kart/şifre girme.`
            : `Bu adres "${m.ad}" gibi görünüyor ama resmi adresi DEĞİL — taklit/sahte olabilir.`
        );
        r.alanlar.push({ ad: "Taklit uyarısı", deger: `${m.ad} taklidi olabilir` });
        taklit = { ad: m.ad, resmi: m.resmi };
      }
      markaEslesme = m.ad; markaAnahtarE = m.anahtar;
      break;
    }
  }

  // Favicon parmak izi — taklit şüphesi varsa: sahte site ile RESMİ sitenin
  // favicon'ları BİREBİR aynıysa, site markanın görünümünü kopyalamış demektir.
  if (taklit && ip && !ozelIp(ip)) {
    const [sahte, resmi] = await Promise.all([faviconHash(domain), faviconHash(taklit.resmi[0])]);
    if (sahte && resmi && sahte === resmi) {
      r.risk += 30;
      r.bulgular.push(`Site, ${taklit.ad}'ın favicon'unu (sekme simgesi) birebir kopyalamış — bu neredeyse kesin bir taklit işaretidir.`);
      r.alanlar.push({ ad: "Favicon", deger: `${taklit.ad} ile birebir aynı` });
    }
  }

  // Park/satılık bayrağı: hem urlscan (JS-render eden dış tarayıcı) hem bizim içerik
  // çekimimiz besler. Vercel sunucusu bazı domainleri fetch edemez (datacenter IP
  // engeli/timeout) — o durumda urlscan'in gördüğü "godaddy/for sale" kurtarır.
  let parkli = false;
  const parkHostRe = /(forsale\.godaddy|afternic|sedo(parking)?\.com|parkingcrew|dan\.com|hugedomains|bodis|above\.com|uniregistry|domainmarket|voodoo\.com|cashparking|parklogic|dho\.io|nokta\.com|sahibinden.*alan|isimtescil|natro)/i;
  // Park/satılık sayfa metni — İNGİLİZCE + TÜRKÇE domain pazarları (Devir/satılık).
  // araskargo.net "Devir için müsait · Devir Bedeli ₺150.000" ile yakalanır.
  const parkMetinRe =
    /for sale|is for sale|buy this domain|get this domain|domain (is )?for sale|parked (free|page)|this domain (is|may be) for sale|bu alan ad[ıi] sat[ıi]l[ıi]k|alan ad[ıi]n[ıi] sat[ıi]n al|devir için müsait|devir bedeli|sat[ıi]l[ıi]k alan ad|alan ad[ıi] devri|bu domaini? sat[ıi]n al|domain sat[ıi]ş|alan ad[ıi] sat[ıi]ş/i;
  // urlscan.io — ZENGİN çıkarım. urlscan siteyi GERÇEKTEN render eder (bizim fetch
  // Cloudflare Turnstile gibi bot-duvarına takılıp boş dönüyor) → search 'page' objesi
  // (anonim: başlık, dil, sertifika, ASN) + full result (API anahtarıyla: teknoloji,
  // iletişilen ağ, popülerlik, zararlı kararı). Risk YALNIZ malicious verdict'ten;
  // gerisi istihbarat alanı (yanlış-pozitif eklemez).
  try {
    type UsPage = { url?: string; title?: string; language?: string; server?: string; tlsIssuer?: string; tlsAgeDays?: number; status?: number; asnname?: string; mimeType?: string };
    const s = await json(`https://urlscan.io/api/v1/search/?q=page.domain:%22${encodeURIComponent(domain)}%22&size=1`);
    const res = (s?.results as { screenshot?: string; result?: string; page?: UsPage }[])?.[0];
    if (res) {
      const p = res.page || {};
      if (res.screenshot && (await gorselVar(res.screenshot))) {
        r.ekranGoruntusu = res.screenshot;
        r.alanlar.push({ ad: "Görsel tarama", deger: "urlscan.io" });
      }
      // Park/satılık (mevcut).
      if (parkHostRe.test(p.url || "") || parkMetinRe.test(p.title || "")) parkli = true;
      // İÇERİK ANLAMA fallback: bizim fetch henüz içerik vermediyse urlscan başlığını
      // kullan (bot-duvarlı sitelerde tek bilgi kaynağı). Alt fetch başarılıysa üzerine yazar.
      if (p.title && !r.sayfa) r.sayfa = { baslik: p.title, aciklama: null, siteAdi: null, tur: "", ozetMetin: p.title };
      if (p.title) r.alanlar.push({ ad: "Sayfa başlığı (urlscan)", deger: p.title.slice(0, 120) });
      // HOST/TARAYICI OLTALAMA UYARISI: sayfa başlığı bir güvenlik ara-sayfasıysa
      // ("Suspected Phishing | Cloudflare", "Deceptive site ahead"…) → barındıran altyapı
      // ya da tarayıcı bu adresi BİZZAT oltalama işaretlemiş. Otoriter, güçlü kanıt.
      if (!r.alanlar.some((a) => a.ad === "Host uyarısı") && /suspected phishing|deceptive site|reported (as )?phishing|dangerous site ahead|this website has been reported|kimlik av[ıi] şüphesi|şüpheli kimlik/i.test(p.title || "")) {
        r.risk += 50;
        r.bulgular.unshift("Barındıran altyapı/tarayıcı (ör. Cloudflare) bu adresi OLTALAMA olarak İŞARETLEMİŞ — sayfa doğrudan bir 'Suspected Phishing' güvenlik uyarısı gösteriyor. Kesinlikle bilgi girme.");
        r.alanlar.push({ ad: "Host uyarısı", deger: "Suspected Phishing (host tarafından oltalama işaretli)" });
      }
      if (p.tlsIssuer) r.alanlar.push({ ad: "Sertifika (urlscan)", deger: `${p.tlsIssuer}${typeof p.tlsAgeDays === "number" ? ` · ${p.tlsAgeDays} gün önce` : ""}` });

      // FULL RESULT — API anahtarıyla derin veri (anahtar yoksa sadece search verisi).
      if (res.result) {
        const key = process.env.URLSCAN_KEY;
        let full: Record<string, unknown> | null = null;
        try {
          const rr = await fetch(res.result, { headers: key ? { "API-Key": key } : {}, signal: AbortSignal.timeout(8000) });
          if (rr.ok) full = (await rr.json()) as Record<string, unknown>;
        } catch {}
        if (full) {
          // urlscan verdict'i TEK ve bazen YANLIŞ bir sinyaldir (topluluk/eski kayıt).
          // Meşru/resmi domainlerde uygulama (halkbank.com'u ZARARLI sandı → +40 FP).
          const verdicts = full.verdicts as { overall?: { malicious?: boolean } } | undefined;
          if (verdicts?.overall?.malicious && !itibarliMi(domain) && !resmiMarkaDomaini(domain)) {
            r.risk += 40;
            r.bulgular.push("urlscan.io bu siteyi ZARARLI/oltalama olarak işaretledi.");
          }
          const lists = full.lists as { domains?: string[]; countries?: string[] } | undefined;
          const stats = full.stats as { uniqCountries?: number } | undefined;
          const fpage = full.page as { umbrellaRank?: number; title?: string } | undefined;
          // Full result başlığı (search'te boşsa) → içerik-anlama fallback + alan.
          if (fpage?.title && !r.sayfa) r.sayfa = { baslik: fpage.title, aciklama: null, siteAdi: null, tur: "", ozetMetin: fpage.title };
          if (fpage?.title && !r.alanlar.some((a) => a.ad === "Sayfa başlığı (urlscan)")) r.alanlar.push({ ad: "Sayfa başlığı (urlscan)", deger: fpage.title.slice(0, 120) });
          // Host oltalama uyarısı — full-result başlığında da yakala (search'te boşsa).
          if (!r.alanlar.some((a) => a.ad === "Host uyarısı") && /suspected phishing|deceptive site|reported (as )?phishing|dangerous site ahead/i.test(fpage?.title || "")) {
            r.risk += 50;
            r.bulgular.unshift("Barındıran altyapı/tarayıcı bu adresi OLTALAMA olarak İŞARETLEMİŞ ('Suspected Phishing' uyarı sayfası). Kesinlikle bilgi girme.");
            r.alanlar.push({ ad: "Host uyarısı", deger: "Suspected Phishing (host tarafından oltalama işaretli)" });
          }
          const wappa = (full.meta as { processors?: { wappa?: { data?: { app?: string }[] } } } | undefined)?.processors?.wappa?.data || [];
          const tek = [...new Set(wappa.map((w) => w.app).filter(Boolean) as string[])].slice(0, 8);
          const dSay = lists?.domains?.length;
          const ulke = stats?.uniqCountries ?? lists?.countries?.length;
          if (dSay) r.alanlar.push({ ad: "İletişilen ağ", deger: `${dSay} domain${ulke ? ` · ${ulke} ülke` : ""}` });
          if (tek.length) r.alanlar.push({ ad: "Teknoloji (urlscan)", deger: tek.join(", ") });
          if (typeof fpage?.umbrellaRank === "number") r.alanlar.push({ ad: "Popülerlik (Umbrella)", deger: `#${fpage.umbrellaRank.toLocaleString("tr-TR")}` });
        }
      }
    }
  } catch {}

  // Google Safe Browsing (SAFE_BROWSING_KEY varsa)
  const sbKey = process.env.SAFE_BROWSING_KEY;
  if (sbKey) {
    try {
      const body = {
        client: { clientId: "sits", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url: `http://${domain}/` }, { url: `https://${domain}/` }],
        },
      };
      const resp = await fetch(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${sbKey}`,
        { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(6000) }
      );
      const jj = await resp.json();
      if (jj?.matches?.length) {
        r.risk += 50;
        r.bulgular.push("Google Safe Browsing: bu adres zararlı/oltalama olarak işaretli.");
        r.alanlar.push({ ad: "Google Safe Browsing", deger: "Zararlı" });
      }
    } catch {}
  }

  // VirusTotal (VIRUSTOTAL_KEY varsa)
  const vtKey = process.env.VIRUSTOTAL_KEY;
  if (vtKey) {
    try {
      const resp = await fetch(`https://www.virustotal.com/api/v3/domains/${encodeURIComponent(domain)}`, {
        headers: { "x-apikey": vtKey },
        signal: AbortSignal.timeout(6000),
      });
      const jj = await resp.json();
      const attr = jj?.data?.attributes ?? {};
      const st = attr.last_analysis_stats as
        | { malicious?: number; suspicious?: number; harmless?: number; undetected?: number; timeout?: number }
        | undefined;
      if (st) {
        const mal = (st.malicious || 0) + (st.suspicious || 0);
        const toplam = (st.malicious || 0) + (st.suspicious || 0) + (st.harmless || 0) + (st.undetected || 0) + (st.timeout || 0);
        // İtibarlı büyük siteyi TEK firmanın yanlış işaretlemesi (VT'de sık) suçlamasın.
        const guvenli = itibarliMi(domain);
        if (mal > 0 && !(guvenli && mal < 3)) {
          r.risk += mal >= 3 ? 50 : 32; // 1-2 firma bile "dikkat" (Orta) eşiğini geçsin
          // DENGELİ: kaç motordan kaçı işaretledi (oran kendini anlatır, az korkutur).
          r.bulgular.push(`VirusTotal: ${toplam || "onlarca"} güvenlik firmasından ${mal} tanesi bu adresi şüpheli/zararlı buldu.`);
          r.alanlar.push({ ad: "VirusTotal", deger: toplam ? `${mal}/${toplam} firma şüpheli buldu` : `${mal} firma şüpheli` });
        } else {
          r.alanlar.push({ ad: "VirusTotal", deger: "Temiz" });
        }
      }

      // Domain YAŞI (VT whois creation_date) — dolandırıcı siteler taze kurulur.
      // Kara listeler yeni domaini yakalayamadan önce en güçlü sinyalimiz budur.
      const olusma = attr.creation_date as number | undefined;
      if (typeof olusma === "number" && olusma > 0) {
        const gun = Math.floor((Date.now() / 1000 - olusma) / 86400);
        // RDAP zaten "Domain yaşı" eklemişse tekrar ekleme (mükerrer önle).
        if (!r.alanlar.some((a) => a.ad === "Domain yaşı")) {
          r.alanlar.push({ ad: "Domain yaşı", deger: gun < 1 ? "bugün" : `${gun} gün` });
        }
        if (gun <= 7) {
          r.risk += 45;
          r.bulgular.push(`Bu site sadece ${gun < 1 ? "bugün" : gun + " gün önce"} kuruldu — dolandırıcı siteler genellikle yeni açılır ve kısa sürede kapanır.`);
        } else if (gun <= 30) {
          r.risk += 25;
          r.bulgular.push(`Bu site çok yeni (${gun} günlük) — dikkatli ol.`);
        }
      }

      // VT ilk kez ne zaman gördü? Bugün ilk kez görüldüyse taze/hedefli tuzak sinyali.
      const ilkGoruldu = (attr.first_submission_date ?? attr.first_seen_itw_date) as
        | number
        | undefined;
      if (typeof ilkGoruldu === "number" && ilkGoruldu > 0) {
        const g2 = Math.floor((Date.now() / 1000 - ilkGoruldu) / 86400);
        if (g2 <= 2 && typeof olusma !== "number") {
          r.risk += 20;
          r.bulgular.push("Güvenlik ağları bu adresi daha yeni fark etti — henüz kimse zararlı olarak işaretlememiş olabilir, bu 'temiz' anlamına gelmez.");
        }
      }
    } catch {}
  }

  // Sayfa içeriği + HTTPS (yalnızca gerçek/genel IP'ye çözülüyorsa)
  // Paylaşılan TAM URL varsa onu çek (haber makalesi gibi belirli sayfa),
  // yoksa kök domaini. Böylece "bu ne sitesi + ne hakkında" bilgisini veririz.
  if (ip && !ozelIp(ip)) {
    const hedef = tamUrl && /^https?:\/\//i.test(tamUrl) ? tamUrl : `https://${domain}`;
    // guvenliGetir'i DOĞRUDAN çağır: gövde 403 olsa bile (GoDaddy/Sedo satış
    // sayfaları böyle yapar) FINAL URL'i elde et → park host'unu yine yakala.
    let resp = await guvenliGetir(hedef, 6000, TARAYICI_BASLIK);
    let sonUrl = resp?.url || hedef;
    let sayfa: string | null = null;
    if (resp && resp.ok) {
      try { sayfa = new TextDecoder().decode((await resp.arrayBuffer()).slice(0, 250000)); } catch { sayfa = null; }
    }
    if (sayfa !== null) {
      r.alanlar.push({ ad: "Güvenli bağlantı", deger: "HTTPS var" });
    } else {
      const r2 = await guvenliGetir(hedef.replace(/^https:/, "http:"), 5000, TARAYICI_BASLIK);
      if (r2) { sonUrl = r2.url || sonUrl; if (r2.ok) { try { sayfa = new TextDecoder().decode((await r2.arrayBuffer()).slice(0, 250000)); } catch {} } }
      if (sayfa !== null && !mesruYonlendirme) {
        r.risk += 12;
        r.bulgular.push("Site güvenli bağlantı (HTTPS) kullanmıyor — kişisel bilgi girme.");
      }
    }
    // Park/lander sayfaları çoğu zaman minik bir "stub" döndürüp JS/meta ile göreli
    // bir yola (ör. /lander) atar (sunucu redirect'i DEĞİL → fetch izlemez). Bunu bir
    // adım izle: gerçek satış içeriğini al. (turkcell.online: 114B stub → /lander)
    if (sayfa && sayfa.length < 700) {
      const jsyol =
        sayfa.match(/location\.(?:href|replace)\s*=\s*["']([^"']+)["']/i)?.[1] ||
        sayfa.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+url=([^"'>]+)/i)?.[1];
      if (jsyol) {
        try {
          const takip = new URL(jsyol.trim(), sonUrl).toString();
          const r3 = await guvenliGetir(takip, 6000, TARAYICI_BASLIK);
          if (r3?.ok) { sonUrl = r3.url || takip; sayfa = new TextDecoder().decode((await r3.arrayBuffer()).slice(0, 250000)); }
        } catch { /* izlenemedi: stub'da kal */ }
      }
    }
    // PARK / SATILIK domain tespiti: (a) yönlendirilen FINAL host bilinen bir domain
    // pazarı mı (forsale.godaddy/sedo/dan.com…), VEYA (b) gövdede satış metni.
    const parkMetin = sayfa ? parkMetinRe.test(sayfa) : false;
    if (parkHostRe.test(sonUrl) || parkMetin) parkli = true;
    if (sayfa) {
      iceriktenBulgu(sayfa, r);
      // İÇERİK ANLAMA: sayfanın ne olduğunu çıkar (başlık/tür/açıklama).
      const bilgi = sayfaBilgiCikar(sayfa);
      r.sayfa = bilgi;
      // Sadece GÜVENİLİR yapısal meta gösterilir. İçerik TÜRÜNÜ (haber/alışveriş…)
      // kırılgan regex yerine AI (Gemini) belirler — çok daha isabetli.
      if (bilgi.baslik) {
        // Bizim CANLI fetch başlığı urlscan'in olası BAYAT taramasından günceldir
        // (turkcell.site: urlscan eski "Natro hosting park", bizimki güncel "5G Saha
        // Test") → çelişen ikinci başlığı gösterme, urlscan başlığını kaldır.
        r.alanlar = r.alanlar.filter((a) => a.ad !== "Sayfa başlığı (urlscan)");
        r.alanlar.push({ ad: "Sayfa başlığı", deger: bilgi.baslik });
      }
      if (bilgi.siteAdi) r.alanlar.push({ ad: "Site", deger: bilgi.siteAdi });
    }
  }

  // PARK / SATILIK domain kararı (urlscan VEYA içerik besledi). Marka adını taşısa
  // bile AKTİF tuzak DEĞİLDİR (giriş/ödeme formu yok) → "TEHLİKELİ" deme, Orta'ya çek
  // ve dürüst mesaj ver. Böylece "sahte giriş sayfası" abartısı da engellenir.
  if (parkli) {
    r.alanlar.push({ ad: "Sayfa durumu", deger: "Park / satılık domain (aktif içerik yok)" });
    if (taklit) {
      r.risk = Math.min(r.risk, 35);
      r.bulgular = r.bulgular.filter((b) => !/gibi görünüyor|çok benziyor|typosquatting/i.test(b));
      r.bulgular.unshift(
        `Bu adres "${taklit.ad}" adını taşıyor ama şu an AKTİF bir tuzak DEĞİL — satılık/park edilmiş bir domain (giriş/ödeme sayfası yok). Yine de ${taklit.ad}'ın resmi adresi değildir (${taklit.resmi[0]}); ileride sahte içerikle doldurulabileceği için temkinli ol.`
      );
    } else {
      r.risk = Math.min(r.risk, 18);
    }
  }

  // GÖRSEL ANALİZ (AI Vision): marka-taklit şüphesi + ekran görüntüsü varsa, sayfanın
  // GÖRSELİNİ AI'a analiz ettir — sahte giriş/ödeme formu mu, meşru içerik mi? Metin
  // başlığı yanıltabilir (edevletile.com "blog" başlıklı ama...) — göz kesin karar verir.
  if (markaEslesme && r.ekranGoruntusu && geminiVarMi) {
    try {
      const img = await fetch(r.ekranGoruntusu, { signal: AbortSignal.timeout(8000) });
      const buf = img.ok ? Buffer.from(await img.arrayBuffer()) : null;
      if (buf && buf.length > 500 && buf.length < 4_000_000) {
        const mime = img.headers.get("content-type") || "image/png";
        // Gecikme sınırı: Gemini meşgulse en çok 13sn bekle, sonra atla (best-effort).
        const gj = (await Promise.race([
          geminiGorselJson<{ tur?: string; kimlikAvi?: boolean; aciklama?: string }>(
            `Bu bir web sitesinin ekran görüntüsü. SADECE şu JSON'u döndür: {"tur":"kısa tür (banka giriş sayfası|giriş/oturum formu|ödeme/kart sayfası|içerik/blog|haber|e-ticaret|park/satılık|boş/hata/challenge)","kimlikAvi":true/false (kullanıcıdan ŞİFRE/KART/KİMLİK/KOD isteyen bir form GERÇEKTEN GÖRÜNÜYOR mu),"taklitKurum":"YALNIZ görselde NET ve KESİN gördüğün bir marka/kurum LOGOSU varsa adını yaz; sayfa boşsa, hata sayfasıysa (404/525/522/SSL/timeout), Cloudflare 'Just a moment'/'Attention Required' challenge ekranıysa ya da EMİN DEĞİLSEN BOŞ bırak — beklediğin/tahmin ettiğin markayı ASLA yazma","aciklama":"1 cümle ne gördüğün"}. Türkçe.`,
            `Görselde GERÇEKTEN ne görüyorsun? Boş/hata/challenge ekranı mı, yoksa dolu bir sayfa mı? Kullanıcıdan şifre/kart isteyen bir form GÖRÜNÜYOR mu? Sadece NET gördüğün logoyu bildir; tahminde bulunma.`,
            buf.toString("base64"),
            mime
          ),
          new Promise<null>((res) => setTimeout(() => res(null), 20000)),
        ])) as { tur?: string; kimlikAvi?: boolean; taklitKurum?: string; aciklama?: string } | null;
        if (gj?.tur) {
          // HATA/CHALLENGE EKRANI: görüntü gerçek site içeriği DEĞİL (525/522/404/SSL/
          // Cloudflare challenge). Böyle bir ekrandan çıkarılan "logo/form" bulgusu
          // güvenilmezdir (AI, turcell.com.tr'nin 525 ekranında "Turkcell logosu" uydurdu).
          const HATA_RE = /boş|hata|challenge|error|just a moment|attention required|not found|handshake|timed out|erişilem|connection|\b[45]\d\d\b/i;
          // Bağımsız sinyal: yakalanan sayfa başlığı da hata/challenge işareti taşıyorsa
          // AI'ın "dolu sayfa + logo" demesine güvenme (halüsinasyon koruması).
          const baslikMetni = `${r.alanlar.find((x) => x.ad === "Sayfa başlığı (urlscan)")?.deger || ""} ${r.sayfa?.baslik || ""}`;
          const hataEkrani = HATA_RE.test(`${gj.tur} ${gj.aciklama || ""}`) || HATA_RE.test(baslikMetni);
          r.alanlar.push({ ad: "Görsel analiz (AI)", deger: gj.tur });
          if (hataEkrani) {
            r.alanlar.push({ ad: "Görsel notu", deger: "Ekran görüntüsü hata/challenge sayfası — görsel içerik güvenilir değil, logo/form bulgusu uygulanmadı" });
            // Kullanıcının GÖRDÜĞÜ ekran görüntüsünün ALTINA dürüst not: bu görüntü
            // sitenin gerçek içeriği değil (boş/varsayılan kurulum · hata · challenge ·
            // cloaking). Karar bu görüntüye değil resmî/teknik sinyallere dayanır.
            if (!r.ekranNotu) r.ekranNotu = "Bu görüntü sitenin gerçek içeriği değil — boş/varsayılan kurulum, hata ya da erişim-engeli (challenge/gizleme) sayfası. Zararlı içerik kaldırılmış veya tarayıcıdan gizleniyor olabilir; tehlike kararı bu görüntüye değil, resmî ve teknik sinyallere (USOM, sertifika, altyapı…) dayanır.";
          }
          // Görsel doğrulandı → honesty-gate "içeriği görmedik" diye Orta'ya çekmesin.
          // (Hata ekranı gerçek içerik değil → r.sayfa'yı ondan besleme.)
          if (!r.sayfa && !hataEkrani) r.sayfa = { baslik: gj.aciklama || gj.tur, aciklama: gj.aciklama || null, siteAdi: null, tur: gj.tur, ozetMetin: gj.aciklama || gj.tur };
          if (gj.kimlikAvi && !hataEkrani) {
            r.risk += 30;
            r.bulgular.unshift(`Ekran görüntüsünde: "${markaEslesme}" adını taşıyan bu sayfa kullanıcıdan şifre/kart/kimlik bilgisi İSTİYOR — kimlik avı (phishing) sayfası. Bilgi girme.`);
          }
          // GÖRSEL LOGO TAKLİDİ: AI, sayfada bir marka/kurum LOGOSU tespit ettiyse (adım 10).
          // Hata/challenge ekranındaysa UYGULAMA (halüsinasyon koruması).
          const tk = (gj.taklitKurum || "").trim();
          if (tk && tk.length > 2 && !/yok|none|belli değil|belirsiz/i.test(tk) && !hataEkrani) {
            r.risk += 25;
            r.bulgular.unshift(`Görselde "${tk}" logosu/amblemi kullanılıyor — bu adres o kurumun/markanın resmî sitesi değil, logo taklidiyle güven kazanmaya çalışıyor.`);
            r.alanlar.push({ ad: "Logo taklidi (görsel)", deger: tk });
          }
        }
      }
    } catch { /* görsel/AI alınamadı: diğer sinyaller geçerli */ }
  }

  // FAVİCON PİVOT (adım 9): marka şüphesi varsa, aynı favicon'a sahip DİĞER siteleri bul.
  // Aynı favicon = aynı phishing-kit → operasyonun kardeş sitelerini ortaya çıkarır.
  if (markaEslesme) {
    try {
      const kardes = await faviconPivot(domain);
      if (kardes.length >= 2) {
        r.alanlar.push({ ad: "Kardeş siteler (aynı favicon)", deger: `${kardes.length} site: ${kardes.slice(0, 4).join(", ")}${kardes.length > 4 ? "…" : ""}` });
        r.bulgular.push(`Bu sitenin favicon'u ${kardes.length} başka adreste daha görüldü — muhtemelen aynı dolandırıcılık altyapısının (kit) parçası: ${kardes.slice(0, 3).join(", ")}.`);
        r.risk += 10;
      } else if (kardes.length === 1) {
        r.alanlar.push({ ad: "Kardeş site (aynı favicon)", deger: kardes[0] });
      }
    } catch { /* pivot başarısızsa geç */ }
  }

  // ── ÇOK-MODLU MARKA BENZERLİĞİ (adım 10): "isim geçiyor" ≠ "taklit ediliyor" ──
  // Yalnız alan adında marka geçmesi ZAYIF kanıttır. Başlık/metin + favicon/logo +
  // görsel-giriş modaliteleri eklendikçe "gerçek taklit" güvenine ulaşır. Bu, kategori
  // kartındaki "Marka Taklidi" seviyesini kelime-eşleşmesinden KANITA taşır.
  if (markaEslesme && markaAnahtarE) {
    const kanitlar: string[] = ["alan adı"];
    let guven = 25;
    const icerik = `${r.sayfa?.baslik || ""} ${r.sayfa?.ozetMetin || ""} ${r.sayfa?.siteAdi || ""}`.toLowerCase();
    if (icerik.includes(markaAnahtarE) || icerik.includes(markaEslesme.toLowerCase())) { guven += 30; kanitlar.push("sayfa metni/başlığı"); }
    try {
      const fm = await faviconMarkaEslesme(domain);
      if (fm && fm.ad.toLowerCase().includes(markaAnahtarE)) { guven += 40; kanitlar.push("favicon/logo birebir"); }
    } catch { /* favicon alınamadı */ }
    const gorselA = (r.alanlar.find((x) => x.ad === "Görsel analiz (AI)")?.deger || "").toLowerCase();
    if (/banka giriş|giriş\/oturum|ödeme\/kart/.test(gorselA)) { guven += 25; kanitlar.push("görsel giriş/ödeme formu"); }
    guven = Math.min(100, guven);
    r.alanlar.push({ ad: "Marka taklidi güveni", deger: `${guven}/100 — kanıt: ${kanitlar.join(" + ")}` });
    // Çok-modlu doğrulama (isim + en az 2 kanıt) → gerçek taklit, riski pekiştir.
    if (kanitlar.length >= 3) {
      r.risk += 15;
      r.bulgular.unshift(`"${markaEslesme}" taklidi çok-modlu doğrulandı (${kanitlar.slice(1).join(", ")}) — büyük olasılıkla gerçek marka taklidi, dikkat.`);
    }
  }

  // YASA DIŞI BAHİS/KUMAR sitesi tespiti. Bu siteler Cloudflare arkasına saklanır
  // (içerik "Just a moment…" → risk 0 çıkardı). Domain adı + gizlenme ele verir.
  // Türkiye'de yasak; para yatırınca ödemez, kart/kimlik çalar.
  if (!parkli) {
    const etiket = domain.split(".")[0];
    const bahisAcik = /bahis|casino|iddaa|rulet|betboo|jackpot|freespin|\bslot|pokerbet|sportsbook|1xbet|mostbet|bet(turkey|park|tilt|win|boo)|betting/i.test(domain);
    const cfGizli = /just a moment|bir dakika|checking your browser|attention required|cloudflare/i.test(r.sayfa?.baslik || "");
    const betSonek = /^[a-z]{3,}bet\d{0,4}$/.test(etiket) && !/^(alphabet|sherbet|tibet|beta|abet|corbet|colbert)$/.test(etiket);
    const riskliTld = RISKLI_TLD.includes(domain.split(".").pop() || "");
    if (bahisAcik || (betSonek && (cfGizli || riskliTld))) {
      r.risk += 45;
      r.bulgular.unshift("Bu bir yasa dışı bahis/kumar sitesi görünümünde — Türkiye'de yasaktır. Para yatırma, kart/kimlik bilgisi verme; bu siteler çoğu zaman ödeme yapmaz.");
      if (!r.alanlar.some((a) => a.ad === "Site türü")) r.alanlar.push({ ad: "Site türü", deger: "Yasa dışı bahis/kumar (olası)" });
    }
  }

  // ── ENGELLEME / KALDIRILMA DURUMU: bu adres ZATEN mi biliniyor/engelli, yoksa YENİ mi? ──
  // "Bulduklarımızın bir kısmı zaten engellenmiş" sorusunun cevabı: hangi resmî/blok
  // kaynağı zaten yakalamış onu göster; hiçbiri yakalamadıysa = bunu ERKEN biz bulduk.
  {
    const kara = r.alanlar.find((a) => a.ad === "Kara liste")?.deger || "";
    const engel: string[] = [];
    if (/USOM/i.test(kara)) engel.push("USOM (resmî TR liste)");
    if (/Safe Browsing/i.test(kara)) engel.push("Google Safe Browsing");
    if (/Cloudflare/i.test(kara)) engel.push("Cloudflare");
    if (/OpenPhish/i.test(kara)) engel.push("OpenPhish");
    if (/PhishStats/i.test(kara)) engel.push("PhishStats");
    if (/URLhaus|ThreatFox|abuse/i.test(kara)) engel.push("abuse.ch");
    if (r.alanlar.some((a) => a.ad === "Registrar durumu")) engel.push("registrar askıya aldı");
    const dnsYok = r.alanlar.some((a) => a.ad === "Kayıt bilgisi" && /çözülmüyor/i.test(a.deger)) ||
      r.bulgular.some((b) => /çözülmüyor|yayında değil veya kapatılmış/i.test(b));
    let durumMetni: string | null = null;
    if (engel.length) durumMetni = `Zaten biliniyor/engelli → ${engel.join(", ")}`;
    else if (dnsYok) durumMetni = "Kaldırılmış/çözülmüyor olabilir — kontrol ettiğimiz açık listelerde yok";
    else if (r.risk >= 60)
      // DÜRÜST: yalnız KONTROL ETTİĞİMİZ açık listeleri (USOM/GSB/Cloudflare/OpenPhish/
      // abuse.ch) görebiliriz. Kurumsal/ISP filtreleri (kapalı ticari DB) ayrıca
      // engellemiş OLABİLİR — bunu göremeyiz, o yüzden "hiçbir yerde yok" DEMEYİZ.
      durumMetni = "Kontrol ettiğimiz açık/resmî listelerde (USOM, Google Safe Browsing, Cloudflare, OpenPhish, PhishStats, abuse.ch) YOK — kurumsal/ISP filtreleri ayrıca engellemiş olabilir. USOM'a bildirmeye değer.";
    if (durumMetni) r.alanlar.push({ ad: "Engelleme durumu", deger: durumMetni });
  }

  return r;
}

const OPERATOR: Record<string, string> = {
  "50": "Vodafone / yeni seri", "53": "Turkcell", "54": "Vodafone", "55": "Türk Telekom",
};

// IPQS operatör dizesini sade, tanıdık ada indirger (ör. "TURKCELL İletişim
// Hizmetleri A.Ş." → "Turkcell"). Aynı zamanda olası kodlama bozulmalarını da atlatır.
function operatorTemizle(c: string): string {
  const x = c.replace(/\s+/g, " ").trim();
  const l = x.toLowerCase();
  if (l.includes("turkcell")) return "Turkcell";
  if (l.includes("vodafone")) return "Vodafone";
  if (l.includes("telekom") || l.includes("avea") || l.includes("ttnet")) return "Türk Telekom";
  return x;
}

// Sabit hat alan kodları (yaygın iller). Tam liste değil; tanınanlar isimlenir.
const ALAN_KODU: Record<string, string> = {
  "212": "İstanbul (Avrupa)", "216": "İstanbul (Anadolu)", "312": "Ankara",
  "232": "İzmir", "224": "Bursa", "242": "Antalya", "322": "Adana",
  "262": "Kocaeli", "352": "Kayseri", "442": "Erzurum", "462": "Trabzon",
  "332": "Konya", "342": "Gaziantep", "222": "Eskişehir", "252": "Muğla",
  "236": "Manisa", "412": "Diyarbakır", "362": "Samsun", "382": "Aksaray",
};

// IPQS telefon istihbaratı (IPQS_KEY varsa) — gerçek dünya fraud verisi.
// Kısa süreli önbellek (ücretsiz kota 1000/ay — koru).
type IpqsTel = { success?: boolean; fraud_score?: number; VOIP?: boolean; recent_abuse?: boolean; risky?: boolean; active?: boolean; prepaid?: boolean; carrier?: string; line_type?: string };
const ipqsCache = new Map<string, { v: IpqsTel | null; t: number }>();
async function ipqsTelefon(num: string): Promise<IpqsTel | null> {
  const key = process.env.IPQS_KEY;
  if (!key) return null;
  const c = ipqsCache.get(num);
  if (c && Date.now() - c.t < 3600_000) return c.v;
  try {
    const r = await fetch(
      `https://ipqualityscore.com/api/json/phone/${key}/${encodeURIComponent(num)}?country[]=TR`,
      { signal: AbortSignal.timeout(8000) }
    );
    const j = await r.json();
    const v: IpqsTel | null = j?.success ? j : null;
    ipqsCache.set(num, { v, t: Date.now() });
    return v;
  } catch {
    return null;
  }
}

// DÜRÜST BELİRSİZLİK GEÇİDİ: Marka adı taşıyan (typosquat) ama sayfa içeriği
// DOĞRULANAMAYAN + TEYİTLİ-kötücül (USOM/VT çoklu/park) sinyali OLMAYAN adresleri
// "%100 tuzak" ilan etmeyi engeller (satılık/park/henüz-boş olabilir) → Orta'ya (55)
// çeker + dürüst dil. HEM /api/osint HEM sahte-bul çağırır → aynı domain her yerde
// aynı skoru alır (turkcell.online: kontrol'de 55, marka-taramada 100 tutarsızlığı biterdi).
export function typosquatDurustlukCap(rapor: OsintRapor): void {
  const metinHavuzu = (rapor.bulgular.join(" ") + " " + rapor.alanlar.map((a) => `${a.ad}:${a.deger}`).join(" ")).toLowerCase();
  const typosquat = rapor.alanlar.some((a) => a.ad === "Taklit uyarısı");
  const icerikTeyitli = Boolean(rapor.sayfa?.baslik);
  const teyitliKotucul =
    /usom|urlscan.*zararl|tehdit listesi|dolandırıcı olarak bildirdi|güvenli bağlantı.*yok/.test(metinHavuzu) ||
    /virustotal[^;]*?([3-9]|\d\d)\s*\/\s*\d+\s*firma/.test(metinHavuzu) ||
    /park \/ satılık/.test(metinHavuzu);
  if (typosquat && !icerikTeyitli && !teyitliKotucul && rapor.risk > 55) {
    const marka = rapor.alanlar.find((a) => a.ad === "Taklit uyarısı")?.deger || "";
    const markaAd = marka.split(/[ (]/)[0] || "bu marka";
    rapor.risk = 55;
    rapor.bulgular = rapor.bulgular.filter((b) => !/tuzak sitesi|sahte (giriş|site)|oltalama sayfas/i.test(b));
    rapor.bulgular.unshift(
      `Bu adres "${markaAd}" adını taşıyor; ama içeriğine ulaşıp gerçekten sahte bir tuzak (giriş/ödeme sayfası) olduğunu DOĞRULAYAMADIK — satılık/park ya da henüz boş olabilir. Kesin olan: bu ${markaAd}'ın RESMİ adresi DEĞİL. Resmi işlem için markanın bilinen resmi sitesini kullan, buraya bilgi girme.`
    );
    rapor.sayfa = undefined;
  }
}

export async function telefonOsint(num: string): Promise<OsintRapor> {
  // num: 0XXXXXXXXXX (0 + 10 hane) — cep, sabit hat veya özel hat
  const r: OsintRapor = { tip: "telefon", deger: num, alanlar: [], bulgular: [], risk: 0 };
  const s = num.replace(/\D/g, "").replace(/^90/, "");
  const n = s.startsWith("0") ? s : "0" + s;
  const gecerli = /^0\d{10}$/.test(n);
  if (!gecerli) {
    r.alanlar.push({ ad: "Biçim", deger: "Geçersiz numara biçimi" });
    r.bulgular.push("Numara geçerli bir Türk telefon biçiminde değil (0 + 10 hane bekleniyor).");
    return r;
  }

  const alan3 = n.slice(1, 4); // 0'dan sonraki ilk 3 hane: 5XX / 212 / 850 …
  const cep = n[1] === "5";
  let prefixOp = ""; // ön-ekten tahmin edilen operatör (yalnız cep)

  if (cep) {
    // CEP
    prefixOp = OPERATOR[n.slice(1, 3)] || "";
    r.alanlar.push({ ad: "Hat tipi", deger: "Cep telefonu (mobil)" });
  } else if (alan3 === "900") {
    r.alanlar.push({ ad: "Hat tipi", deger: "Katma değerli / ücretli hat (0900)" });
    r.risk += 40;
    r.bulgular.push("0900 hattı — aranınca yüksek ücret yazar. Meşru kurumlar sizi 0900 ile aramaz; dolandırıcılıkta sık kullanılır.");
  } else if (alan3 === "850") {
    r.alanlar.push({ ad: "Hat tipi", deger: "Çağrı merkezi / özel hizmet hattı (0850)" });
    // 0850'yi çoğu MEŞRU kurum (banka, e-ticaret) da kullanır → tek başına risk
    // değil, yalnızca bilgilendirme/temkin. Gerçek risk diğer sinyallerden gelir.
    r.bulgular.push("0850 bir çağrı merkezi hattıdır; hem meşru kurumlar hem dolandırıcılar kullanabilir. Kurumu numaranın kendisinden değil, resmi web sitesinden doğrula.");
  } else if (alan3 === "800") {
    r.alanlar.push({ ad: "Hat tipi", deger: "Ücretsiz müşteri hattı (0800)" });
    r.bulgular.push("0800 ücretsiz bir hattır; yine de arayan/aranan kurumu resmi kanaldan doğrulayın.");
  } else {
    // SABİT HAT
    const il = ALAN_KODU[alan3];
    r.alanlar.push({ ad: "Hat tipi", deger: "Sabit hat" });
    r.alanlar.push({ ad: "Bölge (alan kodu 0" + alan3 + ")", deger: il || "Tanınmayan alan kodu" });
    if (!il) {
      r.risk += 10;
      r.bulgular.push("Alan kodu bilinen Türk il koduyla eşleşmiyor — numara geçersiz ya da yanıltıcı olabilir.");
    }
  }

  // IPQS gerçek-dünya fraud verisi (varsa) — kural-tahminden gerçek risk skoruna.
  const iq = await ipqsTelefon(n);
  if (iq) {
    const fs = Number(iq.fraud_score || 0);
    if (fs >= 90) { r.risk += 40; r.bulgular.push(`IPQS: bu numara YÜKSEK dolandırıcılık riski taşıyor (skor ${fs}/100).`); }
    else if (fs >= 80) { r.risk += 18; r.bulgular.push(`IPQS: bu numara şüpheli işaretlerle ilişkili (risk skoru ${fs}/100).`); }
    if (iq.VOIP) {
      r.risk += 15;
      r.alanlar.push({ ad: "Hat türü", deger: "VOIP / sanal hat" });
      r.bulgular.push("Sanal internet hattı (VOIP) — gerçek kimlik gizlenebilir; dolandırıcılıkta çok kullanılır.");
    }
    if (iq.recent_abuse) { r.risk += 30; r.bulgular.push("Bu numara yakın zamanda kötüye kullanım kayıtlarında görüldü."); }
    else if (iq.risky) { r.risk += 12; r.bulgular.push("IPQS bu numarayı riskli olarak işaretliyor."); }
    if (iq.active === false) r.alanlar.push({ ad: "Hat durumu", deger: "Aktif değil / kullanılmıyor" });
  }

  // Operatör — TEK temiz satır: canlı IPQS taşıyıcısı varsa onu (güncel),
  // yoksa ön-ekten (tahsis) göster. Mükerrer "Operatör (tahsis)/(IPQS)" biter.
  if (cep) {
    const canliOp = iq?.carrier ? operatorTemizle(iq.carrier) : "";
    if (canliOp) {
      r.alanlar.push({ ad: "Operatör", deger: canliOp });
    } else if (prefixOp) {
      r.alanlar.push({ ad: "Operatör", deger: prefixOp });
      r.bulgular.push("Not: Operatör numaranın ön-ekinden tahmin edildi; numara taşıma (taşınma) nedeniyle güncel operatör farklı olabilir.");
    }
  }

  // SEON dijital ayak izi (anahtar varsa) — numara hangi platformlarda kayıtlı.
  // Gerçek hatlar WhatsApp/Telegram vb.'de görünür; tamamen "boş" numara + risk şüphelidir.
  const seon = await seonTelefon(n);
  if (seon && seon.platformlar.length) {
    r.alanlar.push({ ad: "Kayıtlı platformlar", deger: seon.platformlar.join(", ") });
  }

  // Her numara için: arayan kimliği (Caller ID) taklit edilebilir.
  r.bulgular.push("Unutma: Arayan numara teknik olarak taklit edilebilir (spoofing). Numara tanıdık görünse bile paylaşacağın bilgiye dikkat et.");
  return r;
}

// Belli başlı Türk bankaları (IBAN'daki 5 haneli banka kodu).
const BANKALAR: Record<string, string> = {
  "00010": "Ziraat Bankası", "00012": "Halkbank", "00015": "Vakıfbank",
  "00032": "TEB", "00046": "Akbank", "00059": "Şekerbank",
  "00062": "Garanti BBVA", "00064": "İş Bankası", "00067": "Yapı Kredi",
  "00099": "ING", "00111": "QNB Finansbank", "00123": "HSBC",
  "00125": "Papara (ödeme kuruluşu)", "00134": "Denizbank",
  "00203": "Albaraka Türk", "00205": "Türkiye Finans", "00206": "Kuveyt Türk",
  "00143": "Enpara / diğer", "00109": "İş / diğer",
};

function ibanGecerliMi(iban: string): boolean {
  const s = iban.toUpperCase().replace(/\s/g, "");
  if (!/^TR\d{24}$/.test(s)) return false;
  const yeni = s.slice(4) + s.slice(0, 4);
  const sayi = yeni.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  // mod 97 (büyük sayı için parça parça)
  let kalan = 0;
  for (const ch of sayi) kalan = (kalan * 10 + Number(ch)) % 97;
  return kalan === 1;
}

export function ibanOsint(iban: string): OsintRapor {
  const s = iban.toUpperCase().replace(/\s/g, "");
  const r: OsintRapor = { tip: "iban", deger: s, alanlar: [], bulgular: [], risk: 0 };
  const gecerli = ibanGecerliMi(s);
  r.alanlar.push({ ad: "Geçerlilik", deger: gecerli ? "Geçerli IBAN (checksum tuttu)" : "Geçersiz IBAN (checksum tutmadı)" });
  if (!gecerli) { r.bulgular.push("IBAN checksum'ı tutmuyor — yanlış yazılmış veya sahte olabilir."); }
  const kod = s.slice(4, 9);
  const banka = BANKALAR[kod] || "Bilinmeyen / listede olmayan banka";
  r.alanlar.push({ ad: "Banka", deger: banka });
  return r;
}
