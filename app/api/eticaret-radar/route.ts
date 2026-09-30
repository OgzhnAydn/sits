import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { eticaretTR } from "@/lib/eticaretTespit";
import { gorselSinifla } from "@/lib/siteSinifla";
import { eticaretAdayKaydet, eticaretAdaylariGetir, eticaretAdaySayisi, eticaretAdaySayisiKosul, type EticaretAday } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

// KAYIT DIŞI E-TİCARET RADARI (Ticaret Bakanlığı) — Certificate Transparency akışından yeni
// yayınlanan sertifikaları örnekler; TÜRKİYE'ye e-ticaret işareti taşıyan adayları eticaretTR()
// ile analiz eder ve ETBİS'te KAYITLI OLMAYAN'ları biriktirir. "Hepsini" değil (imkânsız) —
// AKIŞTAN yakaladıklarımız, doğdukları an. Motor siteyi FETCH ettiği için tur başına sınırlı
// sayıda (≤ANALIZ_TUR) analiz yapılır — dürüst "örnekleme radarı".

type Log = { url: string };
type Aday = { domain: string; ca: string; zaman: number; oncelik: boolean };

let LOGLAR: Log[] | null = null;
let LOG_T = 0;
const KUYRUK = new Map<string, Aday>();       // analiz bekleyen TR e-ticaret adayları (in-memory)
const GORULEN = new Set<string>();            // analiz edilmiş (tekrar analiz yok) — kayıtlı/e-ticaret-değil dahil
const ANALIZ_TUR = 6;                         // tur başına en fazla site FETCH+içerik analiz (süre bütçesi)
const GORSEL_TUR = 3;                          // tur başına en fazla GÖRSEL doğrulama (Gemini Vision maliyeti)

// Firestore okuma önbelleği (~15sn) — poll başına okuma maliyetini kıs.
let fsCache: { v: EticaretAday[]; t: number } = { v: [], t: 0 };
async function firestoreOku(): Promise<EticaretAday[]> {
  if (Date.now() - fsCache.t < 15000) return fsCache.v;
  try { const v = await eticaretAdaylariGetir(400); fsCache = { v, t: Date.now() }; return v; } catch { return fsCache.v; }
}
// KPI = koleksiyonun GERÇEK sayıları (count aggregation), okunan örneğe bağlı değil. 30sn önbellek.
let kpiCache = { t: 0, toplam: 0, dogrulanmis: 0, son24: 0 };
async function kpiSayilar(kalici: EticaretAday[]) {
  if (Date.now() - kpiCache.t < 30000) return kpiCache;
  try {
    const [toplam, dogrulanmis] = await Promise.all([
      eticaretAdaySayisi(),
      eticaretAdaySayisiKosul("etbisDogrulanmis", "==", false),
    ]);
    const gun = Date.now() - 86_400_000;
    const son24 = kalici.filter((a) => (a.zaman || 0) > gun).length;
    kpiCache = { t: Date.now(), toplam, dogrulanmis, son24 };
  } catch { /* önceki cache */ }
  return kpiCache;
}

async function loglariSec(): Promise<Log[]> {
  if (LOGLAR && Date.now() - LOG_T < 3_600_000) return LOGLAR;
  try {
    const j = (await (await fetch("https://www.gstatic.com/ct/log_list/v3/log_list.json", { signal: AbortSignal.timeout(8000) })).json()) as {
      operators?: { logs?: { url: string; state?: Record<string, unknown>; temporal_interval?: { start_inclusive: string; end_exclusive: string } }[] }[];
    };
    const now = Date.now(), yil = new Date().getFullYear();
    const secili: Log[] = [];
    for (const op of j.operators || []) for (const l of op.logs || []) {
      if (!l.state || !("usable" in l.state)) continue;
      const ti = l.temporal_interval;
      if (ti) { const bas = new Date(ti.start_inclusive).getTime(), bit = new Date(ti.end_exclusive).getTime(); if (now < bas || now > bit) continue; }
      const url = l.url.replace(/\/$/, "");
      if (String(l.url).includes(String(yil)) || String(l.url).includes(String(yil + 1))) secili.push({ url });
    }
    LOGLAR = secili.length ? secili.slice(0, 6) : [{ url: "https://ct.googleapis.com/logs/us1/argon2026h2" }];
    LOG_T = now;
  } catch {
    LOGLAR = [{ url: "https://ct.googleapis.com/logs/us1/argon2026h2" }];
    LOG_T = Date.now();
  }
  return LOGLAR;
}

