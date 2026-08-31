// Teknik OSINT sinyallerini SADE, insanca, detaylı bir değerlendirmeye çevirir.
// AI (Claude) anahtarı yoksa/başarısızsa bu kullanılır — yani rapor her hâlükârda zengin olur.

import type { OsintRapor } from "./osint";

export type Anlati = {
  ozet: string; // tek cümle net sonuç
  yorum: string; // 2-4 cümle insanca açıklama
  neden: string[]; // "neden böyle değerlendirdik" — sade gerekçeler
  adimlar: string[]; // ne yapmalı
  icerikTuru?: string; // AI'ın belirlediği içerik türü (ör. "Haber sitesi")
  ai: boolean;
};

function alan(r: OsintRapor, ad: string): string | undefined {
  return r.alanlar.find((a) => a.ad === ad)?.deger;
}

// Büyük/kurumsal tescil firmaları (iyi işaret)
const KURUMSAL_TESCIL = ["markmonitor", "csc", "cloudflare", "gandi", "google", "amazon", "godaddy", "com laude", "nom-iq"];
// Büyük/meşru barındırma sağlayıcıları
const BUYUK_HOSTING = ["google", "amazon", "microsoft", "cloudflare", "akamai", "fastly", "digitalocean", "hetzner", "ovh"];

function yilMetni(gun: number): string {
  const yil = gun / 365;
  if (yil >= 1) return `${yil.toFixed(1).replace(".0", "")} yıl`;
  const ay = Math.round(gun / 30);
  return `${ay} ay`;
}

