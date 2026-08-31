// Açık kaynak tehdit listelerinden tohum verisi üretir (anahtarsız):
//  1) Phishing.Database (oltalama domainleri)
//  2) URLhaus / abuse.ch (güncel zararlı URL'ler → host)
// Çıktı: public/seed-links.json — Sorgula "bilinen zararlı" olarak kullanır.
import { writeFileSync } from "node:fs";
import path from "node:path";

const HEDEF = 25000;

function host(u) {
  try {
    return new URL(u.includes("://") ? u : "http://" + u).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

const set = new Set();

// 1) Phishing domain listesi (yayılmış örnek)
try {
  const t = await (await fetch(
    "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt"
  )).text();
  const tum = t.split("\n").map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s));
  const adim = Math.max(1, Math.floor(tum.length / 12000));
  for (let i = 0; i < tum.length && set.size < 12000; i += adim) set.add(tum[i]);
  console.log(`Phishing.Database: ${tum.length} -> eklendi (toplam ${set.size})`);
} catch (e) {
  console.log("Phishing.Database alınamadı:", e.message);
}

// 2) URLhaus güncel zararlı URL'ler
try {
  const t = await (await fetch("https://urlhaus.abuse.ch/downloads/text_recent/")).text();
  let n = 0;
  for (const line of t.split("\n")) {
    if (!line.startsWith("http")) continue;
    const h = host(line);
    if (h && !set.has(h)) { set.add(h); n++; }
    if (set.size >= HEDEF) break;
  }
  console.log(`URLhaus: ${n} host eklendi (toplam ${set.size})`);
} catch (e) {
  console.log("URLhaus alınamadı:", e.message);
}

const kayitlar = [...set].slice(0, HEDEF).map((d) => ({
  deger: d,
  tip: "url",
  kategori: "Zararlı / tehdit listesi",
  kaynak: "acik-tehdit-listesi",
}));

const out = path.resolve("public", "seed-links.json");
writeFileSync(out, JSON.stringify(kayitlar));
console.log(`\nToplam ${kayitlar.length} tohum yazıldı -> ${out}`);
