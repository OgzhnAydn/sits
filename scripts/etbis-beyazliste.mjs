// ETBİS beyaz-liste üretici — indirilen ham kayıtlardan (data/etbis-siteler.jsonl)
// uygulamanın ANINDA (canlı sorgu YOK) kullanacağı domain kümesini üretir.
// Çalıştır (indirme bittikten sonra): node scripts/etbis-beyazliste.mjs
//
// Çıktı: lib/etbisData.json = { guncelleme, toplam, dogrulanmisSayi, domainler:[...], dogrulanmisDomainler:[...] }
//   • domainler: kayıtlı TÜM host'lar + registrable (eTLD+1) türevleri (alt-alan/yol ayıklanır)
//   • dogrulanmisDomainler: karekod-doğrulanmış olanlar (daha güçlü meşruiyet)

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const JSONL = path.resolve("data/etbis-siteler.jsonl");
const CIKTI = path.resolve("lib/etbisData.json");

// Basit registrable-domain (eTLD+1). Türkiye 2-seviye uzantıları (com.tr, gov.tr...) dahil.
const IKI_SEVIYE = new Set(["com.tr", "net.tr", "org.tr", "gov.tr", "edu.tr", "bel.tr", "pol.tr", "k12.tr", "av.tr", "web.tr", "gen.tr", "biz.tr", "info.tr", "tv.tr", "co.uk", "org.uk", "com.co"]);
function registrable(hostRaw) {
  const host = String(hostRaw || "").toLowerCase().replace(/^www\./, "").split(/[/?#:]/)[0];
  const p = host.split(".").filter(Boolean);
  if (p.length <= 2) return host;
  const son2 = p.slice(-2).join(".");
  if (IKI_SEVIYE.has(son2)) return p.slice(-3).join(".");
  return son2;
}

const lines = (await readFile(JSONL, "utf8")).split("\n").filter(Boolean);
const tum = new Set(), dogr = new Set();
let toplam = 0, dogrSay = 0;
for (const l of lines) {
  let k; try { k = JSON.parse(l); } catch { continue; }
  const d = String(k.domain || "").toLowerCase().replace(/^www\./, "").split(/[/?#:]/)[0];
  if (!d || !d.includes(".")) continue;
  toplam++;
  const reg = registrable(d);
  tum.add(d); tum.add(reg);
  if (k.dogrulanmis) { dogr.add(d); dogr.add(reg); dogrSay++; }
}

const domainler = [...tum].sort();
const dogrulanmisDomainler = [...dogr].sort();
await writeFile(CIKTI, JSON.stringify({
  guncelleme: new Date().toISOString(),
  kaynak: "ETBİS · etbis.ticaret.gov.tr/tr/SiteSorgulama",
  toplamKayit: toplam,
  dogrulanmisKayit: dogrSay,
  benzersizDomain: domainler.length,
  domainler,
  dogrulanmisDomainler,
}));
console.log(`Beyaz-liste: ${toplam} kayıt → ${domainler.length} benzersiz domain (${dogrulanmisDomainler.length} doğrulanmış) → ${CIKTI}`);
