// Karanlık pano ekranlarındaki sabit hex renklerinden algoritmik AÇIK tema üretir.
// Her hex → --c-<hex> CSS değişkeni; .pano (koyu) + .pano[data-tema="light"] (açık).
// Dönüşüm: rolü ışıklık+doygunluktan tahmin et → nötr yapıyı ters çevir, koyu tint'i
// aç, açık-renk metni koyulaştır, aksanı koru. Sonuç görsel testte elle ince ayarlanır.
import fs from "fs";
import path from "path";

const DOSYALAR = ["app/mercek/page.tsx", "app/mercek/AnalitikPanel.tsx", "app/kontrol/page.tsx", "app/canli/page.tsx"];
const KOK = process.cwd();

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHex(r, g, b) { const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); return "#" + c(r) + c(g) + c(b); }
function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
function hslRgb(h, s, l) {
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q;
  const t = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [t(h + 1 / 3) * 255, t(h) * 255, t(h - 1 / 3) * 255];
}

function mixL(t, a, b) { return rgbHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); }
function aksan(h, L) { const [r, g, b] = hslRgb(h, 0.72, L); return rgbHex(r, g, b); }   // beyazda okunur doygun renk
function tint(h) { const [r, g, b] = hslRgb(h, 0.55, 0.93); return rgbHex(r, g, b); }    // açık pastel tint

// Bir koyu-tema hex'ini rolüne göre AÇIK-tema karşılığına çevir.
function acikVaryant(hex) {
  const [r, g, b] = hexRgb(hex);
  const [h, s, l] = rgbHsl(r, g, b);
  const H = h * 360, L = l, K = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  const maviGri = H >= 195 && H <= 235;
  // NÖTR / mavi-gri YAPI (zemin, iç yüzey, kenar, gri metin). Renkli-ama-soluk (kırmızı/yeşil
  // tint) hue'lar buraya DÜŞMESİN diye salt-akromatik eşik K<0.06.
  if ((K < 0.30 && maviGri) || K < 0.06) {
    if (L <= 0.125) return mixL(L / 0.125, [236, 239, 246], [255, 255, 255]); // zemin: koyu→page grisi, açık→beyaz (yükseklik KORUNUR)
    if (L < 0.155) return "#eef2f8";  // iç yüzey / input (hafif gri)
    if (L < 0.42) return "#dbe3ee";   // kenar / ayraç (açık gri çizgi)
    if (L < 0.58) return "#6f7f93";   // soluk metin (orta-koyu gri)
    if (L < 0.78) return "#48586e";   // ikincil metin
    return "#0f1b2e";                 // parlak / ana metin (koyu)
  }
  // RENKLİ (aksan / tint / renkli-metin) — hue korunur
  if (L < 0.28) return tint(h);                               // koyu tint zemin → açık tint
  const hedefL = L > 0.74 ? 0.44 : Math.max(0.36, L - 0.12);  // açık renkli metin ya da aksan → beyazda okunur
  return aksan(h, hedefL);
}

// Tüm dosyalardan farklı hex'leri topla
const set = new Set();
for (const rel of DOSYALAR) {
  const src = fs.readFileSync(path.join(KOK, rel), "utf8");
  for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) set.add(m[0].toLowerCase());
}
const renkler = [...set].sort();

// CSS üret
let koyu = "", acik = "";
for (const hx of renkler) {
  const ad = "--c-" + hx.slice(1);
  koyu += `${ad}:${hx};`;
  acik += `${ad}:${acikVaryant(hx)};`;
}
const css = `\n/* ══ PANO TEMASI — otomatik üretildi (scripts/tema-uret.mjs) ══ */\n.pano{${koyu}}\n.pano[data-tema="light"]{${acik}}\n`;

const CIKTI = process.argv[2] === "--yaz";
if (CIKTI) {
  // 1) globals.css'e tema bloğunu ekle/güncelle
  const gp = path.join(KOK, "app/globals.css");
  let g = fs.readFileSync(gp, "utf8");
  g = g.replace(/\n\/\* ══ PANO TEMASI[\s\S]*?\.pano\[data-tema="light"\]\{[^}]*\}\n/g, "\n");
  fs.writeFileSync(gp, g.trimEnd() + "\n" + css);
  // 2) dosyalarda hex → var(--c-hex)
  for (const rel of DOSYALAR) {
    const p = path.join(KOK, rel);
    let src = fs.readFileSync(p, "utf8");
    src = src.replace(/#[0-9a-fA-F]{6}\b/g, (m) => `var(--c-${m.slice(1).toLowerCase()})`);
    fs.writeFileSync(p, src);
  }
  console.log(`YAZILDI: ${renkler.length} renk değişkeni + ${DOSYALAR.length} dosya dönüştürüldü.`);
} else {
  // kuru çalıştırma: üretilen açık paleti göster (rol tahminiyle)
  console.log(`${renkler.length} farklı renk. Örnek açık-varyant eşlemeleri:\n`);
  const örnek = ["#080f1a","#0b1726","#12202e","#17293c","#1f3652","#e6eef7","#8fa6bd","#5b6b7d","#4d9fe0","#3ba1ff","#f5222d","#ff9aa4","#3ee08a","#faad14","#8b7de0","#2a0d13","#0e2f1e","#0d2540"];
  for (const hx of örnek) if (set.has(hx)) console.log(`  ${hx}  →  ${acikVaryant(hx)}`);
}
