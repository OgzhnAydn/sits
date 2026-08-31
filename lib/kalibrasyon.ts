// Kalibrasyon seti — motorun DÜRÜSTLÜĞÜNÜ her deploy'da otomatik ölçer.
// TEMİZ siteler yanlışlıkla flag'lendi mi (yanlış-POZİTİF, asıl derdimiz)?
// KÖTÜ siteler kaçtı mı (yanlış-NEGATİF)? Böylece paylaşımlı-altyapı tarzı
// regresyonları (akbnk/halkbank/turkcell/deepseek) biz fark etmeden yakalarız.

import { domainOsint } from "./osint";

export type Beklenen = "temiz" | "kotu";
export type Ornek = { domain: string; beklenen: Beklenen; not?: string };

// EŞİK: risk < 30 → "temiz" (Düşük). >= 30 → "kötü" (Orta+).
export const TEMIZ_ESIK = 30;

export const KALIBRASYON: Ornek[] = [
  // ── TEMİZ (Düşük <30 beklenir) — meşru, köklü siteler ──
  { domain: "chat.deepseek.com", beklenen: "temiz", not: "CloudFront edge (AbuseIPDB tuzağı)" },
  { domain: "halkbank.com", beklenen: "temiz", not: "banka .com" },
  { domain: "akbank.com", beklenen: "temiz", not: "AKBNK — kendi altyapısı" },
  { domain: "garanti.com.tr", beklenen: "temiz" },
  { domain: "ziraatbank.com.tr", beklenen: "temiz" },
  { domain: "turkcell.com.tr", beklenen: "temiz", not: "gerçek Turkcell" },
  { domain: "turkiye.gov.tr", beklenen: "temiz", not: "e-Devlet" },
  { domain: "trendyol.com", beklenen: "temiz" },
  { domain: "hepsiburada.com", beklenen: "temiz" },
  { domain: "sahibinden.com", beklenen: "temiz" },
  { domain: "github.com", beklenen: "temiz" },
  { domain: "google.com", beklenen: "temiz" },
  // ── KÖTÜ (Orta/Yüksek >=30 beklenir) — bu oturumda doğrulanmış tehditler ──
  { domain: "turkcell-scotiabank.com.ph", beklenen: "kotu", not: "phishing kümesi (.ph)" },
  { domain: "turkcell.site", beklenen: "kotu", not: "sahte 5G giriş" },
  { domain: "turkcell.online", beklenen: "kotu", not: "satılık marka squat" },
  { domain: "vakifbank.site", beklenen: "kotu", not: "Vakıfbank squat (.site)" },
];

export type OrnekSonuc = Ornek & {
  risk: number | null;
  seviye: "Yüksek" | "Orta" | "Düşük" | "erişilemedi";
  gecti: boolean;
  yanlisTip: "FP" | "FN" | null; // yanlış-pozitif / yanlış-negatif
};

function seviye(r: number): "Yüksek" | "Orta" | "Düşük" {
  return r >= 60 ? "Yüksek" : r >= 30 ? "Orta" : "Düşük";
}

async function batch<T, R>(items: T[], fn: (t: T) => Promise<R>, n = 6): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  }
  return out;
}

// Sadece bir DİLİMİ çalıştır (client batch'ler halinde çağırır → 60sn cap'ini aşmaz).
export async function kalibrasyonDilim(bas: number, adet: number): Promise<{ sonuclar: OrnekSonuc[]; toplam: number }> {
  const dilim = KALIBRASYON.slice(bas, bas + adet);
  const sonuclar = await batch(dilim, async (o): Promise<OrnekSonuc> => {
    let risk: number | null = null;
    try {
      const r = await domainOsint(o.domain);
      risk = Math.min(100, r.risk);
    } catch {
      risk = null;
    }
    if (risk === null) {
      return { ...o, risk: null, seviye: "erişilemedi", gecti: false, yanlisTip: null };
    }
    const temizMi = risk < TEMIZ_ESIK;
    const gecti = o.beklenen === "temiz" ? temizMi : !temizMi;
    const yanlisTip: "FP" | "FN" | null = gecti ? null : o.beklenen === "temiz" ? "FP" : "FN";
    return { ...o, risk, seviye: seviye(risk), gecti, yanlisTip };
  }, adet);
  return { sonuclar, toplam: KALIBRASYON.length };
}
