// Marka Taklit Avcısı — korunan markalar. CertStream'den gelen yeni sertifikaların
// domainleri bu anahtarlarla eşleşirse ADAY olur; resmî domainler hariç tutulur.
// anahtar: domainde aranan kelime (>=4 harf — kısa kelime gürültü yapar).
// resmi: markanın GERÇEK domainleri (bunlar aday sayılmaz).

// kaliplari: anahtara EK tarama kalıpları (açılım/eş-ad). Örn. TOKİ hem "toki" hem "toplukonutidaresi"
// ile taklit edilir. Uzun açılım kalıpları ayırt edicidir (FP yapmaz); kısa kısaltma (toki) sıkı-bağlama tabi.
// yaygin: anahtar aynı zamanda yabancı yaygın kelime / coğrafi ad (pegasus=mitoloji, santander=şehir,
// iberia=yarımada, albaraka=Arapça bereket, correos=İsp. posta) → o ülkedeki meşru işletmeleri yakalar.
// İşaretli markalar, kısa anahtarlar gibi SIKI-BAĞLAM kapısına tabi (riskli TLD veya phishing bağlamı şart).
export type KorunanMarka = { anahtar: string; ad: string; resmi: string[]; kaliplari?: string[]; yaygin?: boolean; logo?: string };

