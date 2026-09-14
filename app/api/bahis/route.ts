import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { bahisImzasi, bahisOnFiltre } from "@/lib/bahis";
import { usomBiliniyor } from "@/lib/usom";
import { btkEngelli } from "@/lib/btk";
import { bahisAdayKaydet, bahisAdaylariGetir, bahisAdaySayisi, bahisAdaySayisiKosul, type BahisAday } from "@/lib/store";

export const runtime = "nodejs";

// YASA DIŞI BAHİS RADARI — Certificate Transparency akışından, yeni yayınlanan sertifikaları
// örnekler; bahis imzalı domainleri yakalar ve biriktirir. "Hepsini" değil (imkânsız) —
// AKIŞTAN yakaladıklarımız, doğdukları an. Kalıcı/kapsamlı feed için CertStream worker'ına
// bahis anahtarları eklenir (ayrı iş); bu uç, worker olmadan da app-içi canlı radar sağlar.

type Log = { url: string; kisa: string };
type Yakalanan = { domain: string; ca: string; zaman: number; guven: number; isaretler: string[]; tld: string; trHedefli: boolean; usomda: boolean | null; engelli: boolean | null; marka: string | null };

let LOGLAR: Log[] | null = null;
let LOG_T = 0;
// Modül-içi TAZE birikim (bu örnek). KALICI kaynak Firestore (aşağıda) — worker + app besler.
const YAKALANAN = new Map<string, Yakalanan>();

const yazilanlar = new Set<string>(); // Firestore'a ilk-yazımı yapılan domainler (mükerrer yazma yok)
let sonResolve = 0; // son çözümleme-yazma turu (kota koruması: ≤1/60sn)
const degerliMi = (y: { trHedefli: boolean; marka: string | null; guven: number }) => y.trHedefli || !!y.marka || y.guven >= 85;
// Firestore okuma önbelleği (~15sn) — her poll'de okuma maliyetini kıs.
// KPI'lar (TR-hedefli, biz-önce, marka) bu örnekten hesaplandığı için limit temsili olmalı:
// 200 çok düşüktü (feed 200'de takılıyordu). 1500 → sayaçlar gerçek hacmi yansıtır (Blaze'de ucuz).
let fsCache: { v: BahisAday[]; t: number } = { v: [], t: 0 };
async function firestoreOku(): Promise<BahisAday[]> {
  if (Date.now() - fsCache.t < 15000) return fsCache.v;
  try { const v = await bahisAdaylariGetir(1500); fsCache = { v, t: Date.now() }; return v; } catch { return fsCache.v; }
}
// KPI sayaçları = koleksiyonun GERÇEK sayıları (count aggregation), okunan örneğe (1500) bağlı değil.
// Her biri ucuz tek-alan count; 30sn önbellek ile poll başına maliyet minimal.
let kpiCache = { t: 0, toplam: 0, tr: 0, marka: 0, usomYok: 0 };
async function kpiSayilar() {
  if (Date.now() - kpiCache.t < 30000) return kpiCache;
  try {
    const [toplam, tr, marka, usomYok] = await Promise.all([
      bahisAdaySayisi(),
      bahisAdaySayisiKosul("trHedefli", "==", true),
      bahisAdaySayisiKosul("marka", "!=", null),
      bahisAdaySayisiKosul("usomda", "==", false),
    ]);
    kpiCache = { t: Date.now(), toplam, tr, marka, usomYok };
  } catch { /* önceki cache'i koru */ }
  return kpiCache;
}

function kisaAd(desc: string, url: string): string {
  const m = desc.match(/'([^']+)'/);
  return m ? m[1] : (url.split("/").filter(Boolean).pop() || url).slice(0, 14);
}

async function loglariSec(): Promise<Log[]> {
  if (LOGLAR && Date.now() - LOG_T < 3_600_000) return LOGLAR;
  try {
    const j = (await (await fetch("https://www.gstatic.com/ct/log_list/v3/log_list.json", { signal: AbortSignal.timeout(8000) })).json()) as {
      operators?: { logs?: { url: string; description?: string; state?: Record<string, unknown>; temporal_interval?: { start_inclusive: string; end_exclusive: string } }[] }[];
    };
    const now = Date.now();
    const secilen: Log[] = [];
    for (const op of j.operators || []) {
      for (const log of op.logs || []) {
        const st = log.state && Object.keys(log.state)[0];
        const ti = log.temporal_interval;
        const kapsar = !ti || (Date.parse(ti.start_inclusive) <= now && now < Date.parse(ti.end_exclusive));
        if ((st === "usable" || st === "qualified") && kapsar) { secilen.push({ url: log.url.replace(/\/$/, ""), kisa: kisaAd(log.description || "", log.url) }); break; }
      }
      if (secilen.length >= 5) break;
    }
    if (secilen.length) { LOGLAR = secilen; LOG_T = now; }
  } catch { /* liste alınamadı */ }
  return LOGLAR || [];
}

