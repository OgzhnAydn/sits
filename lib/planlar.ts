// PLANLAR — MirLeon marka koruma abonelik kademeleri (tek kaynak; client + server paylaşır).
// Faz 1: ödeme YOK. Plan hesaba elle/varsayılan atanır; özellik kapıları ve kullanım panosu bununla çalışır.
// Değer merdiveni: Pro=Bul&Göster · Business=Analiz&Takip · Enterprise=Kontrol&Aksiyon.
// Fiyatlar TEMSİLÎ (netleşince güncellenecek). Sektör normu: asıl fiyat kolu = yönetilen takedown.

export type PlanAnahtar = "pro" | "business" | "enterprise";

// Özellik bayrakları — API/UI kapıları bunlarla sorulur.
export type Ozellik =
  | "temelTespit"      // CT akışından taklit tespiti + liste (hepsi)
  | "ekranGoruntusu"   // tespitin ekran görüntüsü
  | "karaListe"        // USOM/BTK/ETBİS çapraz kontrol
  | "derinAnaliz"      // içerik + görsel (AI) + davranış/ağ + doorway
  | "altyapiHarita"    // passive DNS + kardeş domain + ortak ASN
  | "surekliTakip"     // yaşam döngüsü + uyarı
  | "rapor"            // PDF marka koruma raporu
  | "uygulamaReklam"   // app store + reklam izleme
  | "anlikTespit"      // gerçek-zamanlı (öncelikli) akış
  | "parkKontrol"      // park/pasif adresleri aktive olduğu an yakalama
  | "cloaking"         // TR-render gerçek kullanıcı görünümü (cloaking kırma)
  | "api"              // API + SSO
  | "ozelAnalist";     // özel analist + SLA

// Her özelliğin AÇILDIĞI en düşük plan (kademeli kapı).
export const OZELLIK_MIN_PLAN: Record<Ozellik, PlanAnahtar> = {
  temelTespit: "pro", ekranGoruntusu: "pro", karaListe: "pro",
  derinAnaliz: "business", altyapiHarita: "business", surekliTakip: "business", rapor: "business", uygulamaReklam: "business",
  anlikTespit: "enterprise", parkKontrol: "enterprise", cloaking: "enterprise", api: "enterprise", ozelAnalist: "enterprise",
};

export type PlanTanim = {
  anahtar: PlanAnahtar;
  ad: string;
  fiil: string;         // kademe fiili
  tanim: string;        // tek cümle
  fiyat: string;        // temsilî
  birim: string;
  populer?: boolean;
  // -1 = sınırsız
  limitler: { marka: number; aylikDerinAnaliz: number; aylikRapor: number; takedownYil: number };
};

export const PLANLAR: Record<PlanAnahtar, PlanTanim> = {
  pro: {
    anahtar: "pro", ad: "Pro", fiil: "Bul & Göster",
    tanim: "Markanızı taklit eden adresleri bulun, bir bakışta görün.",
    fiyat: "$290", birim: "/ marka · yıl",
    limitler: { marka: 1, aylikDerinAnaliz: 0, aylikRapor: 0, takedownYil: 0 },
  },
  business: {
    anahtar: "business", ad: "Business", fiil: "Analiz & Takip", populer: true,
    tanim: "Her tehdidi derinlemesine analiz edin, sürekli izleyin.",
    fiyat: "$790", birim: "/ marka · yıl",
    limitler: { marka: 3, aylikDerinAnaliz: 100, aylikRapor: 4, takedownYil: 10 },
  },
  enterprise: {
    anahtar: "enterprise", ad: "Enterprise", fiil: "Kontrol & Aksiyon",
    tanim: "Anlık yakalayın; uykudaki tehditleri aktive olduğu an durdurun.",
    fiyat: "$2.500", birim: "/ yıl",
    limitler: { marka: -1, aylikDerinAnaliz: -1, aylikRapor: -1, takedownYil: -1 },
  },
};

const SIRA: PlanAnahtar[] = ["pro", "business", "enterprise"];

export function gecerliPlan(p: string | undefined | null): PlanAnahtar {
  return p === "business" || p === "enterprise" ? p : "pro"; // varsayılan pro
}

// Bir planın bir özelliğe erişimi var mı (kademe sırasına göre).
export function ozellikVar(plan: PlanAnahtar, ozellik: Ozellik): boolean {
  return SIRA.indexOf(plan) >= SIRA.indexOf(OZELLIK_MIN_PLAN[ozellik]);
}

// Bir özelliğin gerektirdiği plan adı (yükseltme ipucu için).
export function ozellikPlanAdi(ozellik: Ozellik): string {
  return PLANLAR[OZELLIK_MIN_PLAN[ozellik]].ad;
}

// Yükseltme için bir sonraki plan (yoksa null).
export function sonrakiPlan(plan: PlanAnahtar): PlanAnahtar | null {
  const i = SIRA.indexOf(plan);
  return i >= 0 && i < SIRA.length - 1 ? SIRA[i + 1] : null;
}

// Kullanım türü → kredi/limit alanı eşlemesi (kullanım panosu + ileride enforcement).
export type KullanimTuru = "derin_analiz" | "rapor" | "tr_render" | "takedown" | "sorgu";
export const KULLANIM_ETIKET: Record<KullanimTuru, string> = {
  derin_analiz: "Derin analiz", rapor: "PDF rapor", tr_render: "Gerçek görünüm (TR-render)", takedown: "Takedown", sorgu: "Link sorgusu",
};
