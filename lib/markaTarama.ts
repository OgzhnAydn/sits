// Vercel-içi MARKA TARAYICI — ayrı sunucu/CertStream worker'a GEREK YOK.
// Her korunan marka için urlscan'i tarar (page.domain:marka*), marka adını taşıyan
// resmî-OLMAYAN domainleri "aday" olarak kuyruğa (/marka-avci) düşürür. Günlük cron
// (rapor-uret) bunu çağırır → kart/sunucu derdi olmadan kuyruk kendiliğinden dolar.

import { resolve4 } from "node:dns/promises";
import { AVCI_MARKALAR, resmiMarkaDomaini, resmiListedeMi } from "./korunanMarkalar";
import { markaAdayKaydet, markaGunlukArtir, kullaniciMarkalariGetir } from "./store";
import { itibarliMi } from "./itibarli";

const RISKLI_TLD = ["xyz", "top", "tk", "buzz", "icu", "cyou", "rest", "monster", "click", "shop", "live", "online", "site", "vip", "club", "fun", "website", "space", "info", "biz"];

const UA = { "User-Agent": "Mozilla/5.0", accept: "application/json" };

type UsSonuc = { page?: { domain?: string; url?: string; title?: string; domainAgeDays?: number; ip?: string; country?: string }; task?: { url?: string } };

// Ücretsiz/paylaşımlı barındırma platformları: marka URL YOLUNDA geçse de apex'i (sites.google.com)
// "marka adayı" yapmak YANLIŞ olur (platformu suçlar). Dork'ta bunları atla (apex değilse — ör.
// akbank.wixsite.com — alt-alan markayı taşır, zaten host-eşleşmesiyle yakalanır).
const PAYLASIMLI_PLATFORM = /(^|\.)(sites\.google\.com|google\.com|blogspot\.com|wordpress\.com|wixsite\.com|weebly\.com|github\.io|gitlab\.io|netlify\.app|pages\.dev|web\.app|firebaseapp\.com|glitch\.me|vercel\.app|herokuapp\.com|000webhostapp\.com|r2\.dev|medium\.com|notion\.site|surge\.sh|repl\.co|replit\.dev)$/i;

