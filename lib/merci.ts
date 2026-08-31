// Suç türüne göre DOĞRU resmî mercie yönlendirme. Biz "suçtur" demeyiz;
// "ihbara değer" der ve yetkili makama yönlendiririz — karar merciindir.

export type Merci = {
  ad: string;
  aciklama: string; // neden buraya
  link?: string; // resmî başvuru adresi
  email?: string;
  tel?: string;
  vurgu?: boolean; // en öncelikli kanal
};

// Resmî kanallar (Türkiye) — doğrulanmış adresler.
const USOM: Merci = {
  ad: "USOM — Siber Güvenlik Başkanlığı",
  aciklama: "Zararlı/oltalama site ve siber dolandırıcılık ihbarı; resmî zararlı listesine ekletir.",
  link: "https://www.siberguvenlik.gov.tr",
  email: "ihbar@siberguvenlik.gov.tr",
};
const IHBARWEB: Merci = {
  ad: "İhbar Web (BTK)",
  aciklama: "Yasa dışı içerik ihbarı (bahis/kumar, çocuk istismarı, terör, uyuşturucu) — erişim engeli süreci başlatır.",
  link: "https://www.ihbarweb.org.tr",
};
const CIMER: Merci = {
  ad: "CİMER",
  aciklama: "Cumhurbaşkanlığı İletişim Merkezi — her konuda resmî başvuru/ihbar; ilgili kuruma yönlendirilir.",
  link: "https://www.cimer.gov.tr",
};
const SAVCILIK: Merci = {
  ad: "Cumhuriyet Başsavcılığı",
  aciklama: "Hakaret, tehdit, şantaj gibi suçlarda şikayet dilekçesiyle başvurulur (aşağıdaki dilekçeyi kullanabilirsin).",
};
const POLIS: Merci = {
  ad: "Polis / Jandarma — 155 / 156",
  aciklama: "Can güvenliği tehdidi veya acil durumda hemen ara.",
  tel: "155",
};
const BANKA: Merci = {
  ad: "Bankan (acil)",
  aciklama: "Para gönderdiysen VAKİT KAYBETMEDEN bankanı ara; işlemi bildir, karşı hesabın bloke edilmesini iste.",
};

// Kategori → öncelik sıralı merci listesi.
export function merciOner(kategori: string): Merci[] {
  switch (kategori) {
    case "dolandiricilik":
      return [{ ...BANKA, vurgu: true }, USOM, CIMER, SAVCILIK];
    case "yasa_disi": // yasa dışı bahis/kumar, yasa dışı içerik
      return [{ ...IHBARWEB, vurgu: true }, USOM, CIMER];
    case "hakaret":
      return [{ ...SAVCILIK, vurgu: true }, CIMER];
    case "tehdit":
      return [{ ...POLIS, vurgu: true }, SAVCILIK, CIMER];
    case "sahte_hesap":
      return [
        { ad: "Platforma şikayet", aciklama: "Sahte hesabı barındıran uygulamaya (Instagram/X/Facebook) 'taklit hesap' olarak bildir.", vurgu: true },
        USOM,
        CIMER,
      ];
    default:
      return [CIMER, IHBARWEB];
  }
}
