// Marka taklit dedektörü — en sık Türk dolandırıcılığı: banka/kurum taklidi.
// En güçlü ve en düşük yanlış-pozitifli kural: bir domain tanınmış bir markanın
// AYIRT EDİCİ token'ını içeriyor ama o markanın RESMİ domaini değilse → taklit.
//   ziraatbank-onlinesbi.ph  → "ziraat" içeriyor, resmi değil  → TAKLİT
//   garanti-giris.com        → "garanti" içeriyor, resmi değil → TAKLİT
// Ayrıca: metinde marka adı + resmi olmayan link + oltalama fiili → taklit.

import { itibarliMi } from "./itibarli";

type Marka = {
  ad: string; // görünen ad
  token: string[]; // domain/metinde aranan ayırt edici parçalar
  resmi: string[]; // resmi registrable domainler
};

const MARKALAR: Marka[] = [
  { ad: "Ziraat Bankası", token: ["ziraat"], resmi: ["ziraatbank.com.tr", "ziraatbankasi.com.tr"] },
  { ad: "Garanti BBVA", token: ["garanti"], resmi: ["garantibbva.com.tr"] },
  { ad: "Akbank", token: ["akbank"], resmi: ["akbank.com"] },
  { ad: "İş Bankası", token: ["isbank", "işbank", "isbankasi", "işbankası"], resmi: ["isbank.com.tr"] },
  { ad: "Yapı Kredi", token: ["yapikredi", "yapıkredi"], resmi: ["yapikredi.com.tr"] },
  { ad: "Halkbank", token: ["halkbank"], resmi: ["halkbank.com.tr"] },
  { ad: "VakıfBank", token: ["vakifbank", "vakıfbank"], resmi: ["vakifbank.com.tr"] },
  { ad: "DenizBank", token: ["denizbank"], resmi: ["denizbank.com"] },
  { ad: "QNB Finansbank", token: ["finansbank", "qnb"], resmi: ["qnbfinansbank.com"] },
  { ad: "ING", token: ["ingbank"], resmi: ["ingbank.com.tr"] },
  { ad: "Kuveyt Türk", token: ["kuveytturk", "kuveytturk"], resmi: ["kuveytturk.com.tr"] },
  { ad: "Enpara", token: ["enpara"], resmi: ["enpara.com"] },
  { ad: "Papara", token: ["papara"], resmi: ["papara.com"] },
  { ad: "e-Devlet", token: ["edevlet", "e-devlet", "turkiyegov", "türkiyegov"], resmi: ["turkiye.gov.tr"] },
  { ad: "PTT", token: ["pttkart", "ptt-"], resmi: ["ptt.gov.tr", "pttkart.gov.tr"] },
  { ad: "Gelir İdaresi (GİB)", token: ["gib-", "vergidairesi", "geliridaresi"], resmi: ["gib.gov.tr"] },
  { ad: "Turkcell", token: ["turkcell"], resmi: ["turkcell.com.tr"] },
  { ad: "Türk Telekom", token: ["turktelekom", "türktelekom"], resmi: ["turktelekom.com.tr"] },
  { ad: "Vodafone", token: ["vodafone"], resmi: ["vodafone.com.tr"] },
  { ad: "Trendyol", token: ["trendyol"], resmi: ["trendyol.com"] },
  { ad: "Hepsiburada", token: ["hepsiburada"], resmi: ["hepsiburada.com"] },
  { ad: "Yurtiçi Kargo", token: ["yurticikargo", "yurtiçikargo"], resmi: ["yurticikargo.com"] },
  { ad: "Aras Kargo", token: ["araskargo"], resmi: ["araskargo.com.tr"] },
  { ad: "MNG Kargo", token: ["mngkargo"], resmi: ["mngkargo.com.tr"] },
];

