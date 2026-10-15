// PROAKTİF TYPOSQUAT ÜRETİCİ — bir markanın saldırganlarca kaydedilmesi OLASI sahte varyantlarını
// üretir (dnstwist mantığı, odaklı). Amaç: adresi sertifika/tarama BEKLEMEDEN, kayıt/çözülme anında
// yakalamak (sıfır-kaçırma + anlık). Üretilenler DNS'te çözülüyorsa (= kayıtlı) aday hattına yazılır.
import { resmiListedeMi, type KorunanMarka } from "./korunanMarkalar";

// Marka adıyla sahte kaydedilen domainlerde en sık görülen uzantılar (riskli TLD + yaygın).
const TLDLER = ["com", "net", "xyz", "online", "shop", "site", "live", "vip", "sbs", "cfd", "top", "click", "info", "app"];
// Phishing domainlerinde markanın yanına eklenen tuzak kelimeler (TR + jenerik).
const PHISH = ["giris", "login", "destek", "basvuru", "guncelleme", "mobil", "online", "hesap", "dogrulama", "guvenlik", "musteri", "sube"];
// Göz-aldatan harf/rakam değişimleri (garant1, garanr1, g4ranti…).
const HOMO: Record<string, string> = { o: "0", i: "1", l: "1", a: "4", e: "3", s: "5", g: "9" };

// Anahtarın karakter-düzeyi typo varyantları: homoglyph + harf düşürme + ikizleme + komşu swap.
function typoVaryant(k: string): string[] {
  const out = new Set<string>();
  for (let i = 0; i < k.length; i++) { const r = HOMO[k[i]]; if (r) out.add(k.slice(0, i) + r + k.slice(i + 1)); } // homoglyph
  for (let i = 0; i < k.length; i++) out.add(k.slice(0, i) + k.slice(i + 1)); // harf düşürme
  for (let i = 0; i < k.length; i++) out.add(k.slice(0, i + 1) + k[i] + k.slice(i + 1)); // ikizleme
  for (let i = 0; i < k.length - 1; i++) out.add(k.slice(0, i) + k[i + 1] + k[i] + k.slice(i + 2)); // komşu swap
  out.delete(k);
  return [...out].filter((v) => v.length >= k.length - 1 && v.length <= k.length + 1 && /^[a-z0-9]+$/.test(v));
}

// Bir marka için olası sahte domain adaylarını üret. Resmî adresler elenir, ~90 ile sınırlanır.
export function typosquatUret(marka: KorunanMarka): string[] {
  const k = marka.anahtar;
  const cand = new Set<string>();
  // 1) TLD-swap — klasik: marka adı + riskli/yaygın uzantı (garanti.xyz, garanti.online…)
  for (const t of TLDLER) cand.add(`${k}.${t}`);
  // 2) Phishing kombosu — marka + tuzak kelime (iki yönde) + birkaç TLD
  for (const w of PHISH.slice(0, 8)) for (const t of ["com", "xyz", "online"]) { cand.add(`${k}-${w}.${t}`); cand.add(`${w}-${k}.${t}`); }
  // 3) Harf-oyunu typo varyantları + .com/.xyz
  for (const v of typoVaryant(k).slice(0, 12)) for (const t of ["com", "xyz"]) cand.add(`${v}.${t}`);
  return [...cand].filter((d) => !resmiListedeMi(d, marka.resmi)).slice(0, 90);
}