async function urlscanAra(q: string, size = 20): Promise<UsSonuc[]> {
  try {
    // API-Key varsa gönder: daha yüksek kota + leading-wildcard (dork için ŞART; anonim 403 verir).
    const key = process.env.URLSCAN_KEY;
    const r = await fetch(`https://urlscan.io/api/v1/search/?q=${encodeURIComponent(q)}&size=${size}`, { headers: key ? { ...UA, "API-Key": key } : UA, signal: AbortSignal.timeout(9000) });
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

// DNS-PERMÜTASYON TARAMASI — "aradaki kayıpları" güvenilir yakalar. urlscan/crt.sh'e bağımlı DEĞİL:
// markanın kalıplarını yaygın phishing TLD'leriyle birleştirir, DNS'le CANLI olanları bulur.
// (Gerçek örnek: gdzelektrik.xyz urlscan'de yoktu, crt.sh 429 veriyordu → bu yöntem bulur.)
const TARA_TLD = ["com", "net", "com.tr", "org", "xyz", "online", "shop", "site", "info", "vip", "live", "click", "top", "store", "app"];
function dnsCanli(domain: string): Promise<boolean> {
  // Native DNS (UDP) — DoH'tan çok hızlı, rate-limit yok. Her sorguya 2.5s güvenlik sınırı.
  return Promise.race([
    resolve4(domain).then((a) => a.length > 0).catch(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(false), 2500)),
  ]);
}
async function dnsPermutasyonTara(kaliplar: string[]): Promise<string[]> {
  const aday = new Set<string>();
  for (const k of kaliplar) for (const tld of TARA_TLD) aday.add(`${k}.${tld}`);
  const list = [...aday].slice(0, 200);
  const canli: string[] = [];
  for (let i = 0; i < list.length; i += 50) {
    const grup = await Promise.all(list.slice(i, i + 50).map(async (d) => [d, await dnsCanli(d)] as const));
    for (const [d, ok] of grup) if (ok) canli.push(d);
  }
  return canli;
}

async function batch<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

// TEK MARKAYI aktif tara — urlscan'de marka adını taşıyan resmî-olmayan domainleri bul,
// aday kuyruğuna yaz. Operatör "Tara" butonu + toplu tarama ikisi de bunu kullanır.
export async function markaTaraTekil(m: { anahtar: string; ad: string; resmi?: string[]; kaliplari?: string[] }): Promise<{ taranan: number; yeni: number }> {
  const tarih = new Date().toISOString().slice(0, 10);
  let taranan = 0, yeni = 0;
  // GENİŞ ARAMA: yalnız ana anahtarın öneki DEĞİL — anahtar + tüm açılım kalıpları (gumrukticaret.info
  // gibi kalıp-eşleşmeleri kaçmasın), her biri için PREFIX (page.domain:k*) VE geniş (bare q=k, alt-alan/
  // URL içinde geçen taklitleri de bulur, ör. etbis-…ticaretbakanligi…koreavm.net). ≥5 harf kalıplar
  // (gürültü sınırlı). HOST bir kalıbı içermezse (bare aramanın alakasız sonucu) elenir.
  const kaliplar = [m.anahtar, ...(m.kaliplari || [])].filter((k) => k && k.length >= 5);
  const gorulen = new Set<string>();
  const res: UsSonuc[] = [];
  for (const k of kaliplar) {
    res.push(...await urlscanAra(`page.domain:${k}*`, 20));
    res.push(...await urlscanAra(k, 20));
  }
  for (const r of res) {
    const dom = (r.page?.domain || "").toLowerCase().replace(/^www\./, "");
    if (!dom || gorulen.has(dom) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) continue;
    gorulen.add(dom);
    taranan++;
    // HOST (alt-alan dahil) kalıplardan birini içermeli; resmî/itibarlı ise aday DEĞİL.
    if (!kaliplar.some((k) => dom.includes(k)) || resmiMarkaDomaini(dom) || resmiListedeMi(dom, m.resmi || []) || itibarliMi(dom)) continue;

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
        domain: dom, marka: m.anahtar, markaAdi: m.ad, skor, seviye: seviye(skor),
        sinyaller: ["urlscan taramasında bulundu — marka adını taşıyan, resmî olmayan domain."],
        kaynak: "vercel-tarama", zaman: Date.now(),
      });
      yeni++;
    } catch { /* yazma başarısızsa geç */ }
  }

  // ── DNS-PERMÜTASYON (ARADAKİ KAYIPLAR) — urlscan'in kaçırdığı CANLI taklitleri bul ──
  // Markanın kalıplarını yaygın TLD'lerle dener, DNS'le canlı olanları marka adayı olarak kaydeder.
  const dnsCanliDoms = await dnsPermutasyonTara(kaliplar);
  for (const dom of dnsCanliDoms) {
    if (gorulen.has(dom)) continue;
    gorulen.add(dom); taranan++;
    if (!kaliplar.some((k) => dom.includes(k)) || resmiMarkaDomaini(dom) || resmiListedeMi(dom, m.resmi || []) || itibarliMi(dom)) continue;
    let skor = 46; // marka adını taşıyan + resmî değil + CANLI (DNS'te çözülüyor)
    const tld = dom.split(".").pop() || "";
    if (RISKLI_TLD.includes(tld)) skor += 14;
    skor = Math.min(100, skor);
    try {
      await markaGunlukArtir(m.anahtar, tarih, true);
      await markaAdayKaydet({
        domain: dom, marka: m.anahtar, markaAdi: m.ad, skor, seviye: seviye(skor),
        sinyaller: ["DNS taramasında bulundu — marka adını taşıyan, resmî olmayan CANLI domain (geriye dönük kurtarma)."],
        kaynak: "dns-tarama", zaman: Date.now(),
      });
      yeni++;
    } catch { /* */ }
  }

  // ── ARAMA-MOTORU DORK (#2) — marka yalnız URL YOLUNDA/BAŞLIKTA, host'ta DEĞİL ──
  // CT/NRD/favicon yalnız alan-adı-tabanlı: alt-yolda barınan oltalamayı (ör. ele-geçirilmiş
  // bir sitede /akbank/giris, ya da paylaşımlı platformda akbank-sayfası) GÖREMEZ. urlscan'in
  // taranan-sayfa arşivinde page.url / page.title dork'u bunları yakalar. FP kalkanı: itibarlı
  // VE paylaşımlı-platform apex'leri ELE (haber makalesi / platformu suçlama yok); host markayı
  // ZATEN içeriyorsa üstteki domain-eşleşmesi hallediyor → burada yalnız "yol/başlıkta" olanlar.
  const dorkRes: UsSonuc[] = [];
  for (const k of kaliplar) {
    dorkRes.push(...await urlscanAra(`page.url:*${k}* AND NOT page.domain:*${k}*`, 20));
    dorkRes.push(...await urlscanAra(`page.title:"${k}" AND NOT page.domain:*${k}*`, 15));
  }
  for (const r of dorkRes) {
    const dom = (r.page?.domain || "").toLowerCase().replace(/^www\./, "");
    const url = (r.page?.url || r.task?.url || "").slice(0, 300);
    const baslik = (r.page?.title || "").slice(0, 160);
    if (!dom || gorulen.has(dom) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) continue;
    gorulen.add(dom); taranan++;
    // Marka GERÇEKTEN yolda/başlıkta mı (urlscan bazen gevşek eşler)? host markayı içermemeli.
    const yoldaVar = kaliplar.some((k) => url.toLowerCase().includes(k) || baslik.toLowerCase().includes(k));
    const hostMarkali = kaliplar.some((k) => dom.includes(k));
    if (!yoldaVar || hostMarkali) continue;
    // FP kalkanı: resmî / itibarlı / paylaşımlı-platform apex → aday YAPMA (manuel inceleme işi).
    if (resmiMarkaDomaini(dom) || resmiListedeMi(dom, m.resmi || []) || itibarliMi(dom) || PAYLASIMLI_PLATFORM.test(dom)) continue;
    // Kalan: itibarsız/sıradan host'ta marka adını taşıyan sayfa → ele-geçirilmiş/oltalama şüphesi.
    let skor = 40;
    const tld = dom.split(".").pop() || "";
    if (RISKLI_TLD.includes(tld)) skor += 10;
    skor = Math.min(100, skor);
    try {
      await markaGunlukArtir(m.anahtar, tarih, true);
      await markaAdayKaydet({
        domain: dom, marka: m.anahtar, markaAdi: m.ad, skor, seviye: seviye(skor),
        sinyaller: [`Arama dork: "${m.ad}" markası bu sitenin alan adında YOK ama bir SAYFASINDA geçiyor (${url || baslik}) — ele geçirilmiş site ya da alt-yol oltalaması olabilir.`],
        kaynak: "dork-url", zaman: Date.now(),
      });
      yeni++;
    } catch { /* */ }
  }

  return { taranan, yeni };
}

export async function markalariTara(): Promise<{ taranan: number; yeni: number }> {
  // Hardcoded markalar + KULLANICI'nın kaydettiği markalar (kısa anahtar hariç → gürültü olmasın).
  const ozel = (await kullaniciMarkalariGetir())
    .filter((m) => m.anahtar.length >= 4)
    .map((m) => ({ anahtar: m.anahtar, ad: m.ad, resmi: m.resmi }));
  const hedefler = [...AVCI_MARKALAR, ...ozel];
  const res = await batch(hedefler, 6, markaTaraTekil);
  return res.reduce((a, s) => ({ taranan: a.taranan + s.taranan, yeni: a.yeni + s.yeni }), { taranan: 0, yeni: 0 });
}