// Leaf/extra_data → sertifikanın DER buffer'ı (X509 parse YAPMADAN, ucuz).
function derCoz(leafInput: string, extraData?: string): Buffer | null {
  let leaf: Buffer;
  try { leaf = Buffer.from(leafInput, "base64"); } catch { return null; }
  if (leaf.length < 15) return null;
  const tip = leaf.readUInt16BE(10);
  if (tip === 0) { const len = (leaf[12] << 16) | (leaf[13] << 8) | leaf[14]; return leaf.subarray(15, 15 + len); }
  if (tip === 1) { let ed: Buffer; try { ed = Buffer.from(extraData || "", "base64"); } catch { return null; } if (ed.length < 3) return null; const len = (ed[0] << 16) | (ed[1] << 8) | ed[2]; return ed.subarray(3, 3 + len); }
  return null;
}
// UCUZ DER-BAYT ÖN-FİLTRESİ (worker mantığı): X509 parse pahalı; önce ham baytlarda bahis
// anahtarı geçiyor mu diye bak → binlerce sertifikayı ucuza tara, yalnız eşleşeni parse et.
function derBahisAdayi(der: Buffer): boolean {
  const s = der.toString("latin1").toLowerCase();
  return /bet|bahis|casino|kumar|slot|rulet|iddaa|poker|jackpot|spin/.test(s);
}
function parseDomain(der: Buffer): { domain: string; ca: string } | null {
  try {
    const x = new crypto.X509Certificate(der);
    const san = (x.subjectAltName || "").split(",").map((s) => s.trim()).filter((s) => s.startsWith("DNS:")).map((s) => s.slice(4).toLowerCase());
    if (!san.length) return null;
    const im = (x.issuer || "").match(/O=([^\n]+)/);
    return { domain: san[0].replace(/^\*\./, "").replace(/^www\./, ""), ca: im ? im[1].trim().replace(/^"|"$/g, "") : "" };
  } catch { return null; }
}

