export type Uyari = {
  etiket: string;
  baslik: string;
  metin: string;
};

// Maskotun ağzından, karikatür/sıcak dille günlük siber-suç bilgilendirmeleri.
export const UYARILAR: Uyari[] = [
  {
    etiket: "Sahte kargo",
    baslik: "“Kargon gümrükte kaldı” SMS'i mi geldi?",
    metin:
      "Kargo şirketleri asla SMS'teki bir linkten ödeme istemez. Link'e tıklama, kart bilgini girme. Şüphelenirsen numarayı bana sorgulat!",
  },
  {
    etiket: "Yatırım tuzağı",
    baslik: "“Günde %10 kazanç” diyen mi var?",
    metin:
      "Bu kadar kolay para yok. 'Garantili yüksek getiri' vaadi neredeyse her zaman dolandırıcılıktır. Parayı yatırmadan önce dur ve düşün.",
  },
  {
    etiket: "Hesap ele geçirme",
    baslik: "“Kodu bana ilet” diyen arkadaşına dikkat",
    metin:
      "WhatsApp/Instagram'da gelen doğrulama kodunu KİMSEYLE paylaşma. Arkadaşın gibi görünen kişi, hesabı çalınmış olabilir.",
  },
  {
    etiket: "Sahte banka",
    baslik: "Bankan seni arayıp şifre ister mi? Hayır!",
    metin:
      "Gerçek banka; şifre, SMS kodu veya kart CVV'sini asla istemez. İsteyen kişi dolandırıcıdır. Telefonu kapat, bankanı sen ara.",
  },
  {
    etiket: "Sahte site",
    baslik: "Çok ucuz ürün = çoğu zaman sahte site",
    metin:
      "Ödeme yapmadan önce site adresini bana sorgulat. Adreste garip harfler, eksik 'https' veya tuhaf uzantı varsa uzak dur.",
  },
  {
    etiket: "Ödül tuzağı",
    baslik: "“Tebrikler, telefon kazandın!” 🎁",
    metin:
      "Katılmadığın çekilişten ödül çıkmaz. 'Kargo ücreti' veya 'vergi' için para/kart bilgisi isteyen her mesaj tuzaktır.",
  },
  {
    etiket: "Şantaj",
    baslik: "Tehdit/şantaj mı aldın? Yalnız değilsin",
    metin:
      "Panik yapma, yanıt verme, ödeme yapma. Ekran görüntülerini sakla ve bana bildir — ne yapman gerektiğini adım adım söylerim.",
  },
  {
    etiket: "Sahte hesap",
    baslik: "Adına sahte profil mi açılmış?",
    metin:
      "Profilin linkini bana bildir; hem sana platforma nasıl şikayet edeceğini gösteririm, hem de başkalarını uyarırız.",
  },
];

// Güne göre uyarı seç (deterministik, her gün değişir).
export function gununUyarisi(gunIndex: number): Uyari {
  return UYARILAR[gunIndex % UYARILAR.length];
}