// TEK KAYNAK: hem CertStream avcısı hem domainOsint (typosquatting + favicon
// karşılaştırması) bu listeyi kullanır. Böylece her korunan marka için favicon
// birebir-kopya tespiti çalışır.
export const KORUNAN_MARKALAR: KorunanMarka[] = [
  { anahtar: "garanti", ad: "Garanti BBVA", resmi: ["garanti.com.tr", "garantibbva.com.tr"], yaygin: true },
  { anahtar: "ziraat", ad: "Ziraat Bankası", resmi: ["ziraatbank.com.tr", "ziraat.com.tr"] },
  { anahtar: "akbank", ad: "Akbank", resmi: ["akbank.com"] },
  { anahtar: "isbank", ad: "İş Bankası", resmi: ["isbank.com.tr", "isbankasi.com.tr"] },
  { anahtar: "yapikredi", ad: "Yapı Kredi", resmi: ["yapikredi.com.tr"] },
  { anahtar: "vakifbank", ad: "Vakıfbank", resmi: ["vakifbank.com.tr"] },
  { anahtar: "halkbank", ad: "Halkbank", resmi: ["halkbank.com.tr", "halkbank.com"] },
  { anahtar: "denizbank", ad: "Denizbank", resmi: ["denizbank.com"] },
  { anahtar: "kuveytturk", ad: "Kuveyt Türk", resmi: ["kuveytturk.com.tr"] },
  { anahtar: "finansbank", ad: "QNB Finansbank", resmi: ["qnb.com.tr", "qnbfinansbank.com", "qnbfinansbank.com.tr"] },
  { anahtar: "sekerbank", ad: "Şekerbank", resmi: ["sekerbank.com.tr"] },
  { anahtar: "hsbc", ad: "HSBC Türkiye", resmi: ["hsbc.com.tr"] },
  { anahtar: "albaraka", ad: "Albaraka Türk", resmi: ["albaraka.com.tr", "albarakaturk.com.tr"], yaygin: true },
  { anahtar: "turkiyefinans", ad: "Türkiye Finans", resmi: ["turkiyefinans.com.tr"] },
  { anahtar: "ziraatkatilim", ad: "Ziraat Katılım", resmi: ["ziraatkatilim.com.tr"] },
  { anahtar: "vakifkatilim", ad: "Vakıf Katılım", resmi: ["vakifkatilim.com.tr"] },
  { anahtar: "fibabanka", ad: "Fibabanka", resmi: ["fibabanka.com.tr"] },
  { anahtar: "odeabank", ad: "Odeabank", resmi: ["odeabank.com.tr"] },
  { anahtar: "anadolubank", ad: "Anadolubank", resmi: ["anadolubank.com.tr"] },
  { anahtar: "alternatifbank", ad: "Alternatif Bank", resmi: ["alternatifbank.com.tr", "abank.com.tr"] },
  { anahtar: "burganbank", ad: "Burgan Bank", resmi: ["burgan.com.tr"] },
  { anahtar: "icbc", ad: "ICBC Turkey", resmi: ["icbc.com.tr"] },
  { anahtar: "aktifbank", ad: "Aktif Bank", resmi: ["aktifbank.com.tr", "nkolay.com"] },
  { anahtar: "papara", ad: "Papara", resmi: ["papara.com"] },
  { anahtar: "enpara", ad: "Enpara", resmi: ["enpara.com"] },
  { anahtar: "trendyol", ad: "Trendyol", resmi: ["trendyol.com", "trendyolmilla.com"] },
  { anahtar: "hepsiburada", ad: "Hepsiburada", resmi: ["hepsiburada.com"] },
  { anahtar: "sahibinden", ad: "Sahibinden", resmi: ["sahibinden.com"] },
  { anahtar: "turkcell", ad: "Turkcell", resmi: ["turkcell.com.tr"] },
  { anahtar: "vodafone", ad: "Vodafone", resmi: ["vodafone.com.tr"] },
  { anahtar: "turktelekom", ad: "Türk Telekom", resmi: ["turktelekom.com.tr"] },
  { anahtar: "telefonica", ad: "Telefónica", resmi: ["telefonica.com", "telefonica.es"], yaygin: true },
  // İspanya — bankalar, enerji, perakende, havayolu, kamu kurumları
  { anahtar: "santander", ad: "Banco Santander", resmi: ["santander.com", "bancosantander.es"], yaygin: true },
  { anahtar: "bbva", ad: "BBVA", resmi: ["bbva.com", "bbva.es"] },
  { anahtar: "caixabank", ad: "CaixaBank", resmi: ["caixabank.es", "caixabank.com"] },
  { anahtar: "sabadell", ad: "Banco Sabadell", resmi: ["bancsabadell.com", "bancosabadell.es"], yaygin: true },
  { anahtar: "bankinter", ad: "Bankinter", resmi: ["bankinter.com"] },
  { anahtar: "bancoespana", ad: "Banco de España", resmi: ["bde.es"] },
  { anahtar: "iberdrola", ad: "Iberdrola", resmi: ["iberdrola.es", "iberdrola.com"] },
  { anahtar: "repsol", ad: "Repsol", resmi: ["repsol.com", "repsol.es"] },
  { anahtar: "endesa", ad: "Endesa", resmi: ["endesa.com", "endesa.es"] },
  { anahtar: "inditex", ad: "Inditex", resmi: ["inditex.com"] },
  { anahtar: "mercadona", ad: "Mercadona", resmi: ["mercadona.es"] },
  { anahtar: "iberia", ad: "Iberia", resmi: ["iberia.com"], yaygin: true },
  { anahtar: "movistar", ad: "Movistar", resmi: ["movistar.es", "movistar.com"], yaygin: true },
  { anahtar: "correos", ad: "Correos", resmi: ["correos.es"], yaygin: true },
  { anahtar: "agenciatributaria", ad: "Agencia Tributaria", resmi: ["agenciatributaria.gob.es", "agenciatributaria.es"] },
  { anahtar: "pttavm", ad: "PTT AVM", resmi: ["pttavm.com"] },
  { anahtar: "edevlet", ad: "e-Devlet", resmi: ["turkiye.gov.tr"] },
  { anahtar: "tcmb", ad: "TCMB (Merkez Bankası)", resmi: ["tcmb.gov.tr"] },
  { anahtar: "ilbank", ad: "İLBANK (İller Bankası)", resmi: ["ilbank.gov.tr"] },
  // Türkiye Varlık Fonu — kısaltma "tvf" 3 harf (taranamaz/gürültü), o yüzden UZUN hali taranır:
  // "turkiyevarlikfonu" + "varlikfonu" kalıbı. Kısa hali resmî domain (tvf.com.tr) + marka adında.
  // Yatırım/hisse/başvuru dolandırıcılıkları fonu taklit eder. (turkiyevarlikfonu.com.tr çözülmüyor.)
  // Kapsam: glued (varlikfonu) + tire-ayrık (varlik-fonu = "türkiye varlık fonu" domain hali) + kısaltma (tvf).
  // "tvf" 3 harf ama sınır+sıkı-bağlam kapılı: yalnız SINIRLI token + riskli TLD/bağlamda eşleşir
  // (tvf-yatirim.xyz ✓; "sportvf" gibi kelime-içi eşleşme YOK) → gürültü sınırlı.
  { anahtar: "turkiyevarlikfonu", ad: "Türkiye Varlık Fonu (TVF)", resmi: ["tvf.com.tr"], kaliplari: ["varlikfonu", "varlik-fonu", "tvf"] },
  { anahtar: "aselsan", ad: "ASELSAN", resmi: ["aselsan.com", "aselsan.com.tr"] },
  { anahtar: "tusas", ad: "TUSAŞ (Türk Havacılık ve Uzay Sanayii)", resmi: ["tusas.com", "tusas.com.tr"] },
  { anahtar: "baykar", ad: "Baykar", resmi: ["baykartech.com"] },
  { anahtar: "roketsan", ad: "Roketsan", resmi: ["roketsan.com.tr"] },
  // ── Savunma sanayii firmaları ──
  { anahtar: "havelsan", ad: "HAVELSAN", resmi: ["havelsan.com.tr"] },
  { anahtar: "otokar", ad: "Otokar", resmi: ["otokar.com.tr"] },
  { anahtar: "fnss", ad: "FNSS Savunma Sistemleri", resmi: ["fnss.com.tr"] },
  { anahtar: "nurolmakina", ad: "Nurol Makina", resmi: ["nurolmakina.com.tr"] },
  { anahtar: "meteksan", ad: "Meteksan Savunma", resmi: ["meteksan.com"] },
  { anahtar: "sarsilmaz", ad: "Sarsılmaz", resmi: ["sarsilmaz.com"] },
  { anahtar: "canik", ad: "Canik (Samsun Yurt Savunma)", resmi: ["canik.com.tr"] },
  { anahtar: "katmerciler", ad: "Katmerciler", resmi: ["katmerciler.com.tr"] },
  { anahtar: "transvaro", ad: "Transvaro", resmi: ["transvaro.com.tr"], yaygin: true },
  { anahtar: "milsoft", ad: "MilSOFT", resmi: ["milsoft.com.tr"] },
  { anahtar: "savronik", ad: "Savronik", resmi: ["savronik.com.tr"] },
  { anahtar: "dearsan", ad: "Dearsan Tersanesi", resmi: ["dearsan.com"], yaygin: true }, // "dearsan" → "dear san(ta claus)" içinde geçiyor → yaygın
  { anahtar: "kalearge", ad: "Kale Arge", resmi: ["kalearge.com.tr"] },
  { anahtar: "altinay", ad: "Altınay Savunma", resmi: ["altinay.com"] },
  { anahtar: "repkon", ad: "Repkon", resmi: ["repkon.com.tr"] },
  { anahtar: "ayesas", ad: "Ayesaş", resmi: ["ayesas.com"] },
  { anahtar: "yoncaonuk", ad: "Yonca-Onuk Tersanesi", resmi: ["yoncaonuk.com"] },
  { anahtar: "ctech", ad: "C2TECH", resmi: ["ctech.com.tr"] },
  { anahtar: "fergani", ad: "Fergani Uzay", resmi: ["fergani.co"] },
  { anahtar: "bites", ad: "BİTES", resmi: ["bites.com.tr"], yaygin: true }, // "bites"=İng. lokma/atıştırma (better-bites, snack-bites) → yaygın kelime
  { anahtar: "vestelsavunma", ad: "Vestel Savunma", resmi: ["vesteldefence.com"] },
  { anahtar: "stm", ad: "STM Savunma", resmi: ["stm.com.tr"] },
  { anahtar: "tei", ad: "TEI (TUSAŞ Motor)", resmi: ["tei.com.tr"] },
  { anahtar: "mke", ad: "MKE", resmi: ["mke.gov.tr"] },
  // ── Hava yolu şirketleri ──
  { anahtar: "turkishairlines", ad: "Türk Hava Yolları (THY)", resmi: ["turkishairlines.com", "thy.com"] },
  { anahtar: "flypgs", ad: "Pegasus Hava Yolları", resmi: ["flypgs.com"] },
  { anahtar: "pegasus", ad: "Pegasus Hava Yolları", resmi: ["flypgs.com", "pegasusair.com"], yaygin: true },
  { anahtar: "anadolujet", ad: "AnadoluJet / AJet", resmi: ["anadolujet.com", "ajet.com"] },
  { anahtar: "sunexpress", ad: "SunExpress", resmi: ["sunexpress.com"] },
  { anahtar: "corendon", ad: "Corendon Airlines", resmi: ["corendonairlines.com"] },
  // freebird/southwind/tailwind: marka adları aynı zamanda yaygın İngilizce kelime (free bird / south
  // wind / tail wind = Tailwind CSS). yaygin → tire/riskli-TLD veya bağlam olmadan yakalamaz
  // (southwindsor-ct.gov, tailwindtech.ai, tailwindradar.com yanlış-pozitiflerini eler).
  { anahtar: "freebird", ad: "Freebird Airlines", resmi: ["freebirdairlines.com"], yaygin: true },
  { anahtar: "southwind", ad: "SouthWind Airlines", resmi: ["southwindairlines.com"], yaygin: true },
  { anahtar: "tailwind", ad: "Tailwind Airlines", resmi: ["tailwind.com.tr"], yaygin: true },
  { anahtar: "mngairlines", ad: "MNG Airlines", resmi: ["mngairlines.com"] },
  { anahtar: "qatarairways", ad: "Qatar Airways", resmi: ["qatarairways.com"], kaliplari: ["qatar-airways"] },
  { anahtar: "mirleon", ad: "Mirleon", resmi: ["mirleon.ai"] },
  { anahtar: "araskargo", ad: "Aras Kargo", resmi: ["araskargo.com.tr"] },
  { anahtar: "yurticikargo", ad: "Yurtiçi Kargo", resmi: ["yurticikargo.com"] },
  { anahtar: "ern", ad: "ERN Holding", resmi: ["ern.com.tr"] },
  { anahtar: "uyap", ad: "UYAP (Ulusal Yargı Ağı)", resmi: ["uyap.gov.tr", "vatandas.uyap.gov.tr", "adalet.gov.tr"] },
  // ── Yüksek yargı / adalet kurumları (dava/tebligat/ceza dolandırıcılığı bunları taklit eder) ──
  { anahtar: "anayasa", ad: "Anayasa Mahkemesi", resmi: ["anayasa.gov.tr"] },
  { anahtar: "danistay", ad: "Danıştay", resmi: ["danistay.gov.tr"] },
  { anahtar: "sayistay", ad: "Sayıştay", resmi: ["sayistay.gov.tr"] },
  // "adalet" yaygın kelime (justice) — hukuk bürosu/dernek/parti gibi meşru kullanımları FP yapmasın
  // diye yaygin: sıkı-bağlam (riskli TLD veya tebligat/dava/gov-etiket) şart.
  { anahtar: "adalet", ad: "Adalet Bakanlığı", resmi: ["adalet.gov.tr"], yaygin: true },
  { anahtar: "orphion", ad: "Orphion Pharma", resmi: ["orphionpharma.com"] },
  { anahtar: "etimaden", ad: "Eti Maden", resmi: ["etimaden.gov.tr"] },
  // ── Otomotiv / sanayi tedarikçileri ──
  // Beycelik Gestamp: Beycelik Holding (Bursa) × Gestamp (İspanya) ortak girişimi, otomotiv metal/şasi.
  // "beycelik" ayırt edici Türkçe kök (kalıp olarak eklenir); "gestamp" TEK BAŞINA eklenmez —
  // küresel İspanyol Gestamp'ı (gestamp.com) yanlış-pozitif yakalamamak için.
  { anahtar: "beycelikgestamp", ad: "Beycelik Gestamp", resmi: ["beycelikgestamp.com.tr", "beycelik.com.tr"], kaliplari: ["beycelik"] },
  // ── Konut / gayrimenkul (sıkça taklit edilir: sahte TOKİ/konut başvuru-çekiliş siteleri) ──
  { anahtar: "toki", ad: "TOKİ (Toplu Konut İdaresi)", resmi: ["toki.gov.tr"], kaliplari: ["toplukonutidaresi", "toplukonut", "konutidaresi"] },
  { anahtar: "emlakkonut", ad: "Emlak Konut GYO", resmi: ["emlakkonut.com.tr"] },
  { anahtar: "emlakyonetim", ad: "Emlak Yönetim", resmi: ["emlakyonetim.com.tr"] },
  { anahtar: "emlakkatilim", ad: "Emlak Katılım (Katılım Bankası)", resmi: ["emlakkatilim.com.tr"] },
  { anahtar: "sehircilik", ad: "Çevre, Şehircilik ve İklim Değişikliği Bakanlığı", resmi: ["csb.gov.tr"] },
  // ── Enerji ──
  // logo: favicon.ico BOŞ → Google favicon servisi küre döndürüyor; gerçek PNG favicon açıkça verilir.
  { anahtar: "enerjisa", ad: "Enerjisa", resmi: ["enerjisa.com.tr", "enerjisauretim.com.tr"], logo: "https://www.enerjisa.com.tr/assets/favicon/favicon_512x512.png" },
  // ── Perakende / sivil toplum / kamu ──
  { anahtar: "migros", ad: "Migros", resmi: ["migros.com.tr", "sanalmarket.com.tr"] },
  // "basil" yaygın kelime (fesleğen otu / Basil ismi — basilico, sweetbasil, basilica) → yaygin:
  // sınır kelime-içi eşleşmeyi zaten eler, ek olarak riskli TLD/bağlam şart (sağlıklı yemek markası).
  { anahtar: "basil", ad: "Basil (Sağlıklı Yemek)", resmi: ["basil.com.tr"], yaygin: true },
  { anahtar: "losev", ad: "LÖSEV (Lösemili Çocuklar Vakfı)", resmi: ["losev.org.tr"] },
  { anahtar: "diyanet", ad: "Diyanet İşleri Başkanlığı", resmi: ["diyanet.gov.tr"] },
  // Kültür ve Turizm Bakanlığı — anahtar "ktb" DEĞİL (3 harf → taranamaz/gürültü); ayırt edici
  // "kulturturizm" kalıbı. Resmî domainler doğrulandı: ktb.gov.tr + kulturturizm.gov.tr (ikincisi
  // ktb.gov.tr'ye yönleniyor). Müze bileti / turizm başvurusu dolandırıcılıkları bu bakanlığı taklit eder.
  { anahtar: "kulturturizm", ad: "Kültür ve Turizm Bakanlığı", resmi: ["ktb.gov.tr", "kulturturizm.gov.tr"] },
  // YTB — kısaltma "ytb" DEĞİL (3 harf → taranamaz/gürültü; sayısız domainde geçer). Ayırt edici
  // açılım kalıpları taranır: "yurtdisiturkler" + "akrabatopluluklar". Yurtdışı vatandaş başvuru /
  // burs / soydaş dolandırıcılıkları bu başkanlığı taklit eder. Resmî domain: ytb.gov.tr.
  { anahtar: "yurtdisiturkler", ad: "Yurtdışı Türkler ve Akraba Topluluklar Başkanlığı", resmi: ["ytb.gov.tr"], kaliplari: ["akrabatopluluklar", "yurtdisiturk"] },
];

