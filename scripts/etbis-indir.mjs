// ETBİS TAM SİCİL İNDİRİCİ — Ticaret Bakanlığı e-ticaret sicilindeki TÜM kayıtlı
// siteleri (grid'in tamamını) sayfa sayfa indirir. Tek seferlik/periyodik veri toplama
// işi (Vercel'de DEĞİL — yerelde çalışır). Kibar hız + yeniden-başlatılabilir checkpoint.
//
// Çıktı: data/etbis-siteler.jsonl  (satır başına 1 kayıt: {unvan,url,domain,mobil,dogrulanmis,siteId})
//        data/etbis-cek-durum.json (checkpoint: {sonSayfa,toplam,guncelleme})
// Çalıştır:  node scripts/etbis-indir.mjs           (kaldığı yerden devam)
//            node scripts/etbis-indir.mjs --bastan   (sıfırdan)
//
// NOT: Bu, ETBİS'in herkese açık "Kayıtlı Site Sorgula" grid'inin dökümüdür. Resmî bir
// toplu-indirme/API sunulmadığı için sayfalı grid taranır — bu yüzden HIZ KİBAR tutulur
// (~350ms/sayfa + jitter, ~40 dk). Veri kamuya açık; amaç anti-dolandırıcılık beyaz-listesi.

import { writeFile, readFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const KOK = "https://etbis.ticaret.gov.tr/tr/SiteSorgulama";
const VERI = path.resolve("data");
const JSONL = path.join(VERI, "etbis-siteler.jsonl");
const DURUM = path.join(VERI, "etbis-cek-durum.json");
const UA = "Mozilla/5.0 (compatible; MirLeonBot/1.0; anti-phishing beyaz-liste)";
const BEKLE = 350;          // sayfa arası temel gecikme (ms) — kibar
const JITTER = 250;         // + rastgele 0..250ms
const MAX_SAYFA = 6300;     // güvenlik tavanı (5961 beklenir)
const YENIDEN = 4;          // sayfa başına deneme

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const bastan = process.argv.includes("--bastan");

function coz(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ""; } })
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}
function host(u) {
  const s = String(u || "").trim();
  try { return new URL(s.startsWith("http") ? s : "http://" + s).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return s.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].toLowerCase(); }
}
function toplamKayit(html) { const m = html.match(/([\d.]+)\s*Kay/i); return m ? Number(m[1].replace(/\./g, "")) : 0; }

function ayristir(html) {
  const out = [];
  const satirlar = html.split(/<tr[\s>]/i).slice(1);
  for (const satir of satirlar) {
    const spanlar = [...satir.matchAll(/opacity-70">([\s\S]*?)<\/span>/g)].map((m) => coz(m[1]));
    const sid = satir.match(/siteId=([0-9a-fA-F-]{36})/);
    if (!sid || spanlar.length < 2 || !spanlar[1]) continue;
    out.push({
      unvan: spanlar[0],
      url: spanlar[1],
      domain: host(spanlar[1]),
      mobil: spanlar[2] || "",
      dogrulanmis: /\/img\/verified\.png/.test(satir),
      siteId: sid[1],
    });
  }
  return out;
}

async function sayfaCek(pg) {
  const url = `${KOK}?page=${pg}&url=&cityId=&districtId=&sector=&isItCrossBorder=`;
  for (let d = 1; d <= YENIDEN; d++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const html = await r.text();
      return { rows: ayristir(html), toplam: toplamKayit(html) };
    } catch (e) {
      if (d === YENIDEN) throw e;
      await bekle(1500 * d); // backoff
    }
  }
}

async function main() {
  if (!existsSync(VERI)) await mkdir(VERI, { recursive: true });
  let basSayfa = 1, toplamYazilan = 0;
  const gorulen = new Set();

  if (!bastan && existsSync(DURUM)) {
    try {
      const d = JSON.parse(await readFile(DURUM, "utf8"));
      basSayfa = (d.sonSayfa || 0) + 1;
      toplamYazilan = d.toplamYazilan || 0;
      console.log(`Devam: sayfa ${basSayfa}'den (${toplamYazilan} kayıt yazılmış).`);
    } catch { /* bozuk checkpoint → baştan */ }
  }
  if (bastan || basSayfa === 1) { await writeFile(JSONL, ""); toplamYazilan = 0; }

  let beklenenToplam = 0;
  for (let pg = basSayfa; pg <= MAX_SAYFA; pg++) {
    let res;
    // Sayfa düzeyinde de dayanıklı ol: geçici ağ kesintisinde (fetch failed) pes etme,
    // gitgide artan bekleyişle birkaç kez daha dene; ancak sürekli hata varsa checkpoint'te dur.
    for (let sd = 1; ; sd++) {
      try { res = await sayfaCek(pg); break; }
      catch (e) {
        if (sd > 6) { console.error(`sayfa ${pg} kalıcı BAŞARISIZ (${e.message}) — checkpoint'te durdu, tekrar çalıştır.`); return; }
        console.error(`sayfa ${pg} geçici hata (${e.message}), ${sd}. bekleme...`);
        await bekle(15000 * sd);
      }
    }
    if (pg === 1 || !beklenenToplam) beklenenToplam = res.toplam || beklenenToplam;
    if (!res.rows.length) { console.log(`sayfa ${pg} boş → bitti.`); break; }

    let satir = "";
    for (const k of res.rows) { if (gorulen.has(k.siteId)) continue; gorulen.add(k.siteId); satir += JSON.stringify(k) + "\n"; toplamYazilan++; }
    if (satir) await appendFile(JSONL, satir);
    await writeFile(DURUM, JSON.stringify({ sonSayfa: pg, toplamYazilan, beklenenToplam, guncelleme: new Date().toISOString() }));

    if (pg % 50 === 0 || pg === basSayfa) {
      const yuzde = beklenenToplam ? ((toplamYazilan / beklenenToplam) * 100).toFixed(1) : "?";
      console.log(`sayfa ${pg}/~${Math.ceil(beklenenToplam / 10) || "?"} · ${toplamYazilan}/${beklenenToplam || "?"} kayıt (%${yuzde})`);
    }
    await bekle(BEKLE + Math.random() * JITTER);
  }
  console.log(`\nBİTTİ: ${toplamYazilan} kayıt → ${JSONL}`);
}

main().catch((e) => { console.error("HATA:", e); process.exit(1); });
