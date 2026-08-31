// Kampanya kalıp imzası — bir dolandırıcılık mesajının, KULLANILAN DOMAINDEN
// bağımsız "parmak izini" çıkarır. Dolandırıcı bugün isipayolcer.com.tr,
// yarın isipay-odeme.com kullansa bile; SMS şablonu ve link deseni aynı kalır.
// Bu imza sayesinde domain her değiştiğinde tuzağı ilk saniyede tanırız.

// Dolandırıcılık şablonlarını ayırt eden, sık geçen anahtar öbekler.
const KALIP_KELIMELER = [
  "ısı pay", "isi pay", "ölçer", "olcer", "daire", "dönem", "donem",
  "son ödeme", "s.o.t", "doğalgaz", "dogalgaz", "elektrik", "aidat", "abonelik",
  "fatura", "borç", "borc", "gecikme", "kargo", "gümrük", "gumruk", "teslimat",
  "e-devlet", "edevlet", "ptt", "hgs", "ogs", "trafik cezası", "ceza",
  "kazandın", "çekiliş", "cekilis", "hediye", "ödül", "odul", "iade", "vergi",
  "hesabınız", "hesabiniz", "bloke", "güncelle", "guncelle", "doğrula", "dogrula",
  "şifre", "sifre", "sms kodu", "onay kodu", "tıkla", "tikla", "acele", "son gün",
];

// URL yolunu domainden bağımsız desene indirger:
//   /Bulut/G?x=VKRS  →  /bulut/g?x=#
// Böylece farklı domainlerdeki AYNI dolandırıcılık kiti eşleşir.
function yolDeseni(urls: string[]): string | null {
  for (const u of urls) {
    try {
      const url = new URL(u.includes("://") ? u : "https://" + u);
      const path = url.pathname.toLowerCase().replace(/\/+$/, "");
      // Her yol parçasında rakam/karışık-kod içerenleri "#" ile maskele.
      const parcalar = path
        .split("/")
        .filter(Boolean)
        .map((p) => (/\d/.test(p) || p.length > 14 ? "#" : p));
      const qkeys = [...url.searchParams.keys()].map((k) => k.toLowerCase()).sort();
      const yol = "/" + parcalar.join("/");
      // Anlamlı bir yol yoksa (sadece "/") desen üretme — çok genel olur.
      if (parcalar.length === 0 && qkeys.length === 0) continue;
      return `${yol}${qkeys.length ? "?" + qkeys.join("&") : ""}`;
    } catch {
      continue;
    }
  }
  return null;
}

// djb2 — kısa, kararlı bir hash (imza belge kimliği için).
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export type Imza = {
  imza: string | null; // kampanya belge kimliği (yeterli sinyal yoksa null)
  yol: string | null; // domainden bağımsız link deseni
  anahtarlar: string[]; // eşleşen kalıp kelimeler
};

// Bir mesaj + içindeki URL'lerden kampanya imzası üret. En az bir link deseni
// VEYA >=2 kalıp kelime yoksa imza üretmeyiz (gürültü/yanlış eşleşmeyi önler).
export function imzaCikar(metin: string, urls: string[]): Imza {
  const t = (metin || "").toLowerCase();
  const anahtarlar = KALIP_KELIMELER.filter((k) => t.includes(k));
  const yol = yolDeseni(urls || []);

  const yeterli = (yol && anahtarlar.length >= 1) || anahtarlar.length >= 2;
  if (!yeterli) return { imza: null, yol, anahtarlar };

  // İmza = link deseni + en ayırt edici ilk kelimeler. Domain YOK — kasıtlı.
  const cekirdek = [yol || "", ...anahtarlar.slice(0, 4)].join("|");
  return { imza: "k_" + hash(cekirdek), yol, anahtarlar };
}
