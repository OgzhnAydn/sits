import { geminiVarMi, geminiJson } from "./gemini";

export type Kategori =
  | "dolandiricilik"
  | "sahte_hesap"
  | "tehdit"
  | "hakaret"
  | "yasa_disi"
  | "diger";

export type Gostergeler = {
  url: string[];
  iban: string[];
  telefon: string[];
  kripto: string[];
};

export type Adim = { baslik: string; aciklama: string };

export type Analiz = {
  kategori: Kategori;
  kategoriAdi: string;
  ozet: string;
  gostergeler: Gostergeler;
  kurumlar: string[];
  adimlar: Adim[];
  guven: "yüksek" | "orta" | "düşük" | "yok";
  aiIleUretildi: boolean;
};

const KATEGORI_ADI: Record<Kategori, string> = {
  dolandiricilik: "Dolandırıcılık",
  sahte_hesap: "Sahte Hesap / Taklit",
  tehdit: "Tehdit / Şantaj",
  hakaret: "Hakaret / İftira",
  yasa_disi: "Yasa Dışı İçerik",
  diger: "Diğer",
};

// --- Regex tabanlı gösterge çıkarımı (AI olmadan da çalışır) ---
export function gostergeCikar(metin: string): Gostergeler {
  const url = Array.from(
    metin.matchAll(/\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi)
  )
    .map((m) => m[1])
    .filter((u) => !/\d{4,}/.test(u) || /[a-z]/i.test(u));
  const iban = Array.from(
    metin.matchAll(/\bTR\d{2}\s?(?:\d{4}\s?){5}\d{2}\b/gi)
  ).map((m) => m[0].replace(/\s+/g, ""));
  // Cep (05XX) + sabit hat (0212/0312…) + özel hatlar (0850/0800/0900) hepsi:
  // (+90 veya 0) ardından 10 hane (3-3-2-2). Lookbehind/lookahead ile IBAN gibi
  // uzun rakam dizilerinin ortasına denk gelmeyi engeller.
  const telefon = Array.from(
    metin.matchAll(/(?<!\d)(?:\+?90[\s.-]?|0)\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/g)
  )
    .map((m) => {
      const d = m[0].replace(/\D/g, "").replace(/^90/, ""); // +90/90 → at
      return "0" + d.replace(/^0/, ""); // her zaman 0 + 10 hane
    })
    .filter((n) => /^0\d{10}$/.test(n));
  // Kripto cüzdan adresleri: ETH/EVM (0x…), Tron (T…), Bitcoin (1/3/bc1…)
  const kripto = Array.from(
    metin.matchAll(/\b(0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33}|bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g)
  ).map((m) => m[1]);
  return {
    url: [...new Set(url)],
    iban: [...new Set(iban)],
    telefon: [...new Set(telefon)],
    kripto: [...new Set(kripto)],
  };
}

// Kategori başına belirleyici kelimeler (Türkçe, sık dolandırıcılık/suç dili).
const LEKSIKON: Record<Exclude<Kategori, "diger">, string[]> = {
  dolandiricilik: ["doland", "para", "iban", "havale", "eft", "kart", "ödeme", "odeme", "banka", "kripto", "yatırım", "yatirim", "kazanç", "kazanc", "hediye", "çekiliş", "cekilis", "kargo", "gümrük", "gumruk", "fatura", "borç", "borc", "link", "tıkla", "tikla", "ödül", "odul", "iade", "vergi", "e-devlet", "kod", "şifre", "sifre", "bloke", "acil", "ucuz", "fırsat", "firsat", "indirim", "sipariş", "siparis", "teslimat", "whatsapp", "yatır", "yatir", "ısı pay", "isi pay", "doğalgaz", "dogalgaz", "elektrik", "aidat", "abonelik", "daire", "dönem", "donem", "son ödeme", "s.o.t", "gecikme", "ölçer", "olcer", "bulut", "tl dir"],
  sahte_hesap: ["sahte hesap", "taklit", "adıma", "adima", "sahte profil", "klon", "beni taklit", "hesabım çalın", "hesabim calin", "hesap çalın", "ele geçir", "ele gecir", "fake hesap", "sahte sayfa"],
  tehdit: ["tehdit", "şantaj", "santaj", "ifşa", "ifsa", "öldür", "oldur", "zarar ver", "yakar", "paylaşırım", "paylasirim", "sextortion", "çıplak", "ciplak", "gönder yoksa", "gonder yoksa", "susmak istiyorsan"],
  hakaret: ["hakaret", "iftira", "küfür", "kufur", "aşağıla", "asagila", "onurumu", "şerefsiz", "serefsiz", "yalan haber", "karalama", "itibarımı"],
  yasa_disi: ["uyuşturucu", "uyusturucu", "silah", "yasa dışı", "yasa disi", "kumar", "bahis", "illegal", "terör", "teror", "propaganda", "çocuk istismar", "cocuk istismar", "reçetesiz", "recetesiz", "sahte belge", "korsan", "yasaklı"],
};

