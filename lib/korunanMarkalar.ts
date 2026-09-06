// Marka Taklit Avcısı — korunan markalar. CertStream'den gelen yeni sertifikaların
// domainleri bu anahtarlarla eşleşirse ADAY olur; resmî domainler hariç tutulur.
// anahtar: domainde aranan kelime (>=4 harf — kısa kelime gürültü yapar).
// resmi: markanın GERÇEK domainleri (bunlar aday sayılmaz).

export type KorunanMarka = { anahtar: string; ad: string; resmi: string[] };

// TEK KAYNAK: hem CertStream avcısı hem domainOsint (typosquatting + favicon
// karşılaştırması) bu listeyi kullanır. Böylece her korunan marka için favicon
// birebir-kopya tespiti çalışır.
export const KORUNAN_MARKALAR: KorunanMarka[] = [
  { anahtar: "garanti", ad: "Garanti BBVA", resmi: ["garanti.com.tr", "garantibbva.com.tr"] },
  { anahtar: "ziraat", ad: "Ziraat Bankası", resmi: ["ziraatbank.com.tr", "ziraat.com.tr"] },
  { anahtar: "akbank", ad: "Akbank", resmi: ["akbank.com"] },
  { anahtar: "isbank", ad: "İş Bankası", resmi: ["isbank.com.tr", "isbankasi.com.tr"] },
  { anahtar: "yapikredi", ad: "Yapı Kredi", resmi: ["yapikredi.com.tr"] },
  { anahtar: "vakifbank", ad: "Vakıfbank", resmi: ["vakifbank.com.tr"] },
  { anahtar: "halkbank", ad: "Halkbank", resmi: ["halkbank.com.tr", "halkbank.com"] },
  { anahtar: "denizbank", ad: "Denizbank", resmi: ["denizbank.com"] },
  { anahtar: "kuveytturk", ad: "Kuveyt Türk", resmi: ["kuveytturk.com.tr"] },
  { anahtar: "papara", ad: "Papara", resmi: ["papara.com"] },
  { anahtar: "enpara", ad: "Enpara", resmi: ["enpara.com"] },
  { anahtar: "trendyol", ad: "Trendyol", resmi: ["trendyol.com", "trendyolmilla.com"] },
  { anahtar: "hepsiburada", ad: "Hepsiburada", resmi: ["hepsiburada.com"] },
  { anahtar: "sahibinden", ad: "Sahibinden", resmi: ["sahibinden.com"] },
  { anahtar: "turkcell", ad: "Turkcell", resmi: ["turkcell.com.tr"] },
  { anahtar: "vodafone", ad: "Vodafone", resmi: ["vodafone.com.tr"] },
  { anahtar: "turktelekom", ad: "Türk Telekom", resmi: ["turktelekom.com.tr"] },
  { anahtar: "telefonica", ad: "Telefónica", resmi: ["telefonica.com", "telefonica.es"] },
  // İspanya — bankalar, enerji, perakende, havayolu, kamu kurumları
  { anahtar: "santander", ad: "Banco Santander", resmi: ["santander.com", "bancosantander.es"] },
  { anahtar: "bbva", ad: "BBVA", resmi: ["bbva.com", "bbva.es"] },
  { anahtar: "caixabank", ad: "CaixaBank", resmi: ["caixabank.es", "caixabank.com"] },
  { anahtar: "sabadell", ad: "Banco Sabadell", resmi: ["bancsabadell.com", "bancosabadell.es"] },
  { anahtar: "bankinter", ad: "Bankinter", resmi: ["bankinter.com"] },
  { anahtar: "bancoespana", ad: "Banco de España", resmi: ["bde.es"] },
  { anahtar: "iberdrola", ad: "Iberdrola", resmi: ["iberdrola.es", "iberdrola.com"] },
  { anahtar: "repsol", ad: "Repsol", resmi: ["repsol.com", "repsol.es"] },
  { anahtar: "endesa", ad: "Endesa", resmi: ["endesa.com", "endesa.es"] },
  { anahtar: "inditex", ad: "Inditex", resmi: ["inditex.com"] },
  { anahtar: "mercadona", ad: "Mercadona", resmi: ["mercadona.es"] },
  { anahtar: "iberia", ad: "Iberia", resmi: ["iberia.com"] },
  { anahtar: "movistar", ad: "Movistar", resmi: ["movistar.es", "movistar.com"] },
  { anahtar: "correos", ad: "Correos", resmi: ["correos.es"] },
  { anahtar: "agenciatributaria", ad: "Agencia Tributaria", resmi: ["agenciatributaria.gob.es", "agenciatributaria.es"] },
  { anahtar: "pttavm", ad: "PTT AVM", resmi: ["pttavm.com"] },
  { anahtar: "edevlet", ad: "e-Devlet", resmi: ["turkiye.gov.tr"] },
  { anahtar: "tcmb", ad: "TCMB (Merkez Bankası)", resmi: ["tcmb.gov.tr"] },
  { anahtar: "ilbank", ad: "İLBANK (İller Bankası)", resmi: ["ilbank.gov.tr"] },
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
  { anahtar: "transvaro", ad: "Transvaro", resmi: ["transvaro.com.tr"] },
  { anahtar: "milsoft", ad: "MilSOFT", resmi: ["milsoft.com.tr"] },
  { anahtar: "savronik", ad: "Savronik", resmi: ["savronik.com.tr"] },
  { anahtar: "dearsan", ad: "Dearsan Tersanesi", resmi: ["dearsan.com"] },
  { anahtar: "kalearge", ad: "Kale Arge", resmi: ["kalearge.com.tr"] },
  { anahtar: "altinay", ad: "Altınay Savunma", resmi: ["altinay.com"] },
  { anahtar: "repkon", ad: "Repkon", resmi: ["repkon.com.tr"] },
  { anahtar: "ayesas", ad: "Ayesaş", resmi: ["ayesas.com"] },
  { anahtar: "yoncaonuk", ad: "Yonca-Onuk Tersanesi", resmi: ["yoncaonuk.com"] },
  { anahtar: "ctech", ad: "C2TECH", resmi: ["ctech.com.tr"] },
  { anahtar: "fergani", ad: "Fergani Uzay", resmi: ["fergani.co"] },
  { anahtar: "bites", ad: "BİTES", resmi: ["bites.com.tr"] },
  { anahtar: "vestelsavunma", ad: "Vestel Savunma", resmi: ["vesteldefence.com"] },
  { anahtar: "stm", ad: "STM Savunma", resmi: ["stm.com.tr"] },
  { anahtar: "tei", ad: "TEI (TUSAŞ Motor)", resmi: ["tei.com.tr"] },
  { anahtar: "mke", ad: "MKE", resmi: ["mke.gov.tr"] },
  // ── Hava yolu şirketleri ──
  { anahtar: "turkishairlines", ad: "Türk Hava Yolları (THY)", resmi: ["turkishairlines.com", "thy.com"] },
  { anahtar: "flypgs", ad: "Pegasus Hava Yolları", resmi: ["flypgs.com"] },
  { anahtar: "pegasus", ad: "Pegasus Hava Yolları", resmi: ["flypgs.com", "pegasusair.com"] },
  { anahtar: "anadolujet", ad: "AnadoluJet / AJet", resmi: ["anadolujet.com", "ajet.com"] },
  { anahtar: "sunexpress", ad: "SunExpress", resmi: ["sunexpress.com"] },
  { anahtar: "corendon", ad: "Corendon Airlines", resmi: ["corendonairlines.com"] },
  { anahtar: "freebird", ad: "Freebird Airlines", resmi: ["freebirdairlines.com"] },
  { anahtar: "southwind", ad: "SouthWind Airlines", resmi: ["southwindairlines.com"] },
  { anahtar: "tailwind", ad: "Tailwind Airlines", resmi: ["tailwind.com.tr"] },
  { anahtar: "mngairlines", ad: "MNG Airlines", resmi: ["mngairlines.com"] },
  { anahtar: "mirleon", ad: "Mirleon", resmi: ["mirleon.ai"] },
  { anahtar: "araskargo", ad: "Aras Kargo", resmi: ["araskargo.com.tr"] },
  { anahtar: "yurticikargo", ad: "Yurtiçi Kargo", resmi: ["yurticikargo.com"] },
  { anahtar: "ern", ad: "ERN Holding", resmi: ["ern.com.tr"] },
  { anahtar: "uyap", ad: "UYAP (Ulusal Yargı Ağı)", resmi: ["uyap.gov.tr", "vatandas.uyap.gov.tr", "adalet.gov.tr"] },
  { anahtar: "orphion", ad: "Orphion Pharma", resmi: ["orphionpharma.com"] },
  { anahtar: "etimaden", ad: "Eti Maden", resmi: ["etimaden.gov.tr"] },
];

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
  if (k.length < 5) return false; // 4-harf anahtarda edit-distance çok yanlış-pozitif
  const esik = k.length >= 7 ? 2 : 1;
  if (Math.abs(label.length - k.length) > esik) return false;
  const d = duzenlemeMesafesi(label, k);
  if (d === 0 || d > esik) return false;
  if (ortakOnek(label, k) >= 3) return true;              // başlangıcı koruyan klasik typosquat
  if (esik === 1 && d === 1 && tekEditGorsel(label, k)) return true; // erken ama görsel-aldatan
  return false;
}

// domain, verilen marka anahtarının GERÇEK taklidi mi? (kendi domaini/kelime-içi değil)
export function gercekTaklit(domain: string, anahtar: string): boolean {
  const d = domainSade(domain);
  const k = String(anahtar || "").toLowerCase();
  if (!k || k.length < 4 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return false;
  const { label, altAlan, tld } = tescilliBilgi(d);
  const riskliTld = TAKLIT_RISKLI_TLD.has(tld) || TAKLIT_RISKLI_TLD.has(tld.split(".").pop() || "");
  if (label === k) return !altAlan && riskliTld; // kendi domaini/alt alanı değil, sadece garanti.xyz gibi
  if (label.includes(k) && sinirdaGecer(label, k)) return true;
  // Harf-oyunu typosquat (anadolumet, aselan, turkcel…) — alt-dize DEĞİL ama çok benziyor.
  return yakinTypo(label, k);
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
