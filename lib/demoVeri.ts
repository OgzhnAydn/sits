// Demo amaçlı örnek bildirilmiş göstergeler.
// Firebase bağlanınca bu liste Firestore sorgusuyla değişecek.
export type Kayit = {
  deger: string;
  tip: "telefon" | "iban" | "url" | "kripto";
  bildirimSayisi: number;
  kategori: string;
};

export const DEMO_KAYITLAR: Kayit[] = [
  { deger: "05321234567", tip: "telefon", bildirimSayisi: 14, kategori: "Dolandırıcılık" },
  { deger: "0507654321", tip: "telefon", bildirimSayisi: 3, kategori: "Sahte kargo SMS" },
  { deger: "TR120001000000000000000001", tip: "iban", bildirimSayisi: 27, kategori: "Dolandırıcılık" },
  { deger: "ucuztelefon-firsat.com", tip: "url", bildirimSayisi: 9, kategori: "Sahte alışveriş" },
  { deger: "kargo-takip-tr.net", tip: "url", bildirimSayisi: 41, kategori: "Oltalama" },
];

export function normalize(giris: string): { deger: string; tip: Kayit["tip"] } {
  const t = giris.trim();
  // Kripto cüzdanı: ETH/EVM (0x…), Tron (T…), Bitcoin (1/3/bc1…)
  if (/^(0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33}|bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(t))
    return { deger: t, tip: "kripto" };
  if (/^TR\d/i.test(t.replace(/\s/g, "")))
    return { deger: t.replace(/\s/g, "").toUpperCase(), tip: "iban" };
  if (/^[\d\s+()-]{7,}$/.test(t))
    return { deger: t.replace(/[\s+()-]/g, "").replace(/^90/, "0").replace(/^(?!0)/, "0"), tip: "telefon" };
  return {
    deger: t.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""),
    tip: "url",
  };
}