// Metinde marka ADI geçiyor mu? (kelime bazlı, kısa token'larda sınır şartı)
const METIN_ADI: { ad: string; kelime: string[] }[] = [
  { ad: "Ziraat Bankası", kelime: ["ziraat"] }, { ad: "Garanti BBVA", kelime: ["garanti"] },
  { ad: "Akbank", kelime: ["akbank"] }, { ad: "İş Bankası", kelime: ["iş bank", "isbank", "iş bankası"] },
  { ad: "Yapı Kredi", kelime: ["yapı kredi", "yapikredi"] }, { ad: "Halkbank", kelime: ["halkbank", "halk bankası"] },
  { ad: "VakıfBank", kelime: ["vakıfbank", "vakifbank"] }, { ad: "DenizBank", kelime: ["denizbank"] },
  { ad: "e-Devlet", kelime: ["e-devlet", "edevlet", "e devlet"] }, { ad: "PTT", kelime: ["ptt kargo", "ptt "] },
  { ad: "Turkcell", kelime: ["turkcell"] }, { ad: "Trendyol", kelime: ["trendyol"] },
  { ad: "Hepsiburada", kelime: ["hepsiburada"] }, { ad: "Yurtiçi Kargo", kelime: ["yurtiçi kargo", "yurtici kargo"] },
];

// Oltalama fiilleri — "marka adı + resmi olmayan link" birleşince taklit sinyali.
const OLTALAMA_FIIL = [
  "giriş", "giris", "şifre", "sifre", "doğrula", "dogrula", "güncelle", "guncelle",
  "hesabın", "hesabin", "bloke", "onay", "kod", "ödeme", "odeme", "tıkla", "tikla",
  "kart", "borç", "borc", "kazandın", "kazandin", "teslimat", "gümrük", "gumruk",
];

function kokDomain(domain: string): string {
  const d = domain.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const p = d.split(".");
  if (p.length <= 2) return d;
  const ikiliTld = ["com.tr", "net.tr", "org.tr", "gov.tr", "edu.tr", "co.uk"];
  return ikiliTld.includes(p.slice(-2).join(".")) ? p.slice(-3).join(".") : p.slice(-2).join(".");
}

function resmiMi(domain: string, resmi: string[]): boolean {
  const kok = kokDomain(domain);
  return resmi.some((r) => domain === r || kok === r || domain.endsWith("." + r));
}

export type TaklitSonuc = {
  marka: string;
  tip: "domain" | "metin"; // domain markayı taklit ediyor / metin marka diyor ama link sahte
  gorulen: string; // sorunlu domain
  mesaj: string;
};

// Bir mesaj + URL'lerden marka taklidini bul. En güçlü bulguyu döndür (yoksa null).
export function markaTaklitBul(metin: string, urls: string[]): TaklitSonuc | null {
  const t = (metin || "").toLowerCase();
  const domainler = (urls || []).map((u) => {
    try {
      return new URL(u.includes("://") ? u : "https://" + u).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return u.toLowerCase().replace(/^www\./, "").split("/")[0];
    }
  });

  // 1) EN GÜÇLÜ: domain marka token'ı içeriyor ama o markanın resmi domaini değil.
  for (const d of domainler) {
    if (itibarliMi(d)) continue; // resmi/itibarlı siteyi asla suçlama
    const sade = d.replace(/[.-]/g, ""); // ziraat-bank → ziraatbank
    for (const m of MARKALAR) {
      const eslesen = m.token.find((tok) => sade.includes(tok.replace(/[.-]/g, "")));
      if (eslesen && !resmiMi(d, m.resmi)) {
        return {
          marka: m.ad,
          tip: "domain",
          gorulen: d,
          mesaj: `Bu adres "${m.ad}" gibi görünmeye çalışıyor ama ${m.ad}'nın resmi adresi DEĞİL. Resmi adres: ${m.resmi[0]}. Bu, marka taklidiyle yapılan tipik bir dolandırıcılıktır.`,
        };
      }
    }
  }

  // 2) Metinde marka adı geçiyor + resmi olmayan link + oltalama fiili var.
  const oltalama = OLTALAMA_FIIL.some((f) => t.includes(f));
  if (oltalama && domainler.length) {
    for (const m of METIN_ADI) {
      if (!m.kelime.some((k) => t.includes(k))) continue;
      const marka = MARKALAR.find((x) => x.ad === m.ad);
      if (!marka) continue;
      const resmiVar = domainler.some((d) => resmiMi(d, marka.resmi) || itibarliMi(d));
      if (!resmiVar) {
        const sahte = domainler.find((d) => !itibarliMi(d)) || domainler[0];
        return {
          marka: m.ad,
          tip: "metin",
          gorulen: sahte,
          mesaj: `Mesaj "${m.ad}" adına geliyor ve kişisel/ödeme bilgisi istiyor ama bağlantı ${m.ad}'nın resmi sitesine gitmiyor (${sahte}). Gerçek kurumlar sizi resmi olmayan adreslere yönlendirmez.`,
        };
      }
    }
  }

  return null;
}