// Puanlı sınıflandırma: en çok eşleşen kategori + güven düzeyi.
export function siniflandir(metin: string, g: Gostergeler): { kategori: Kategori; guven: Analiz["guven"] } {
  const t = metin.toLowerCase();
  const skor: Record<string, number> = {};
  (Object.keys(LEKSIKON) as Exclude<Kategori, "diger">[]).forEach((kat) => {
    skor[kat] = LEKSIKON[kat].filter((k) => t.includes(k)).length;
  });
  // IBAN/telefon göstergesi dolandırıcılık sinyalini güçlendirir.
  if (g.iban.length) skor.dolandiricilik += 3;
  else if (g.telefon.length && skor.dolandiricilik > 0) skor.dolandiricilik += 1;

  const sirali = Object.entries(skor).sort((a, b) => b[1] - a[1]);
  const [enKat, enSkor] = sirali[0];
  if (enSkor === 0) return { kategori: "diger", guven: "yok" };
  const guven = enSkor >= 3 ? "yüksek" : enSkor === 2 ? "orta" : "düşük";
  return { kategori: enKat as Kategori, guven };
}

export type MesajYorum = {
  risk: "yuksek" | "orta" | "dusuk";
  gerekce: string;
  taktikler: string[];
  ai: boolean;
  mesru?: boolean; // meşru bilgilendirme (2FA kodu vb.) → "dolandırıcılık" etiketi verme
};

// MEŞRU 2FA/DOĞRULAMA KODU BİLDİRİMİ mi? Kod SUNAN (isteyen DEĞİL) mesaj — Google/
// banka/operatör 2FA. İçinde link/telefon YOK, aciliyet/ödeme/tıkla baskısı YOK.
// Dolandırıcı "kod X, hesabın kapanacak, tıkla http://…" der → link/aciliyet ile elenir.
// YASA DIŞI BAHİS/KUMAR mesajı mı? Kesin kumar terimleri (freespin/casino/bahis/
// iddaa/deneme bonusu…). Bu siteler Türkiye'de yasak; para yatırınca ödemez, kart/
// kimlik çalar. Cloudflare arkasında içerik gizli olsa bile mesaj bağlamı ele verir.
export function bahisMesaji(metin: string): boolean {
  const t = metin.toLowerCase();
  return /free ?spin|deneme bonus|\bcasino\b|\bkumar\b|\bbahis\b|iddaa|\brulet\b|\bslot\b|jackpot|bet ?boo|freebet|çevrim şart|cevrim sart|yat[ıi]r[ıi]m bonus|hoşgeldin bonus|hosgeldin bonus|spor.{0,10}bonus/i.test(t);
}

function mesruKodBildirimi(metin: string, g: Gostergeler): boolean {
  const t = metin.toLowerCase();
  const kodKelimesi = /(doğrulama|dogrulama|onay|güvenlik|guvenlik|verification|security|one[- ]?time|otp)\s*(kod|code)/i.test(t);
  const kodVar = /(\bg-?\d{4,8}\b|\b\d{4,8}\b)/i.test(metin);
  const tuzakSinyali = /tıkla|tikla|link|https?:|hemen|acil|bloke|kapat[ıi]l|iptal et|onayla|ödeme|odeme|para|kazand[ıi]n/i.test(t);
  return kodKelimesi && kodVar && g.url.length === 0 && g.telefon.length === 0 && g.iban.length === 0 && !tuzakSinyali;
}