function derCoz(leafInput: string, extraData?: string): Buffer | null {
  let leaf: Buffer;
  try { leaf = Buffer.from(leafInput, "base64"); } catch { return null; }
  if (leaf.length < 15) return null;
  const tip = leaf.readUInt16BE(10);
  if (tip === 0) { const len = (leaf[12] << 16) | (leaf[13] << 8) | leaf[14]; return leaf.subarray(15, 15 + len); }
  if (tip === 1) { let ed: Buffer; try { ed = Buffer.from(extraData || "", "base64"); } catch { return null; } if (ed.length < 3) return null; const len = (ed[0] << 16) | (ed[1] << 8) | ed[2]; return ed.subarray(3, 3 + len); }
  return null;
}
// UCUZ DER-BAYT ÖN-FİLTRESİ: X509 parse pahalı. Önce ham baytlarda TR e-ticaret işareti var mı bak
// (.tr uzantısı veya Türkçe mağaza/alışveriş kelimesi) → yalnız eşleşeni parse et.
function derTRAdayi(der: Buffer): boolean {
  const s = der.toString("latin1").toLowerCase();
  return /\.com\.tr|\.tr[^a-z]|ma[gğ]aza|butik|\bmoda\b|market|al[ıi][şs]veri[şs]|sat[ıi][şs]|indirim|outlet|kozmetik|giyim|tekstil|tica ?ret|kampanya|\bshop\b|\bstore\b/.test(s);
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
  let tarandi = 0, kuyrukYeni = 0, ctEvren = 0;
  const PENCERE = 256;
  // 1) UCUZ FAZ: CT'yi örnekle, TR e-ticaret adaylarını analiz kuyruğuna koy (fetch YOK).
  await Promise.all(
    loglar.map(async (log) => {
      try {
        const sth = (await (await fetch(`${log.url}/ct/v1/get-sth`, { signal: AbortSignal.timeout(7000) })).json()) as { tree_size?: number };
        const toplam = sth.tree_size || 0;
        ctEvren += toplam;
        if (toplam < PENCERE + 10) return;
        const geri = PENCERE + Math.floor(Math.random() * Math.min(50000, toplam - PENCERE - 1));
        const start = Math.max(0, toplam - geri), end = start + PENCERE - 1;
        const ent = (await (await fetch(`${log.url}/ct/v1/get-entries?start=${start}&end=${end}`, { signal: AbortSignal.timeout(10000) })).json()) as { entries?: { leaf_input: string; extra_data?: string }[] };
        for (const e of ent.entries || []) {
          tarandi++;
          const der = derCoz(e.leaf_input, e.extra_data);
          if (!der) continue;
          // KARAR domainden DEĞİL içerikten verilir; ama HANGİ certi ziyaret edeceğimizi seçerken
          // ipuçlu olanı (derTRAdayi) önceliklendiririz + anahtarsız Türk mağazalarını da yakalamak için
          // rastgele bir pay (~%3) örnekleriz (içerik-öncelikli kapsama). Nihai hüküm eticaretTR'de (içerik).
          const oncelik = derTRAdayi(der);
          if (!oncelik && Math.random() > 0.03) continue;
          const b = parseDomain(der);
          if (!b || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(b.domain)) continue;
          if (GORULEN.has(b.domain) || KUYRUK.has(b.domain)) continue;
          KUYRUK.set(b.domain, { domain: b.domain, ca: b.ca, zaman: Date.now(), oncelik });
          kuyrukYeni++;
        }
      } catch { /* bu log turu atla */ }
    })
  );
  if (KUYRUK.size > 400) { const eskiler = [...KUYRUK.values()].sort((a, b) => a.zaman - b.zaman).slice(0, KUYRUK.size - 400); for (const e of eskiler) KUYRUK.delete(e.domain); }

  // 2) PAHALI FAZ: kuyruktan ≤ANALIZ_TUR domaini İÇERİKTEN analiz et (eticaretTR siteyi FETCH edip
  // içerikten karar verir — domain adı hükme girmez). KAYITSIZ e-ticaret çıkanlara ayrıca GÖRSEL
  // doğrulama (Gemini Vision, ≤GORSEL_TUR) → "gözle" onay + kategori + ne sattığı.
  let analizEdildi = 0, kayitsizBulundu = 0, gorselYapildi = 0;
  const sira = [...KUYRUK.values()].sort((x, y) => Number(y.oncelik) - Number(x.oncelik)).slice(0, ANALIZ_TUR);
  await Promise.all(sira.map(async (a) => {
    KUYRUK.delete(a.domain);
    GORULEN.add(a.domain);
    analizEdildi++;
    try {
      const s = await eticaretTR(a.domain);
      if (s.eticaret && s.sonuc === "kayitsiz-eticaret-aday") {
        kayitsizBulundu++;
        // GÖRSEL DOĞRULAMA — tur başına sınırlı (Gemini + urlscan maliyeti). Farkımız: içerik yetmez, GÖRÜRÜZ.
        let g: Awaited<ReturnType<typeof gorselSinifla>> | null = null;
        if (gorselYapildi < GORSEL_TUR) { gorselYapildi++; try { g = await gorselSinifla(a.domain); } catch { /* görsel opsiyonel */ } }
        await eticaretAdayKaydet({
          domain: a.domain, guven: s.guven, sonuc: s.sonuc, etbisKayitli: s.etbisKayitli,
          etbisDogrulanmis: s.etbisDogrulanmis, platform: s.platform ?? null,
          odemeGecitleri: s.odemeGecitleri || [], sinyaller: s.sinyaller || [],
          gorselAlisveris: g?.yapildi ? g.alisveris : null, kategori: g?.kategori || undefined,
          satilan: g?.satilan || undefined, gorselNot: g?.not || undefined, ekranUrl: g?.ekranUrl,
          ca: a.ca, zaman: a.zaman, kaynak: "app-ct",
        });
      }
    } catch { /* tek domain başarısız → diğerlerini etkileme */ }
  }));
  if (GORULEN.size > 5000) { const arr = [...GORULEN]; GORULEN.clear(); for (const d of arr.slice(-2000)) GORULEN.add(d); }

  // 3) SERVİS: kalıcı korpus (Firestore) + KPI'lar. Liste en yeni önce.
  const kalici = await firestoreOku();
  const kpi = await kpiSayilar(kalici);
  const liste = kalici.slice(0, 120).map((a) => ({
    domain: a.domain, guven: a.guven, platform: a.platform, odemeGecitleri: a.odemeGecitleri || [],
    sinyaller: (a.sinyaller || []).slice(0, 4), etbisKayitli: a.etbisKayitli, etbisDogrulanmis: a.etbisDogrulanmis ?? null, zaman: a.zaman,
    gorselAlisveris: a.gorselAlisveris ?? null, kategori: a.kategori || null, satilan: a.satilan || null, gorselNot: a.gorselNot || null, ekranUrl: a.ekranUrl || null,
  }));
  return NextResponse.json({
    ctEvren, tarandi, kuyruk: KUYRUK.size, kuyrukYeni, analizEdildi, kayitsizBulundu, gorselYapildi,
    kpi, liste,
  }, { headers: { "Cache-Control": "no-store" } });
}