function urlYorum(r: OsintRapor, seviye: string): Anlati {
  const olumlu: string[] = [];
  const olumsuz: string[] = [];

  // Domain yaşı
  const yasStr = alan(r, "Domain yaşı");
  const yasGun = yasStr ? parseInt(yasStr) : NaN;
  if (!isNaN(yasGun)) {
    if (yasGun >= 730)
      olumlu.push(`Alan adı ${yilMetni(yasGun)}dır kayıtlı — köklü siteler böyledir; dolandırıcılık siteleri ise genelde günlük/haftalıktır.`);
    else if (yasGun >= 180)
      olumlu.push(`Alan adı birkaç aydır yayında (${yasGun} gün) — taze ama "dün kurulmuş" değil.`);
    else if (yasGun >= 90)
      olumsuz.push(`Alan adı nispeten yeni (${yasGun} gün) — tek başına kötü değil ama temkin gerektirir.`);
    // 90 günden yeniler zaten bulgular'da kırmızı olarak var
  }

  // VirusTotal — uyarı durumunu r.bulgular zaten içeriyor (mükerrer eklemeyelim);
  // burada yalnızca "temiz" olumlu sinyalini ekle.
  const vt = alan(r, "VirusTotal");
  if (vt === "Temiz") olumlu.push("VirusTotal'daki onlarca güvenlik firmasının hiçbiri bu adresi zararlı bulmadı.");

  // HTTPS
  if (alan(r, "Güvenli bağlantı")) olumlu.push("Bağlantı şifreli (HTTPS) — aktarılan veri korunuyor. (HTTPS tek başına 'güvenli' anlamına gelmez.)");

  // Barındırma / tescil firması
  const host = (alan(r, "Barındırma") || "").toLowerCase();
  if (BUYUK_HOSTING.some((h) => host.includes(h)))
    olumlu.push(`Site büyük ve meşru bir altyapıda barınıyor (${alan(r, "Barındırma")}).`);
  const tescil = (alan(r, "Kayıt firması") || "").toLowerCase();
  if (KURUMSAL_TESCIL.some((t) => tescil.includes(t)))
    olumlu.push(`Alan adı kurumsal bir tescil firması (${alan(r, "Kayıt firması")}) üzerinden kayıtlı — büyük markaların tercih ettiği türden.`);

  // Bulgular (zaten insanca yazılı risk gözlemleri) olumsuza eklenir
  for (const b of r.bulgular) if (!olumsuz.includes(b)) olumsuz.push(b);

  const neden = [...olumsuz, ...olumlu];

  let ozet: string, yorum: string, adimlar: string[];
  if (seviye === "Yüksek") {
    ozet = "Bunu söylemek istemezdim ama bu adres bana hiç güven vermedi. Lütfen işlem yapma, bilgi girme — sakin ol, sen doğru yerde durdun.";
    yorum =
      "İncelediğim kaynaklarda ciddi risk işaretleri gördüm. " +
      (olumsuz[0] || "") +
      " Bu tür siteler insanı acele ettirip kart/kişisel bilgi ya da ödeme almaya çalışır. Merak etme, birlikte doğru adımı atalım.";
    adimlar = [
      "Kart, şifre veya kimlik bilgisi GİRME; ödeme yapma.",
      "Bağlantıya tıkladıysan hesap şifreni değiştir, tarayıcı geçmişini temizle.",
      "Aynı mesajı başkasına iletme; şüpheliyse ihbarweb.org.tr'ye bildir.",
    ];
  } else if (seviye === "Orta") {
    ozet = "Kesin bir şey diyemiyorum ama birkaç nokta içimi tam rahatlatmadı — biraz temkinli olalım, olur mu?";
    yorum =
      "Bazı sinyaller güzel görünüyor, bazıları ufak soru işareti bırakıyor. " +
      (olumsuz[0] ? olumsuz[0] + " " : "") +
      "Acelesi yok; emin olmadan hassas bir işlem (ödeme, giriş, bilgi paylaşımı) yapmayalım. Ben buradayım.";
    adimlar = [
      "Adres çubuğundaki alan adını harf harf kontrol et (taklit olabilir).",
      "Bir isteğe (ödeme/kod/bilgi) eşlik ediyorsa, kurumu resmi kanalından ayrıca doğrula.",
      "Şüphen sürüyorsa kart/şifre girme.",
    ];
  } else if (olumsuz.length > 0) {
    // Genel skor düşük AMA en az bir olumsuz bulgu var → "tehlike yok" DEME (çelişki olur).
    ozet = "Genel olarak iyi görünüyor, sadece küçük bir notum var — birlikte dikkat edelim.";
    yorum =
      "İncelediğim kaynaklarda genel risk düşük çıktı, bu güzel. Yalnız şunu atlamayalım: " +
      olumsuz[0] +
      " Giriş/ödeme yapacaksan adrese bir kez daha bakman yeter; endişelenecek bir şey yok.";
    adimlar = [
      "Bu adreste kart/şifre girmeden önce kurumu resmi kanalından doğrula.",
      "Bir linkten geldiysen, kurumun resmi sitesini elle yazarak da kontrol et.",
    ];
  } else {
    ozet = "İyi haber — burada seni endişelendirecek belirgin bir tehlike görmedim, rahat olabilirsin.";
    yorum =
      "İncelediğim açık kaynaklarda bu adres için belirgin bir tehlike çıkmadı. " +
      (olumlu[0] ? olumlu[0] + " " : "") +
      "Yine de hiçbir kontrol %100 değil; giriş/ödeme yapacaksan adrese şöyle bir göz atman yeterli. Merak etme, iyi gidiyorsun.";
    adimlar = [
      "Giriş/ödeme yapacaksan adres çubuğundaki alan adının doğru yazıldığından emin ol.",
      "Sana ulaşan bir linkten geldiysen, kurumun resmi sitesini elle yazarak da kontrol et.",
    ];
  }

  return { ozet, yorum, neden, adimlar, ai: false };
}