// AI MESAJ YORUMU: mesajı AKILCI değerlendir — kelimeye değil İKNA TAKTİĞİne bak
// (aciliyet, otorite taklidi, ödül/korku tuzağı, kod/bilgi isteme). Gemini yoksa
// kural-tabanlı siniflandir'a düşer. /api/kontrol bunu çağırıp karara katar.
export async function mesajYorumla(metin: string, g: Gostergeler): Promise<MesajYorum> {
  // MEŞRU KOD BİLDİRİMİ deterministik guard — AI çalışmasa da (timeout) doğru olsun.
  if (mesruKodBildirimi(metin, g)) {
    return {
      risk: "dusuk",
      gerekce: "Bu, bir hesaba giriş için gönderilen meşru bir doğrulama/2FA kodu bildirimi gibi görünüyor — kimlik doğrulama kodları normaldir. Yine de bu kodu KİMSEYLE paylaşma.",
      taktikler: [],
      ai: false,
      mesru: true,
    };
  }
  // YASA DIŞI BAHİS/KUMAR guard — deterministik (AI timeout olsa da).
  if (bahisMesaji(metin)) {
    return {
      risk: "yuksek",
      gerekce: "Bu bir yasa dışı bahis/kumar sitesi tanıtımı. Türkiye'de bu siteler yasaktır; para yatırınca çoğu zaman ödeme yapmaz, kart ve kimlik bilgilerini ele geçirir. Uzak dur, para yatırma, bilgi verme.",
      taktikler: ["yasa dışı bahis/kumar", "abartılı bonus tuzağı"],
      ai: false,
    };
  }
  // ÇIPLAK GÖSTERGE: mesaj SADECE bir URL/telefon/IBAN ise (etrafında anlamlı metin
  // YOK), AI'ın "mesaj taktiği" analizi anlamsızdır — domain ADINDAN "phishing" UYDURUR
  // (edevletile.com aslında bir seyahat blogu). Bu durumda içeriği GÖREN OSINT karar
  // versin; mesaj yorumunu nötr bırak.
  const gostergeSayisi = g.url.length + g.telefon.length + g.iban.length + g.kripto.length;
  if (gostergeSayisi >= 1) {
    let kalan = metin;
    for (const v of [...g.url, ...g.telefon, ...g.iban, ...g.kripto]) kalan = kalan.split(v).join(" ");
    const kalanKelime = kalan.trim().split(/\s+/).filter((w) => w.length >= 3).length;
    if (kalanKelime <= 2) return { risk: "dusuk", gerekce: "", taktikler: [], ai: false };
  }
  if (geminiVarMi) {
    const sistem = `Sen SİTS'in dolandırıcılık analistisin. Sana bir MESAJ (SMS/DM/e-posta/ilan) verilecek. Bunun DOLANDIRICILIK/oltalama olup olmadığını AKILCI değerlendir — sadece kelimeye değil İKNA TAKTİĞİNE bak:
- aciliyet/baskı ("hemen", "son X saat", "hesabın kapanacak")
- otorite taklidi (banka, kargo, e-Devlet, operatör, polis/savcılık)
- ödül/para tuzağı ("kazandın", "iade/destek parası")
- korku ("ceza", "borç", "hesabın bloke edildi")
- tıkla/ara baskısı, kişisel bilgi ya da SMS/tek-kullanımlık KOD isteme
Mesajda link/telefon olması TEK BAŞINA suç değildir; bağlama bak (meşru bilgilendirme de olabilir).
ÇOK ÖNEMLİ: Bir DOĞRULAMA/2FA KODU SUNAN mesaj ("kodunuz 123456, kimseyle paylaşmayın") MEŞRUDUR, dolandırıcılık DEĞİLDİR — risk "dusuk" ver. Dolandırıcılık, birinin senden kodu PAYLAŞMANI/GİRMENİ istemesi ya da koda link/aciliyet eşlik etmesidir.
SADECE şu JSON: {"risk":"yuksek|orta|dusuk","gerekce":"1-2 cümle sade neden","taktikler":["aciliyet","otorite taklidi",...]}. Türkçe.`;
    const j = await geminiJson<{ risk?: string; gerekce?: string; taktikler?: string[] }>(sistem, metin.slice(0, 2000));
    if (j && (j.risk === "yuksek" || j.risk === "orta" || j.risk === "dusuk")) {
      return {
        risk: j.risk,
        gerekce: String(j.gerekce || "").slice(0, 300),
        taktikler: Array.isArray(j.taktikler) ? j.taktikler.slice(0, 6).map((x) => String(x).slice(0, 40)) : [],
        ai: true,
      };
    }
  }
  const { kategori, guven } = siniflandir(metin, g);
  const risk: MesajYorum["risk"] =
    kategori !== "diger" && guven === "yüksek" ? "yuksek" : kategori !== "diger" && guven !== "yok" ? "orta" : "dusuk";
  return { risk, gerekce: "", taktikler: [], ai: false };
}

