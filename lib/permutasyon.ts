// Bir markanın domaininden, göz-aldatan/taklit domain VARYASYONLARI üretir
// (dnstwist mantığı). Üretim saf kod (hızlı, dış çağrı yok); üretilenlerin
// hangisinin GERÇEKTEN kayıtlı/canlı olduğu ayrı adımda DNS ile kontrol edilir.

const KLAVYE: Record<string, string> = {
  a: "qsz", b: "vghn", c: "xdfv", d: "serfcx", e: "wrsdf", f: "drtgcv", g: "ftyhbv",
  h: "gyujbn", i: "ujko", j: "huikmn", k: "jiolm", l: "kop", m: "njk", n: "bhjm",
  o: "iklp", p: "ol", q: "wa", r: "edft", s: "awedxz", t: "rfgy", u: "yhji",
  v: "cfgb", w: "qase", x: "zsdc", y: "tghu", z: "asx",
};
const HOMO: Record<string, string[]> = {
  a: ["4"], e: ["3"], i: ["1", "l"], o: ["0"], s: ["5"], g: ["9"], b: ["8"], t: ["7"], l: ["1"],
};
const EKLER = ["-giris", "-guvenlik", "-destek", "-online", "-login", "-tr", "-hesap", "-mobil", "-guvenli", "-resmi", "-app"];
const TLDLER = ["com", "net", "org", "online", "xyz", "site", "info", "tr", "com.tr", "co"];

export function permutasyonlar(domain: string): string[] {
  const parts = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split(".");
  const label = parts[0];
  const suffix = parts.slice(1).join(".") || "com";
  if (label.length < 3) return [];

  const set = new Set<string>();
  const ekle = (l: string, s = suffix) => {
    if (l && l.length >= 3 && /^[a-z0-9-]+$/.test(l) && !(l === label && s === suffix)) set.add(`${l}.${s}`);
  };

  // 1) harf düşürme
  for (let i = 0; i < label.length; i++) ekle(label.slice(0, i) + label.slice(i + 1));
  // 2) harf ikizleme
  for (let i = 0; i < label.length; i++) ekle(label.slice(0, i) + label[i] + label.slice(i));
  // 3) komşu harf yer değiştirme
  for (let i = 0; i < label.length - 1; i++) {
    const a = label.split("");
    [a[i], a[i + 1]] = [a[i + 1], a[i]];
    ekle(a.join(""));
  }
  // 4) klavye komşusu ile değişim
  for (let i = 0; i < label.length; i++) for (const c of KLAVYE[label[i]] || "") ekle(label.slice(0, i) + c + label.slice(i + 1));
  // 5) homoglyph (göz aldatan)
  for (let i = 0; i < label.length; i++) for (const c of HOMO[label[i]] || []) ekle(label.slice(0, i) + c + label.slice(i + 1));
  // 6) combosquat (ek kelime)
  for (const e of EKLER) { ekle(label + e); ekle(e.slice(1) + "-" + label); }
  // 7) uzantı değişimi
  for (const t of TLDLER) ekle(label, t);
  // 8) combosquat + yaygın uzantı
  for (const e of ["-giris", "-guvenlik", "-tr"]) for (const t of ["com", "net", "com.tr"]) ekle(label + e, t);

  return [...set].slice(0, 140); // serverless süresi için sınırla
}