function telefonYorum(r: OsintRapor, seviye: string): Anlati {
  const op = alan(r, "Operatör (tahsis)");
  const neden: string[] = [];
  if (op && op !== "Bilinmiyor") neden.push(`Numara ${op} serisine tahsisli görünüyor (taşıma nedeniyle güncel operatör farklı olabilir).`);
  for (const b of r.bulgular) neden.push(b);

  let ozet: string, yorum: string;
  if (seviye === "Yüksek") {
    ozet = "Bu numara topluluk/listelerde dolandırıcılıkla ilişkilendirilmiş — açma, geri arama.";
    yorum = "Numara hakkında olumsuz sinyaller var. Bilinmeyen numaralar banka/kurum taklidi yapıp acele ettirir; kişisel bilgi ister.";
  } else if (seviye === "Orta") {
    ozet = "Numara hakkında birkaç şüpheli işaret var — dikkatli ol.";
    yorum = "Kesin bir hüküm yok ama temkinli olmakta fayda var. Seni arayıp bilgi/kod isteyen kimseye güvenme.";
  } else {
    ozet = "Bu numara hakkında seni endişelendirecek bir şey görmedim — rahat olabilirsin.";
    yorum = "Elimdeki açık kaynaklarda bu numara için belirgin bir dolandırıcılık işareti yok. Yine de tanımadığın numaralara karşı hep birlikte dikkatli olalım.";
  }
  const adimlar = [
    "Banka/kurum olduğunu söyleyip şifre, OTP kodu veya kart bilgisi isteyen kimseye VERME.",
    "Kendini doğrulamak için kurumun resmi çağrı merkezini SEN ara.",
    "Rahatsız ediyorsa numarayı engelle; dolandırıcılıksa ihbarweb.org.tr'ye bildir.",
  ];
  return { ozet, yorum, neden, adimlar, ai: false };
}

function ibanYorum(r: OsintRapor, seviye: string): Anlati {
  const banka = alan(r, "Banka");
  const gecerli = alan(r, "Geçerlilik");
  const neden: string[] = [];
  if (gecerli) neden.push(`IBAN biçimi: ${gecerli}.`);
  if (banka) neden.push(`Hesap bankası: ${banka}.`);
  for (const b of r.bulgular) neden.push(b);

  let ozet: string, yorum: string;
  if (seviye === "Yüksek") {
    ozet = "Bu IBAN dolandırıcılıkla ilişkilendirilmiş — bu hesaba ödeme YAPMA.";
    yorum = "IBAN hakkında olumsuz sinyaller var. Tanımadığın birine ait hesaba yapılan ödemelerin geri dönüşü çok zordur.";
  } else if (seviye === "Orta") {
    ozet = "IBAN hakkında birkaç şüpheli işaret var — temkinli ol.";
    yorum = "Kesin değil ama dikkatli olmakta fayda var. Ödeme yapmadan önce karşı tarafı bağımsız bir kanaldan doğrula.";
  } else {
    ozet = "Bu IBAN hakkında seni endişelendirecek bir şey görmedim — ama yine de birlikte dikkatli olalım.";
    yorum = "Elimdeki açık kaynaklarda bu IBAN için belirgin bir dolandırıcılık işareti yok. Yalnız tanımadığın kişilere kapora/ön ödeme yapmaktan kaçınman en güvenlisi.";
  }
  const adimlar = [
    "Tanımadığın kişiye/hesaba ön ödeme, kapora veya 'iade' bahanesiyle para gönderme.",
    "Ürün/hizmet gerçekse, mümkünse kapıda ödeme veya güvenli ödeme yöntemi tercih et.",
    "Dolandırıldıysan bankanı hemen ara + Cumhuriyet Savcılığı/ihbarweb.org.tr'ye başvur.",
  ];
  return { ozet, yorum, neden, adimlar, ai: false };
}

export function insanYorum(r: OsintRapor, seviye: string): Anlati {
  if (r.tip === "telefon") return telefonYorum(r, seviye);
  if (r.tip === "iban") return ibanYorum(r, seviye);
  return urlYorum(r, seviye);
}