// --- AI olmadan kural tabanlı rehber (yedek) ---
function yedekAnaliz(metin: string, zorunlu?: Kategori): Analiz {
  const gostergeler = gostergeCikar(metin);
  const otomatik = siniflandir(metin, gostergeler);
  const kategori = zorunlu ?? otomatik.kategori;
  const guven = zorunlu ? "yüksek" : otomatik.guven;
  const kurumlar =
    kategori === "dolandiricilik"
      ? ["İlgili banka", "ihbarweb (USOM)"]
      : kategori === "yasa_disi"
      ? ["ihbarweb (USOM)", "BTK"]
      : ["Cumhuriyet Savcılığı", "ihbarweb (USOM)"];
  const adimlar: Adim[] = [
    { baslik: "Kanıtları sakla", aciklama: "Ekran görüntüsü, mesaj ve linkleri sil­meden sakla." },
    kategori === "dolandiricilik"
      ? { baslik: "Bankana ulaş", aciklama: "Vakit kaybetmeden bankanı arayıp işlemi bildir; karşı hesabın bloke edilmesini iste." }
      : { baslik: "Platforma bildir", aciklama: "İçeriği barındıran platforma şikayet et." },
    { baslik: "Resmi ihbar", aciklama: "ihbarweb.org.tr üzerinden resmi ihbarını oluştur." },
  ];
  return {
    kategori,
    kategoriAdi: KATEGORI_ADI[kategori],
    ozet: metin.slice(0, 140),
    gostergeler,
    kurumlar,
    adimlar,
    guven,
    aiIleUretildi: false,
  };
}

const SISTEM_PROMPT = `Sen Türkiye'de vatandaşlara siber olaylarda yol gösteren bir asistansın.
Kullanıcının anlattığı olayı analiz et ve SADECE geçerli JSON döndür (başka metin yok):
{
  "kategori": "dolandiricilik|sahte_hesap|tehdit|hakaret|yasa_disi|diger",
  "ozet": "olayın 1 cümlelik özeti",
  "kurumlar": ["başvurulacak kurum(lar)"],
  "adimlar": [{"baslik":"kısa başlık","aciklama":"kullanıcının atması gereken somut adım"}]
}
Kurallar: 3-5 adım ver. Somut ve Türkiye'ye uygun ol (ihbarweb, banka, savcılık, BTK, platform).
Asla "paranı geri alırız" gibi garanti verme; sadece yol göster. Resmi kurum DEĞİLİZ.
Can güvenliği/çocuk istismarı gibi acil durumda ilk adım 155/112 olsun.`;

// secilenKategori: kullanıcı suç türünü ELLE seçtiyse (hakaret/bahis…) o
// AUTORİTEDİR — AI/kural sınıflamasını ezer.
export async function analizEt(metin: string, secilenKategori?: string): Promise<Analiz> {
  const zorunlu: Kategori | undefined =
    secilenKategori && secilenKategori in KATEGORI_ADI ? (secilenKategori as Kategori) : undefined;
  const gostergeler = gostergeCikar(metin);

  if (geminiVarMi) {
    const ek = zorunlu
      ? `\nKullanıcı bu olayı ZATEN "${KATEGORI_ADI[zorunlu]}" olarak işaretledi; kategoriyi buna göre değerlendir ama adım/kurumları olaya özgü ver.`
      : "";
    const j = await geminiJson<{ kategori?: string; ozet?: string; kurumlar?: string[]; adimlar?: Adim[] }>(
      SISTEM_PROMPT + ek,
      metin
    );
    if (j) {
      const kategori: Kategori = zorunlu ?? (j.kategori && j.kategori in KATEGORI_ADI ? (j.kategori as Kategori) : "diger");
      return {
        kategori,
        kategoriAdi: KATEGORI_ADI[kategori],
        ozet: j.ozet ?? metin.slice(0, 140),
        gostergeler,
        kurumlar: Array.isArray(j.kurumlar) ? j.kurumlar : [],
        adimlar: Array.isArray(j.adimlar) && j.adimlar.length ? j.adimlar : [],
        guven: "yüksek",
        aiIleUretildi: true,
      };
    }
  }
  return yedekAnaliz(metin, zorunlu);
}

export { KATEGORI_ADI };
