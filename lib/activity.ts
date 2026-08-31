"use client";

export type Etkinlik = {
  deger: string;
  tip: string; // iban | telefon | url | bildirim
  tur?: "sorgu" | "bildirim";
  supheli: boolean;
  zaman: number;
};

const ANAHTAR = "sb_etkinlikler";

export function etkinlikEkle(e: Omit<Etkinlik, "zaman">) {
  if (typeof window === "undefined") return;
  const tur = e.tur ?? "sorgu";
  // Aynı değer + tür tekrarını yok say (liste temiz kalsın).
  const list = etkinlikleriGetir().filter(
    (x) => !(x.deger === e.deger && (x.tur ?? "sorgu") === tur)
  );
  list.unshift({ ...e, tur, zaman: Date.now() });
  localStorage.setItem(ANAHTAR, JSON.stringify(list.slice(0, 30)));
}

export function etkinlikleriGetir(): Etkinlik[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ANAHTAR) || "[]");
  } catch {
    return [];
  }
}

// Güvenlik puanı: yalnızca SORGULARINA dayanır (maruziyet). Bildirim yapmak
// puanı düşürmez — bildirim iyi bir şeydir.
export function guvenlikPuani(): {
  puan: number;
  sorgu: number;
  supheli: number;
  mesaj: string;
} {
  const list = etkinlikleriGetir();
  const otuzGun = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sorgular = list.filter((e) => e.zaman >= otuzGun && e.tur !== "bildirim");
  const supheli = sorgular.filter((e) => e.supheli).length;
  const puan = Math.max(40, 100 - supheli * 15);
  const mesaj =
    sorgular.length === 0
      ? "Henüz sorgu yok — bir şey sorgulayarak başla."
      : supheli === 0
      ? "Son 30 günde şüpheli bir şeyle karşılaşmadın."
      : `Son 30 günde ${supheli} şüpheli durumla karşılaştın — dikkatli ol.`;
  return { puan, sorgu: sorgular.length, supheli, mesaj };
}
