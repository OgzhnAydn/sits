// ── TESPİT YAŞAM DÖNGÜSÜ (durum makinesi) ────────────────────────────────────
// Certificate Transparency log yaşam döngüsünden (Pending→Qualified/Usable→ReadOnly
// →Retired→Rejected) uyarlanmış KATI durum makinesi. Bir tespitin (marka adayı)
// "canlılık"ı (park/canlı — `durum` alanı) ile "yaşam döngüsü"nü (doğrulandı mı,
// elendi mi — `yasamDurumu`) AYIRIR. Böylece: (1) sadece DOGRULANDI aktif tehdit
// sayılır; (2) park/expired'a düşen bir tespit "temiz" olmaz, geçmiş ciddiyeti korunur
// (graceful degradation); (3) izinsiz geçiş reddedilir + her geçiş loglanır (auditability).
//
// CT karşılığı:  Pending=ADAY · Qualified/Usable=DOGRULANDI · ReadOnly=IZLEMEDE
//                Retired=PASIF · Rejected=ELENDI

export type YasamDurumu = "ADAY" | "DOGRULANDI" | "IZLEMEDE" | "PASIF" | "ELENDI";

// Gözlemlenen gerçeklik. Yaşam durumunu BU üretmez; hedef durumu `gecisHesapla` türetir.
export type YasamSinyali = {
  tur: "hizli-skor" | "derin-analiz" | "canlilik" | "elendi";
  canliDurum?: "canli" | "aktif-tuzak" | "park" | "yayinda-degil"; // gözlemlenen canlılık
  aktifTehdit?: boolean; // derin analiz aktif tuzak / kimlik-avı formu DOĞRULADI mı
  nxdomain2?: boolean;   // iki çözücüde NXDOMAIN → kesin kaldırılmış (yalnız bu → PASIF)
  mesru?: boolean;       // FP-guard meşru dedi (ETBİS kayıtlı / kendi ASN / resmî yönlendirme)
  skor?: number;
  neden?: string;
};

export type YasamOlay = { durum: YasamDurumu; onceki?: YasamDurumu; t: number; neden: string };

// İzinli geçişler (self her zaman izinli). ELENDI terminaldir (Rejected gibi).
// PASIF'ten çıkış YALNIZ reaktivasyon (kaldırılmış domain yeniden kaydolup canlanabilir).
const IZINLI: Record<YasamDurumu, YasamDurumu[]> = {
  ADAY:       ["DOGRULANDI", "IZLEMEDE", "ELENDI"],
  DOGRULANDI: ["IZLEMEDE", "PASIF", "ELENDI"],
  IZLEMEDE:   ["DOGRULANDI", "PASIF", "ELENDI"],
  PASIF:      ["DOGRULANDI", "IZLEMEDE"],
  ELENDI:     [],
};

const AKTIF_CANLI = new Set(["canli", "aktif-tuzak"]);
const IZLEME_CANLI = new Set(["park", "yayinda-degil"]);

// Sinyalden HEDEF durumu türet (öncelik yüksek→düşük). Henüz izin kontrolü yok.
function hedefDurum(s: YasamSinyali): YasamDurumu {
  if (s.mesru) return "ELENDI";                                   // meşru/FP → elendi (terminal)
  if (s.nxdomain2) return "PASIF";                                // kesin kaldırılmış
  if (s.aktifTehdit || (s.canliDurum && AKTIF_CANLI.has(s.canliDurum))) return "DOGRULANDI";
  if (s.canliDurum && IZLEME_CANLI.has(s.canliDurum)) return "IZLEMEDE"; // park/pasif → izle
  return "ADAY";
}

// Öncelik derecesi — bir sinyal mevcut durumu GERİYE almamalı (ör. hızlı-skor bir
// DOGRULANDI'yı ADAY'a düşürmez). Düşük dereceli hedefe "geçiş" self'e indirgenir.
const DERECE: Record<YasamDurumu, number> = { ADAY: 0, IZLEMEDE: 1, DOGRULANDI: 2, PASIF: 3, ELENDI: 4 };

/**
 * Saf geçiş motoru. `onceki` yoksa ADAY varsayılır. İzinsiz/geri geçiş → değişmez.
 * ELENDI ve PASIF gibi güçlü durumlar öncelik kazanır (kaldırılma/meşruiyet gözlemi
 * canlılık dalgalanmasından üstündür); onlar dışında geriye-gidiş engellenir.
 */
export function gecisHesapla(
  onceki: YasamDurumu | undefined,
  s: YasamSinyali,
): { durum: YasamDurumu; degisti: boolean; izinli: boolean; neden: string } {
  const kaynak: YasamDurumu = onceki || "ADAY";
  let hedef = hedefDurum(s);

  // PASIF/ELENDI (kaldırılma/meşruiyet) dışında, mevcut durumdan DAHA ZAYIF bir hedefe
  // düşürme yapma (canlılık gürültüsü doğrulanmış tespiti geriye almasın).
  const guclu = hedef === "PASIF" || hedef === "ELENDI";
  if (!guclu && DERECE[hedef] < DERECE[kaynak]) hedef = kaynak;

  if (hedef === kaynak) return { durum: kaynak, degisti: false, izinli: true, neden: s.neden || "değişiklik yok" };
  if (!IZINLI[kaynak].includes(hedef)) {
    return { durum: kaynak, degisti: false, izinli: false, neden: `izinsiz geçiş ${kaynak}→${hedef} reddedildi` };
  }
  const neden = s.neden || gerekce(kaynak, hedef, s);
  return { durum: hedef, degisti: true, izinli: true, neden };
}

function gerekce(k: YasamDurumu, h: YasamDurumu, s: YasamSinyali): string {
  if (h === "DOGRULANDI") return k === "ADAY" ? "derin analiz aktif tehdidi doğruladı" : "yeniden aktifleşti (reaktivasyon)";
  if (h === "IZLEMEDE") return `canlılık düştü (${s.canliDurum || "park"}) — geçmiş ciddiyet korunur`;
  if (h === "PASIF") return "iki çözücüde NXDOMAIN — kaldırıldığı doğrulandı";
  if (h === "ELENDI") return "meşru/altyapı doğrulaması — yanlış-pozitif elendi";
  return "durum güncellendi";
}

// Canlılık `durum` string'inden hızlı sinyal kurar (yenidenTara / adayDurumGuncelle için).
export function canliliktanSinyal(
  canliDurum: string | undefined,
  aktifTehdit?: boolean,
  nxdomain2?: boolean,
  skor?: number,
): YasamSinyali {
  return {
    tur: "canlilik",
    canliDurum: (canliDurum as YasamSinyali["canliDurum"]) || undefined,
    aktifTehdit,
    nxdomain2,
    skor,
  };
}

// Bir tespit "aktif tehdit" olarak sayılmalı mı? (rapor/panel/istatistik tek ölçüt.)
export const AKTIF_TEHDIT: YasamDurumu = "DOGRULANDI";
export function aktifTehditMi(d?: YasamDurumu): boolean {
  return d === "DOGRULANDI";
}