export async function GET() {
  const loglar = await loglariSec();
  let tarandi = 0, yeni = 0, ctEvren = 0;
  const PENCERE = 256; // her log turunda taranan sertifika (get-entries tek istek)
  await Promise.all(
    loglar.map(async (log) => {
      try {
        const sth = (await (await fetch(`${log.url}/ct/v1/get-sth`, { signal: AbortSignal.timeout(7000) })).json()) as { tree_size?: number };
        const toplam = sth.tree_size || 0;
        ctEvren += toplam; // "Taranan Sertifika" = izlenen CT loglarındaki TOPLAM sertifika evreni (milyonlar)
        if (toplam < PENCERE + 10) return;
        // Rastgele kaydırılmış pencere (son ~50k içinde) → her tur farklı dilim tara, birikim hızlansın.
        const geri = PENCERE + Math.floor(Math.random() * Math.min(50000, toplam - PENCERE - 1));
        const start = Math.max(0, toplam - geri), end = start + PENCERE - 1;
        const ent = (await (await fetch(`${log.url}/ct/v1/get-entries?start=${start}&end=${end}`, { signal: AbortSignal.timeout(10000) })).json()) as { entries?: { leaf_input: string; extra_data?: string }[] };
        for (const e of ent.entries || []) {
          tarandi++;
          const der = derCoz(e.leaf_input, e.extra_data);
          if (!der || !derBahisAdayi(der)) continue;  // UCUZ ön-filtre → çoğu sertifikayı parse etmeden ele
          const b = parseDomain(der);
          if (!b || !bahisOnFiltre(b.domain)) continue;
          const im = bahisImzasi(b.domain);
          if (!im.bahisMi) continue;
          if (!YAKALANAN.has(b.domain)) {
            yeni++;
            YAKALANAN.set(b.domain, { domain: b.domain, ca: b.ca, zaman: Date.now(), guven: im.guven, isaretler: im.isaretler, tld: b.domain.split(".").pop() || "", trHedefli: im.trHedefli, usomda: null, engelli: null, marka: im.marka });
          }
        }
      } catch { /* bu log turu atla */ }
    })
  );
  // Birikimi sınırla (bellek)
  if (YAKALANAN.size > 800) {
    const eskiler = [...YAKALANAN.values()].sort((a, b) => a.zaman - b.zaman).slice(0, YAKALANAN.size - 800);
    for (const e of eskiler) YAKALANAN.delete(e.domain);
  }

  // KALICI KAYNAK = Firestore (deploy/cold-start sıfırlamaz). ~15sn önbellekle oku, bu-örneğin
  // taze in-memory yakalamalarıyla BİRLEŞTİR (domain'e göre dedup). Böylece worker 7/24 beslerken
  // ekranlar hep dolu; worker yoksa da app-CT örnekleyici kalıcı besler.
  const kalici = await firestoreOku();
  const birlesik = new Map<string, Yakalanan>();
  for (const b of kalici) birlesik.set(b.domain, { domain: b.domain, ca: b.ca || "", zaman: b.zaman, guven: b.guven, isaretler: b.isaretler || [], tld: b.tld || (b.domain.split(".").pop() || ""), trHedefli: !!b.trHedefli, usomda: b.usomda ?? null, engelli: b.engelli ?? null, marka: b.marka ?? null });
  for (const y of YAKALANAN.values()) if (!birlesik.has(y.domain)) birlesik.set(y.domain, y);

  // KOTA KORUMASI (Spark plan ~20k yazma/gün): tüm bunlar en fazla 60 SANİYEDE BİR yapılır,
  // ve yalnız DEĞERLİ (TR-hedefli/marka/yüksek-güven) kayıtlar yazılır. Yabancı jenerik casino
  // gürültüsü Firestore'a hiç yazılmaz → kota korunur, feed sadeleşir.
  if (Date.now() - sonResolve > 60000) {
    sonResolve = Date.now();
    // (1) Taze DEĞERLİ yakalamaları bir kez yaz (korpusa girsin).
    for (const y of YAKALANAN.values()) {
      if (yazilanlar.has(y.domain)) continue;
      yazilanlar.add(y.domain);
      if (!degerliMi(y)) continue; // gürültü → yazma
      bahisAdayKaydet({ domain: y.domain, guven: y.guven, marka: y.marka, trHedefli: y.trHedefli, usomda: y.usomda, engelli: y.engelli, ca: y.ca, tld: y.tld, isaretler: y.isaretler, zaman: y.zaman, kaynak: "app-ct" }).catch(() => {});
    }
    // (2) ÇÖZÜMLEME — korpusta usomda/engelli hâlâ null olan DEĞERLİ kayıtları çöz (tur başına ≤8).
    const cozulecek = [...birlesik.values()]
      .filter((y) => (y.usomda === null || y.engelli === null) && degerliMi(y))
      .sort((a, b) => Number(b.trHedefli) - Number(a.trHedefli) || b.zaman - a.zaman)
      .slice(0, 8);
    await Promise.all(cozulecek.map(async (y) => {
      const [u, e] = await Promise.all([
        y.usomda === null ? usomBiliniyor(y.domain) : Promise.resolve(y.usomda),
        y.engelli === null ? btkEngelli(y.domain) : Promise.resolve(y.engelli),
      ]);
      y.usomda = u; y.engelli = e;
      const m = YAKALANAN.get(y.domain); if (m) { m.usomda = u; m.engelli = e; }
      bahisAdayKaydet({ domain: y.domain, guven: y.guven, marka: y.marka, trHedefli: y.trHedefli, usomda: u, engelli: e, ca: y.ca, tld: y.tld, isaretler: y.isaretler, zaman: y.zaman }).catch(() => {});
    }));
  }

  // BİZ-ÖNCE = USOM'da yok VE BTK-engelli değil (zaten engelli olanı biz-önce sayma).
  const bizOnceMi = (y: Yakalanan) => y.usomda === false && y.engelli !== true;
  const puan = (y: Yakalanan) => (bizOnceMi(y) ? 4 : 0) + (y.trHedefli ? 2 : 0) - (y.engelli === true ? 3 : 0);
  const hepsi = [...birlesik.values()];
  const liste = hepsi.sort((a, b) => puan(b) - puan(a) || b.zaman - a.zaman).slice(0, 200);
  const bizOnce = hepsi.filter(bizOnceMi).length;
  const engelliSayi = hepsi.filter((y) => y.engelli === true).length;
  const trSayi = hepsi.filter((y) => y.trHedefli).length;
  const markaVar = hepsi.filter((y) => y.marka).length;
  const sayac = new Map<string, { sayi: number; son: number; bizOnce: number }>();
  for (const y of hepsi) {
    if (!y.marka) continue;
    const s = sayac.get(y.marka) || { sayi: 0, son: 0, bizOnce: 0 };
    s.sayi++; s.son = Math.max(s.son, y.zaman); if (bizOnceMi(y)) s.bizOnce++;
    sayac.set(y.marka, s);
  }
  const markaDagilim = [...sayac.entries()].map(([marka, s]) => ({ marka, ...s })).sort((a, b) => b.sayi - a.sayi).slice(0, 20);
  // Sayaçlar = koleksiyonun GERÇEK count'ları (örnek yedek). "Taranan Sertifika" = CT evreni (tree_size toplamı).
  const k = await kpiSayilar();
  return NextResponse.json({
    ok: true,
    tarandi: ctEvren || tarandi,
    yeni,
    toplam: Math.max(k.toplam, hepsi.length),
    bizOnce: Math.max(k.usomYok, bizOnce),
    engelliSayi,
    trSayi: Math.max(k.tr, trSayi),
    markaVar: Math.max(k.marka, markaVar),
    markaDagilim,
    liste,
  });
}