// Marka logosu — resmî domainin faviconu (Google favicon servisi). Tüm markalar için
// otomatik + hep güncel; görsel gelmezse arayan taraf baş-harf avatarına düşer.
export function markaLogo(resmi: string | string[] | undefined | null, boyut = 128): string | null {
  const d = Array.isArray(resmi) ? resmi[0] : resmi;
  if (!d) return null;
  const host = String(d).replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  if (!host) return null;
  // Açık logo override — favicon servisinin başaramadığı markalar (ör. favicon.ico boş) için.
  const m = KORUNAN_MARKALAR.find((x) => x.logo && x.resmi.some((r) => r === host || host.endsWith("." + r) || r.endsWith("." + host)));
  if (m?.logo) return m.logo;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${boyut}`;
}

// Marka anahtarından logo (yalnız anahtar bilinen yerler için — kontrol tablosu vb.).
export function markaLogoAnahtar(anahtar: string, boyut = 128): string | null {
  const m = KORUNAN_MARKALAR.find((x) => x.anahtar === String(anahtar || "").toLowerCase());
  return m ? markaLogo(m.resmi, boyut) : null;
}

// ── KAMU KURUMLARI — içerik/logo taklidi tespiti için (özellikle sahte turizm/teşvik/
// yardım siteleri bakanlık isim+logolarını kullanır). "kelimeler" sayfa METNİNDE aranır;
// resmî .gov.tr adresi değilse ve içerikte kurum adı geçiyorsa → kurum taklidi.
export type KamuKurumu = { ad: string; kelimeler: string[]; resmi: string };
export const KAMU_KURUMLARI: KamuKurumu[] = [
  { ad: "Ticaret Bakanlığı", kelimeler: ["ticaret bakanlığı", "ticaret bakanligi", "t.c. ticaret bakanlığı", "gümrük ve ticaret"], resmi: "ticaret.gov.tr" },
  { ad: "Sağlık Bakanlığı", kelimeler: ["sağlık bakanlığı", "saglik bakanligi", "t.c. sağlık bakanlığı"], resmi: "saglik.gov.tr" },
  { ad: "İçişleri Bakanlığı", kelimeler: ["içişleri bakanlığı", "icisleri bakanligi"], resmi: "icisleri.gov.tr" },
  { ad: "Hazine ve Maliye Bakanlığı", kelimeler: ["hazine ve maliye", "maliye bakanlığı", "hazine bakanlığı"], resmi: "hmb.gov.tr" },
  { ad: "Aile ve Sosyal Hizmetler Bakanlığı", kelimeler: ["aile ve sosyal", "sosyal hizmetler bakanlığı", "sosyal yardım"], resmi: "aile.gov.tr" },
  { ad: "Sanayi ve Teknoloji Bakanlığı", kelimeler: ["sanayi ve teknoloji", "sanayi bakanlığı"], resmi: "sanayi.gov.tr" },
  { ad: "Kültür ve Turizm Bakanlığı", kelimeler: ["kültür ve turizm", "turizm bakanlığı", "kultur ve turizm"], resmi: "ktb.gov.tr" },
  { ad: "Tarım ve Orman Bakanlığı", kelimeler: ["tarım ve orman", "tarim ve orman", "tarım bakanlığı"], resmi: "tarimorman.gov.tr" },
  { ad: "Çalışma ve Sosyal Güvenlik Bakanlığı", kelimeler: ["çalışma ve sosyal güvenlik", "çalışma bakanlığı"], resmi: "csgb.gov.tr" },
  { ad: "e-Devlet Kapısı", kelimeler: ["e-devlet", "edevlet", "türkiye.gov.tr", "e-government"], resmi: "turkiye.gov.tr" },
  { ad: "SGK", kelimeler: ["sosyal güvenlik kurumu", "sgk", "sosyal guvenlik kurumu"], resmi: "sgk.gov.tr" },
  { ad: "Gelir İdaresi Başkanlığı", kelimeler: ["gelir idaresi", "gib", "vergi dairesi"], resmi: "gib.gov.tr" },
  { ad: "KOSGEB", kelimeler: ["kosgeb", "küçük ve orta ölçekli"], resmi: "kosgeb.gov.tr" },
  { ad: "İŞKUR", kelimeler: ["işkur", "türkiye iş kurumu", "iş kur"], resmi: "iskur.gov.tr" },
  { ad: "AFAD", kelimeler: ["afad", "afet ve acil durum"], resmi: "afad.gov.tr" },
  { ad: "Emniyet Genel Müdürlüğü", kelimeler: ["emniyet genel müdürlüğü", "türk polis", "polis akademisi"], resmi: "egm.gov.tr" },
  { ad: "USOM / Siber Güvenlik Başkanlığı", kelimeler: ["usom", "siber güvenlik başkanlığı", "ulusal siber"], resmi: "usom.gov.tr" },
  { ad: "TÜBİTAK", kelimeler: ["tübitak", "tubitak"], resmi: "tubitak.gov.tr" },
  { ad: "Cumhurbaşkanlığı", kelimeler: ["cumhurbaşkanlığı", "cumhurbaskanligi", "t.c. cumhurbaşkanlığı"], resmi: "tccb.gov.tr" },
  { ad: "UYAP / Adalet Bakanlığı", kelimeler: ["uyap", "ulusal yargı ağı", "ulusal yargi agi", "e-uyap", "adalet bakanlığı", "adalet bakanligi", "e-duruşma", "e-durusma"], resmi: "uyap.gov.tr" },
  { ad: "Savunma Sanayii Başkanlığı (SSB)", kelimeler: ["savunma sanayii başkanlığı", "savunma sanayi baskanligi", "ssb.gov.tr"], resmi: "ssb.gov.tr" },
  { ad: "Millî Savunma Bakanlığı", kelimeler: ["millî savunma bakanlığı", "milli savunma bakanligi", "msb.gov.tr", "genelkurmay"], resmi: "msb.gov.tr" },
];

// Kısa anahtarlar (ör. "ern", 3 harf) anahtar/substring bazlı eşleşmede gürültü yapar —
// "modern", "intern" gibi domainleri yanlışlıkla "taklit" sanır. Bu yüzden anahtar-bazlı
// işler (global avcı, urlscan taraması, typosquat, kampanya eşleştirmesi) yalnızca
// >=4 harfli anahtarları kullanır: AVCI_MARKALAR.
// Domain-bazlı işler (dropdown/abonelik/favicon/resmî-domain kontrolü) tam listeyi
// (KORUNAN_MARKALAR) kullanır — bunlar domaine özel olduğu için kısa anahtarda güvenli.
export const AVCI_MARKALAR: KorunanMarka[] = KORUNAN_MARKALAR.filter(
  (m) => m.anahtar.length >= 4
);

// Bir URL/domaini sade domaine indir (protokol/www/path/boşluk at).
export function domainSade(v: string): string {
  return String(v).toLowerCase().trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "");
}

// Domainden aranacak anahtar kelime (SLD). ör. ern.com.tr → "ern", garanti.com.tr → "garanti".
export function anahtarKok(domain: string): string {
  const d = domainSade(domain);
  return (d.split(".")[0] || "").replace(/[^a-z0-9]/g, "");
}

// ── GERÇEK TAKLİT SÜZGECİ (yanlış-pozitif önleme, eTLD+1 + kelime-sınırı) ─────
// "vodafone" adı geçen HER domaini değil, gerçekten o markanın TAKLİDİ olanları seç.
// Eler: markanın kendi domainleri (vodafone.com/.gr ve alt alanları), marka adını
// başka kelimenin içinde taşıyanlar (primegarantia, paparazzi, kennisbank, autogarantia).
const IKI_PARCA_SONEK = new Set(["com.tr", "net.tr", "org.tr", "gov.tr", "edu.tr", "co.uk", "org.uk", "com.ph", "org.ph", "net.ph", "gov.ph", "com.au", "co.jp", "com.br", "co.za", "com.mx", "com.tw", "co.in", "com.ec"]);
const TAKLIT_RISKLI_TLD = new Set(["xyz", "top", "tk", "buzz", "icu", "cyou", "rest", "monster", "click", "shop", "live", "online", "site", "vip", "club", "fun", "website", "space", "info", "biz", "sbs", "cfd", "help", "wiki", "quest", "store"]);

export function tescilliBilgi(host: string): { label: string; altAlan: boolean; tld: string } {
  const p = host.split(".");
  if (p.length < 2) return { label: p[0] || "", altAlan: false, tld: "" };
  const son2 = p.slice(-2).join(".");
  let tldParca = 2;
  if (p.length >= 3 && IKI_PARCA_SONEK.has(son2)) tldParca = 3;
  return { label: p[p.length - tldParca] || "", altAlan: p.length > tldParca, tld: p.slice(p.length - tldParca + 1).join(".") };
}

function sinirdaGecer(label: string, k: string): boolean {
  const i = label.indexOf(k);
  if (i < 0) return false;
  const onceki = i === 0 ? "" : label[i - 1];
  const solSinir = i === 0 || onceki === "-" || /[0-9]/.test(onceki);
  if (!solSinir) return false;
  const sonraki = label[i + k.length];
  const sagSinir = sonraki === undefined || sonraki === "-";
  if (k.length <= 6 && !sagSinir) return false;
  return true;
}

// Levenshtein (düzenleme) mesafesi — harf düşme/değişme/ekleme sayısı.
function duzenlemeMesafesi(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

function ortakOnek(a: string, b: string): number {
  let i = 0; const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i++;
  return i;
}
// Domainlerde sık görülen görsel-aldatan harf/rakam çiftleri (l↔1, o↔0, a↔4…). Erken
// konumda olsalar bile "marka gibi görünür"; guarani/abbank gibi farklı kelimeler taşımaz.
const GORSEL_CIFT: Record<string, string> = {
  "0": "o", o: "0", "1": "l", l: "1", i: "1", "5": "s", s: "5",
  "3": "e", e: "3", "4": "a", a: "4", "9": "g", g: "9", "6": "b", b: "6", "7": "t", t: "7", "2": "z", z: "2",
};
// Tek harflik yer-değiştirme görsel-aldatan bir çift mi? (turkce1l≈turkcell, 4kbank≈akbank)
function tekEditGorsel(label: string, k: string): boolean {
  if (label.length !== k.length) return false;
  let fark = -1;
  for (let i = 0; i < k.length; i++) if (label[i] !== k[i]) { if (fark >= 0) return false; fark = i; }
  return fark >= 0 && GORSEL_CIFT[k[fark]] === label[fark];
}

// Tescilli etiket, markaya harf-oyunuyla benziyor mu? (göz-aldatan typosquat: anadolumet≈anadolujet)
// FP DARALTMA: gerçek typosquat markanın başlangıç şeklini korur (≥3 ortak önek); farklı bir
// meşru kelime (guarani≈garanti, abbank≈akbank) baştan ayrışır → eşik-içi olsa da elenmeli.
// İstisna: erken konumda görsel-aldatan tek harf (4kbank≈akbank) yine typosquat sayılır.
function yakinTypo(label: string, k: string): boolean {
  if (k.length < 6) return false; // <6 harf edit-distance FP üretir: 5-harf anahtar yaygın kelimeye 1-yakın olur (losev↔loser, canik↔canim) → typo yalnız ≥6 harf
  const esik = k.length >= 7 ? 2 : 1;
  if (Math.abs(label.length - k.length) > esik) return false;
  const d = duzenlemeMesafesi(label, k);
  if (d === 0 || d > esik) return false;
  // ≥4 ortak önek: klasik typosquat başlangıcı korur (aselan↔aselsan=4, turkcel↔turkcell=7).
  // Eşik 3→4: yalnız 3-harf önek paylaşan FARKLI kelimeleri eler (diyet↔diyanet, burnbank↔burganbank,
  // halalbank↔halkbank — hepsi 3 ortak önek → artık typosquat sayılmaz).
  if (ortakOnek(label, k) >= 4) return true;
  if (esik === 1 && d === 1 && tekEditGorsel(label, k)) return true; // erken ama görsel-aldatan
  return false;
}

// domain, verilen marka anahtarının GERÇEK taklidi mi? (kendi domaini/kelime-içi değil)
// KISA (≤4 harf) anahtarların yaygın-dizge FP'sini süzmek için bağlam: gerçek taklit domaini
// Türkçe konut/finans/resmî ya da phishing kelimesi taşır; meşru yabancı site (ibis-toki.co.jp,
// hoikuen-toki, eyelash-salon-toki) taşımaz. Ek sinyal = bu bağlam VEYA riskli TLD.
// "gov" SADECE ETİKET İÇİNDE (sahte token: -gov, gov-, govtr, gov.tr) yakalanır; MEŞRU ".gov"
// TLD'si (southwindsor-ct.gov = ABD belediyesi) tetiklemez. Türk devlet/adli phishing'i (uyap-gov.com,
// vatandas-uyap-gov.com) bu sayede yakalanır. Türkçe resmî/adli bağlam kelimeleri de eklendi
// (vatandas/tebligat/mahkeme/adalet/evrak/dava/icra/vergi) — UYAP/GİB/adalet taklidi recall'ı için.
const TR_BAGLAM = /proje|konut|basvuru|basvur|kampanya|cekilis|kura|tapu|daire|kredi|resmi|giris|destek|musteri|hesap|odeme|randevu|evim|bakanlik|idare|sorgu|login|secure|verify|account|onlin|bank|card|kart|mobil|wallet|\bpay\b|\btc\b|bilet|ucus|ucak|rezervasyon|seyahat|checkin|acceso|banca|cliente|particular|premi|bonus|hediye|-gov|gov-|govtr|gov\.tr|vatandas|tebligat|mahkeme|adalet|evrak|dava|icra|vergi/;

// Tek bir kalıp için taklit kontrolü (mevcut mantık + SIKI-BAĞLAM kapısı: kısa anahtar veya yaygın-kelime).
function taklitKalip(d: string, k: string, yaygin?: boolean): boolean {
  const { label, altAlan, tld } = tescilliBilgi(d);
  const riskliTld = TAKLIT_RISKLI_TLD.has(tld) || TAKLIT_RISKLI_TLD.has(tld.split(".").pop() || "");
  // Bağlam sinyali YALNIZ tescilli alanda (label+tld) aransın — rastgele alt-alan (account., eu-login.)
  // meşru siteyi (pegasusnest.com, garantisjekk.no) phishing gibi göstermesin. Saldırgan tescilli
  // domaini seçer; alt-alan meşru sahibin kontrolündedir → oradaki "login/account" sinyal sayılmaz.
  const kayitliAlan = tld ? `${label}.${tld}` : label;
  const baglamVar = riskliTld || TR_BAGLAM.test(kayitliAlan);
  if (label === k) return !altAlan && riskliTld; // kendi domaini/alt alanı değil, sadece garanti.xyz gibi
  if (label.includes(k) && sinirdaGecer(label, k)) {
    // SIKI-BAĞLAM: KISA ANAHTAR (≤4, toki/hsbc) VEYA YAYGIN-KELİME marka (garanti/tailwind/pegasus)
    // tire-sınırlı/bitişik içermede meşru yabancı işletmeleri yakalar (ibis-toki, garantisjekk) →
    // tek başına yetmez, ek sinyal şart: riskli TLD VEYA tescilli alanda phishing/Türkçe bağlamı.
    if ((k.length <= 4 || yaygin) && !baglamVar) return false;
    return true;
  }
  // Harf-oyunu typosquat (anadolumet, aselan, turkcel…) — alt-dize DEĞİL ama çok benziyor.
  // YAYGIN markada typo eşleşmesine de bağlam kapısı: transvaro↔transparo/transpar (ayrı gerçek
  // şirketler, yabancı TLD) yanlış-pozitifini eler; gerçek typosquat riskli TLD/bağlam taşır.
  if (yakinTypo(label, k)) {
    if (yaygin && !baglamVar) return false;
    return true;
  }
  return false;
}

export function gercekTaklit(domain: string, anahtar: string): boolean {
  const d = domainSade(domain);
  const k0 = String(anahtar || "").toLowerCase();
  if (!k0 || k0.length < 4 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return false;
  // Markanın TÜM kalıplarını dene (anahtar + açılım kalıpları: toki + toplukonutidaresi…).
  const marka = KORUNAN_MARKALAR.find((m) => m.anahtar === k0);
  // RESMÎ DOMAIN ASLA TAKLİT DEĞİL (kendi + alt-alanları). Aksi halde tire-ayrık kalıp (qatar-airways),
  // resmî glued domaine (qatarairways.com) yakinTypo ile 1-yakın olup kendi sitesini "sahte" damgalar.
  if (marka && resmiListedeMi(d, marka.resmi)) return false;
  const kaliplar = marka ? [marka.anahtar, ...(marka.kaliplari || [])] : [k0];
  // Taban 3: 3-harf kalıp (ör. "tvf") sınır (bounded token) + sıkı-bağlam (riskli TLD/TR bağlam)
  // kapılarından geçmek zorunda → gürültü sınırlı; yalnız açıkça eklenen 3-harf kalıplar etkilenir.
  return kaliplar.some((k) => k.length >= 3 && taklitKalip(d, k, marka?.yaygin));
}

// Bir domain, verilen resmî listede mi? (allowlist kontrolü — kendi/alt-alan adları dahil)
export function resmiListedeMi(domain: string, resmi: string[]): boolean {
  const d = domainSade(domain);
  return resmi.some((r) => {
    const rr = domainSade(r);
    return d === rr || d.endsWith("." + rr);
  });
}

// Bir domain resmî mi (bu markanın gerçek adresi mi)?
export function resmiMarkaDomaini(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  return KORUNAN_MARKALAR.some((m) => m.resmi.some((r) => d === r || d.endsWith("." + r)));
}
