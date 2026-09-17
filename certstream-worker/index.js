// SİTS — Marka Taklit Avcısı / CANLI CT dinleyici (kendi kendine yeten, sağlamlaştırılmış).
//
// Sertifika Şeffaflığı (CT) loglarını DOĞRUDAN okur — ölü/aracı bir CertStream
// sunucusuna İHTİYAÇ YOKTUR. Google'ın resmî log listesinden FARKLI operatörlerin
// kullanılabilir loglarını bulur (yedeklilik), her birini güncel uçtan (STH) İLERİYE
// takip eder; yeni sertifikaların domainlerini korunan markalarla karşılaştırır,
// eşleşenleri SİTS'e ADAY olarak bildirir.
//
// Canlı-akış güvencesi:
//   • UCUZ ÖN-FİLTRE: her sertifikanın ham DER byte'larında (harf-duyarsız) marka/şüpheli
//     kelime aranır; isabet YOKSA ASN.1 parse HİÇ yapılmaz → CPU ~1000× düşer, küçük
//     makine bile tüm akışa yetişir ve HİÇBİR ŞEYİ ATLAMAZ. (SAN dNSName = ASCII IA5String
//     olduğundan domainin her parçası ham DER'de bulunur — yanlış-negatif imkânsız, kanıtlı.)
//   • YEDEKLİLİK: farklı operatörlerin logları; bir log gecikse/düşse cert diğerinde yakalanır.
//   • ATLAMA YOK: pozisyon yalnız İŞLENEN kadar ilerler; boş/hatalı yanıtta ilerlemez.
//   • WATCHDOG + SAĞLIK UCU: akış durursa süreç kendini bitirir → Fly otomatik yeniden başlatır.
//
// Env: SITS_URL, MARKA_ADAY_SECRET (ZORUNLU), CT_MAX_LOG (vars 6), PORT (sağlık ucu, vars 8080)

const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");

const SITS = (process.env.SITS_URL || "https://siber-bildir-web.vercel.app").replace(/\/$/, "");
const SECRET = process.env.MARKA_ADAY_SECRET;
// GÖREV AYRIMI (dağıtık worker'lar): marka-sertifikası yakalama HER worker'da açık (zero-miss kapsam).
// Ama bahis feed'i + aktif urlscan taraması 5 makinede MÜKERRER olursa Firestore kotasını patlatır ve
// çıkış bağlantılarını boğar (gönderim timeout). Bunları YALNIZ tek worker'da (Cloudflare/sits-marka-avci)
// açık tut; operatör-worker'larında BAHIS_AKTIF=0 / AKTIF_TARAMA=0 ile kapat.
const BAHIS_AKTIF = process.env.BAHIS_AKTIF !== "0";   // vars açık; operatör-worker'da "0"
const AKTIF_TARAMA = process.env.AKTIF_TARAMA !== "0"; // vars açık; operatör-worker'da "0"
const CT_MAX_LOG = Math.max(1, Number(process.env.CT_MAX_LOG) || 24); // vars: TÜM usable loglar (21) tek worker'da; zero-miss için
const PORT = Number(process.env.PORT) || 8080;
const LOG_LIST_URL = "https://www.gstatic.com/ct/log_list/v3/log_list.json";

const CHUNK = 1000;            // get-entries başına istenecek entry (log daha azını dönebilir).
                              // 256→1000: round-trip başına ~4x throughput → operatörlere yetiş.
const KEEPUP_TAVAN = 20000;    // bir tik'te bir logdan işlenecek en fazla entry (event-loop'u aç tut)
// HİÇ KAÇIRMAMA: eskiden 200k'da uca resync edip ARASI ATLIYORDU (kaçırma!). Artık çok yüksek
// (env CT_KOPMA_ESIK, vars 5M) → uzun kesinti sonrası bile ATLAMADAN yakalamaya çalışır; yalnız
// felaket senaryosunda (aylarca geride) resync. Zero-miss önceliği: atlamak yerine geriden gel.
const KOPMA_ESIK = Number(process.env.CT_KOPMA_ESIK) || 5000000;
const TIK_MS = 3000;           // yeni entry yoksa bir logun yoklama aralığı
const STALL_MS = 5 * 60 * 1000; // hiçbir logdan 5 dk başarılı yanıt gelmezse → yeniden başlat

// /api/markalar çekilemezse kullanılacak yedek liste (canlı çekilip tazelenir).
let MARKALAR = [
  { anahtar: "garanti", resmi: ["garanti.com.tr", "garantibbva.com.tr"] },
  { anahtar: "ziraat", resmi: ["ziraatbank.com.tr", "ziraat.com.tr"] },
  { anahtar: "akbank", resmi: ["akbank.com"] },
  { anahtar: "yapikredi", resmi: ["yapikredi.com.tr"] },
  { anahtar: "vakifbank", resmi: ["vakifbank.com.tr"] },
  { anahtar: "halkbank", resmi: ["halkbank.com.tr"] },
  { anahtar: "denizbank", resmi: ["denizbank.com"] },
  { anahtar: "papara", resmi: ["papara.com"] },
  { anahtar: "trendyol", resmi: ["trendyol.com"] },
  { anahtar: "hepsiburada", resmi: ["hepsiburada.com"] },
  { anahtar: "turkcell", resmi: ["turkcell.com.tr"] },
  { anahtar: "edevlet", resmi: ["turkiye.gov.tr"] },
];

// İSİMSİZ taklit avı token'ları (marka yok ama phishing-temalı). Regex + ön-filtre AYNI listeden.
const SUPHELI_TOKENS = ["login", "signin", "secure", "verify", "dogrulama", "hesap", "banka", "bank", "giris", "odeme", "payment", "wallet", "cuzdan", "guvenli", "guvenlik", "onay", "kampanya", "hediye", "bonus"];
const SUPHELI = new RegExp("(" + SUPHELI_TOKENS.join("|") + ")");

// ── YASA DIŞI BAHİS tespiti (lib/bahis.ts imzasının worker aynası) ──────────────
// Ön-filtre token'ları (DER'de aranır) — generic + uydurma marka adları (slotio, casibom…).
const BAHIS_TOKENS = ["bet", "bahis", "casino", "kumar", "slot", "rulet", "iddaa", "poker", "jackpot", "spin", "slotio", "casibom", "wonodds", "pashagaming", "favori", "onwin", "sahabet", "tipobet", "jojobet", "holiganbet", "matadorbet", "pusulabet", "bettilt", "betwoon", "artemisbet", "grandpasha", "betwild", "bahisnow", "asyabahis", "tarafbet", "paribahis"];
const BET_MARKA_W = /(bet(turkey|boo|nano|park|tilt|win|ist|gram|matik|orspar|ada|line|per|cio|sat|zula|puan|order|moon|kanyon|baba)|sahabet|tipobet|jojobet|holiganbet|mars?bahis|sekabet|pinbahis|bahsegel|s[üu]perbahis|casinomaxi|casinometropol|mobilbahis|matadorbet|restbet|dinamobet|elexbet|betmatik|nakitbahis|imajbet|onwin|xslot|pusulabet|betwoon|maltcasino|artemisbet|grand ?pasha|pashagaming|betgaranti|betwinner|1xbet|mostbet|melbet|jetbahis|hovarda|betpas|milanobet|piabella|bettilt|slotio|casibom|wonodds|red ?win|favori(sen|bahis)?|bahisnow|asyabahis|tarafbet|extrabet|gorabet|galabet|ligobet|tulipbet|corlobet|betwild|starzbet|paribahis|bets10|youwin|bycasino|casinolevant)/i;
const BAHIS_TERIM_W = /bahis|casino|kumar|iddaa|rulet|slotlar|slots|jackpot|freespin|free ?spin|sportsbook|betting|deneme ?bonus/i;
const BET_SONEK_W = /^[a-z]{3,}bet\d{0,4}$/;
const MESRU_BET_W = /^(alphabet|sherbet|tibet|beta|abet|corbet|colbert|cabinet|sunbet|nisbet)$/;
function bahisEslesen(domain) {
  const d = kok(domain);
  const et = d.split(".")[0];
  if (BET_MARKA_W.test(d)) return true;
  if (BAHIS_TERIM_W.test(d)) return true;               // NOT: bare "slot" DEĞİL (slot-manager FP) — "slots"/"slotlar" var
  if (BET_SONEK_W.test(et) && !MESRU_BET_W.test(et)) return true;
  return false;
}

// Ön-filtre needle'ları (küçük harf Buffer): marka anahtarları (≥4) + şüpheli + BAHİS token'ları.
let NEEDLES = [];
function needlesKur() {
  const kel = new Set([...SUPHELI_TOKENS, ...BAHIS_TOKENS]);
  for (const m of MARKALAR) if (m.anahtar && m.anahtar.length >= 4) kel.add(m.anahtar.toLowerCase());
  NEEDLES = [...kel].map((s) => Buffer.from(s, "ascii"));
}

const gorulen = new Map();
const DEDUP_TTL = 6 * 3600 * 1000;
let sayac = { entry: 0, parse: 0, domain: 0, aday: 0 };
let TAKIP_LOGLAR = []; // takip edilen loglar (özet/telemetri per-log lag & atlama okur)
let sonAktivite = Date.now(); // en son BAŞARILI CT HTTP yanıtı (watchdog için)

// ── Konum kalıcılığı (Fly volume /data) — restart'ta baştan başlamamak için ──
// Her logun okuma konumu diske yazılır; yeniden başlayınca oradan devam edilir →
// restart boşluğu ~sıfır. Volume yoksa (yerel) worker klasörüne yazar; yazılamazsa
// yalnız bellekte tutar (uçtan devam eder, sorunsuz).
const POS_FILE = process.env.POS_FILE || (fs.existsSync("/data") ? "/data/pos.json" : path.join(__dirname, "pos.json"));
let positions = {};
try {
  positions = JSON.parse(fs.readFileSync(POS_FILE, "utf8"));
  console.log(`[konum] ${Object.keys(positions).length} log konumu yüklendi (${POS_FILE})`);
} catch { positions = {}; }
let posDirty = false;
function posKaydet() {
  if (!posDirty) return;
  posDirty = false;
  try { fs.writeFileSync(POS_FILE, JSON.stringify(positions)); } catch (e) { console.log("[konum] yazılamadı:", e.message); }
}

function kok(d) {
  return String(d).toLowerCase().replace(/^\*\./, "").replace(/^www\./, "").trim();
}

// ── CT entry → DER (ucuz), sonra gerekirse domainler ────────────────────────
function entryDER(leafInput, extraData) {
  let leaf;
  try { leaf = Buffer.from(leafInput, "base64"); } catch { return null; }
  if (leaf.length < 15) return null;
  const entryType = leaf.readUInt16BE(10);
  if (entryType === 0) {
    const len = (leaf[12] << 16) | (leaf[13] << 8) | leaf[14];
    return leaf.subarray(15, 15 + len);
  }
  if (entryType === 1) {
    let ed;
    try { ed = Buffer.from(extraData || "", "base64"); } catch { return null; }
    if (ed.length < 3) return null;
    const len = (ed[0] << 16) | (ed[1] << 8) | ed[2];
    return ed.subarray(3, 3 + len);
  }
  return null;
}

// DER kopyasını yerinde küçült (A-Z→a-z) — harf-duyarsız ucuz arama için.
function kucult(der) {
  const b = Buffer.from(der);
  for (let i = 0; i < b.length; i++) { const c = b[i]; if (c >= 65 && c <= 90) b[i] = c + 32; }
  return b;
}

function onFiltreGecer(der) {
  const ld = kucult(der);
  for (const n of NEEDLES) if (ld.includes(n)) return true;
  return false;
}

function derDomainleri(der) {
  try {
    const x = new crypto.X509Certificate(der);
    const san = x.subjectAltName || "";
    return san.split(",").map((s) => s.trim()).filter((s) => s.startsWith("DNS:")).map((s) => s.slice(4).toLowerCase());
  } catch {
    return [];
  }
}

// ── SİTS bildirimleri ───────────────────────────────────────────────────────
async function markalariYukle() {
  try {
    const r = await fetch(`${SITS}/api/markalar`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (Array.isArray(j.markalar) && j.markalar.length) {
      MARKALAR = j.markalar.map((m) => ({ anahtar: m.anahtar, resmi: m.resmi || [], kaliplari: m.kaliplari || [], yaygin: !!m.yaygin }));
      console.log(`[markalar] ${MARKALAR.length} korunan marka yüklendi`);
    }
  } catch {
    console.log("[markalar] liste çekilemedi, yedek liste kullanılıyor");
  }
  needlesKur();
}

// Yaygın 2-parçalı public-suffix'ler (tescilli alan = son 3 etiket).
const IKI_PARCA_SONEK = new Set(["com.tr", "net.tr", "org.tr", "gov.tr", "edu.tr", "co.uk", "org.uk", "com.ph", "org.ph", "net.ph", "gov.ph", "com.au", "co.jp", "com.br", "co.za", "com.mx", "com.tw"]);
const RISKLI_TLD_SET = new Set(["xyz", "top", "tk", "buzz", "icu", "cyou", "rest", "monster", "click", "shop", "live", "online", "site", "vip", "club", "fun", "website", "space", "info", "biz", "sbs", "cfd", "help", "wiki", "quest"]);

// domaini tescilli-alan etiketine ayır: api.prod.vodafone.com → {label:"vodafone", altAlan:true, tld:"com"}
function tescilliBilgi(host) {
  const p = host.split(".");
  if (p.length < 2) return { label: p[0] || "", altAlan: false, tld: "" };
  const son2 = p.slice(-2).join(".");
  let tldParca = 2;
  if (p.length >= 3 && IKI_PARCA_SONEK.has(son2)) tldParca = 3;
  const label = p[p.length - tldParca] || "";
  const tld = p.slice(p.length - tldParca + 1).join(".");
  const altAlan = p.length > tldParca; // tescilli alandan ÖNCE etiket var mı (= alt alan)
  return { label, altAlan, tld };
}

// marka kelimesi, tescilli etikette GERÇEK bir taklit gibi mi geçiyor?
// sol sınır (baş / '-' / rakam-sonrası) şart; kısa anahtar (<6) için sağ sınır da şart.
function sinirdaGecer(label, k) {
  const i = label.indexOf(k);
  if (i < 0) return false;
  const onceki = i === 0 ? "" : label[i - 1];
  const solSinir = i === 0 || onceki === "-" || /[0-9]/.test(onceki);
  if (!solSinir) return false; // primegarantia, betgarantigirisi → ELE
  const sonraki = label[i + k.length];
  const sagSinir = sonraki === undefined || sonraki === "-";
  // 6 ve altı anahtar (papara/isbank/tcmb) için sağ sınır da şart:
  // "paparazzi"⊃papara, "kennisbank"⊃isbank gibi kelime-içi çarpışmaları ELE.
  if (k.length <= 6 && !sagSinir) return false;
  return true;
}

// Levenshtein — harf-oyunu typosquat tespiti (anadolumet≈anadolujet, turkcel≈turkcell).
function duzenlemeMesafesi(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}
function ortakOnek(a, b) { let i = 0; const n = Math.min(a.length, b.length); while (i < n && a[i] === b[i]) i++; return i; }
// Görsel-aldatan harf/rakam çiftleri (l↔1, o↔0…) — lib/korunanMarkalar ile aynı.
const GORSEL_CIFT = { "0": "o", o: "0", "1": "l", l: "1", i: "1", "5": "s", s: "5", "3": "e", e: "3", "4": "a", a: "4", "9": "g", g: "9", "6": "b", b: "6", "7": "t", t: "7", "2": "z", z: "2" };
function tekEditGorsel(label, k) {
  if (label.length !== k.length) return false;
  let fark = -1;
  for (let i = 0; i < k.length; i++) if (label[i] !== k[i]) { if (fark >= 0) return false; fark = i; }
  return fark >= 0 && GORSEL_CIFT[k[fark]] === label[fark];
}
// lib/korunanMarkalar.yakinTypo ile BİREBİR aynı: ≥4 ortak önek (diyet↔diyanet, burnbank↔burganbank
// gibi 3-önek FP'lerini eler) VEYA erken görsel-aldatan tek harf (4kbank↔akbank).
function yakinTypo(label, k) {
  if (k.length < 6) return false;
  const esik = k.length >= 7 ? 2 : 1;
  if (Math.abs(label.length - k.length) > esik) return false;
  const d = duzenlemeMesafesi(label, k);
  if (d === 0 || d > esik) return false;
  if (ortakOnek(label, k) >= 4) return true;
  if (esik === 1 && d === 1 && tekEditGorsel(label, k)) return true;
  return false;
}

// KISA (≤4 harf) anahtar FP kapısı: gerçek taklit domaini Türkçe konut/finans/resmî ya da phishing
// kelimesi taşır; meşru yabancı (ibis-toki.co.jp, hoikuen-toki) taşımaz. lib/korunanMarkalar ile aynı.
// "gov" yalnız ETİKET içinde (-gov/gov-/govtr/gov.tr) yakalanır; meşru ".gov" TLD (southwindsor-ct.gov)
// tetiklemez. Türk devlet/adli phishing (uyap-gov, vatandas-uyap-gov) + Türkçe resmî/adli bağlam kelimeleri.
const TR_BAGLAM = /proje|konut|basvuru|basvur|kampanya|cekilis|kura|tapu|daire|kredi|resmi|giris|destek|musteri|hesap|odeme|randevu|evim|bakanlik|idare|sorgu|login|secure|verify|account|onlin|bank|card|kart|mobil|wallet|\bpay\b|\btc\b|bilet|ucus|ucak|rezervasyon|seyahat|checkin|acceso|banca|cliente|particular|premi|bonus|hediye|-gov|gov-|govtr|gov\.tr|vatandas|tebligat|mahkeme|adalet|evrak|dava|icra|vergi/;

function eslesenMarka(domain) {
  const d = kok(domain);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
  const { label, altAlan, tld } = tescilliBilgi(d);
  const riskliTld = RISKLI_TLD_SET.has(tld) || RISKLI_TLD_SET.has(tld.split(".").pop());
  // Bağlam sinyali YALNIZ tescilli alanda (label+tld) aransın — rastgele alt-alan (account., eu-login.)
  // meşru siteyi (pegasusnest.com, garantisjekk.no) phishing gibi göstermesin.
  const kayitliAlan = tld ? `${label}.${tld}` : label;
  const baglamVar = riskliTld || TR_BAGLAM.test(kayitliAlan);
  for (const m of MARKALAR) {
    if ((m.resmi || []).some((r) => d === r || d.endsWith("." + r))) continue; // resmî → atla
    // Anahtar + AÇILIM kalıpları (toki + toplukonutidaresi…) — her biri denenir, eşleşen marka anahtarını döndürür.
    for (const k of [m.anahtar, ...(m.kaliplari || [])]) {
      if (!k || k.length < 3) continue; // taban 3: "tvf" gibi kısa kalıp sınır+sıkı-bağlam kapılarından geçmek zorunda (gürültü sınırlı)
      if (label === k) {
        // Tescilli ad markanın KENDİSİ; alt alan/normal uzantı = kendi domaini, ATLA. Sadece garanti.xyz.
        if (altAlan || !riskliTld) continue;
        return m.anahtar;
      }
      // Marka adı tescilli etiketin İÇİNDE, gerçek taklit sınırında mı? (garanti-kredi, garantibbva…)
      if (label.includes(k) && sinirdaGecer(label, k)) {
        // SIKI-BAĞLAM: KISA ANAHTAR (≤4) VEYA YAYGIN-KELİME marka → ek sinyal şart (riskli TLD VEYA
        // tescilli alanda phishing/Türkçe bağlamı). Yoksa ATLA (garantisjekk.no, tailwindtech.ai).
        if ((k.length <= 4 || m.yaygin) && !baglamVar) continue;
        return m.anahtar;
      }
      // Harf-oyunu typosquat (anadolumet, turkcel…) — alt-dize değil ama çok benziyor.
      // YAYGIN markada typo'ya da bağlam kapısı: transvaro↔transparo/transpar FP'sini eler.
      if (yakinTypo(label, k)) {
        if (m.yaygin && !baglamVar) continue;
        return m.anahtar;
      }
    }
  }
  return null;
}

// ── GÖNDERİM EŞZAMANLILIK SINIRI ────────────────────────────────────────────────
// CT akışı saniyede yüzlerce eşleşme üretebilir. domainIsle bu gönderimleri await ETMEDEN
// (fire-and-forget) tetikler → hepsi AYNI ANDA açılırsa worker'ın çıkış soket havuzu + DNS
// boğulur → Vercel milisaniyede yanıt verse bile POST'lar 30s'de "aborted due to timeout".
// Çözüm: en fazla GONDER_ES eşzamanlı POST; gerisi kuyrukta sıra bekler (aday KAYBOLMAZ).
const GONDER_ES = Math.max(1, Number(process.env.GONDER_ES) || 4);
let _aktifGonderim = 0;
const _gonderKuyruk = [];
function _gonderKapisi() {
  if (_aktifGonderim < GONDER_ES) { _aktifGonderim++; return Promise.resolve(); }
  return new Promise((coz) => _gonderKuyruk.push(coz));
}
function _gonderBirak() {
  const s = _gonderKuyruk.shift();
  if (s) s(); else _aktifGonderim--;
}
// Tek kapı + tek fetch kalıbı: kotalı, sıralı, DRY. Başarısızlıkta çağıran dedup'ı geri alır.
async function sitsGonder(yol, govde) {
  await _gonderKapisi();
  try {
    const r = await fetch(`${SITS}${yol}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(govde),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`http ${r.status}`);
    return await r.json().catch(() => ({}));
  } finally { _gonderBirak(); }
}

async function adayGonder(domain, marka) {
  const key = kok(domain);
  const now = Date.now();
  if (gorulen.has(key) && now - gorulen.get(key) < DEDUP_TTL) return;
  gorulen.set(key, now);
  try {
    const j = await sitsGonder("/api/marka-aday", { domain: key, marka, secret: SECRET });
    if (j.kaydedildi) { sayac.aday++; console.log(`ADAY: ${key}  (${marka})  skor ${j.skor}`); }
    else if (j.yazDurum === "zamanasimi") { sayac.kotaDolu = (sayac.kotaDolu || 0) + 1; console.log(`[KOTA DOLU] ${key} (${marka}) skor ${j.skor} — Firestore yazılamadı (kota); dedup TTL sonra yeniden denenir`); }
  } catch (e) {
    gorulen.delete(key); // başarısız gönderim → dedup'a takılma, tekrar görülünce yeniden dene (aday kaçmasın)
    console.log(`[gönderim hatası] ${key}: ${e.message}`);
  }
}

async function faviconGonder(domain) {
  const key = kok(domain);
  const now = Date.now();
  if (gorulen.has(key) && now - gorulen.get(key) < DEDUP_TTL) return;
  gorulen.set(key, now);
  try {
    const j = await sitsGonder("/api/favicon-tara", { domain: key, secret: SECRET });
    if (j.eslesme) { sayac.aday++; console.log(` FAVICON-KOPYA: ${key}  (${j.marka})  skor ${j.skor}`); }
  } catch { gorulen.delete(key); }
}

async function bahisGonder(domain) {
  const key = kok(domain);
  const now = Date.now();
  if (gorulen.has(key) && now - gorulen.get(key) < DEDUP_TTL) return;
  gorulen.set(key, now);
  try {
    const j = await sitsGonder("/api/bahis-aday", { domain: key, secret: SECRET });
    if (j.kaydedildi) { sayac.aday++; console.log(`BAHİS: ${key}  skor ${j.guven}${j.bizOnce ? "  BİZ-ÖNCE(USOM'da yok)" : ""}${j.trHedefli ? "  TR" : ""}`); }
  } catch (e) {
    gorulen.delete(key); // başarısız → dedup'a takılma, tekrar görülünce yeniden dene
    console.log(`[bahis gönderim hatası] ${key}: ${e.message}`);
  }
}

function domainIsle(dom) {
  sayac.domain++;
  const marka = eslesenMarka(dom);
  if (marka) { adayGonder(dom, marka); return; }
  if (bahisEslesen(dom)) { if (BAHIS_AKTIF) bahisGonder(dom); return; } // yasa dışı bahis → kalıcı feed'e (yalnız bahis-worker'ı)
  if (SUPHELI.test(kok(dom))) faviconGonder(dom);
}

// Bir entry'yi işle: ÖNCE ucuz ön-filtre, ancak isabet varsa parse.
function entryIsle(e) {
  sayac.entry++;
  const der = entryDER(e.leaf_input, e.extra_data);
  if (!der || der.length < 4) return;
  if (!onFiltreGecer(der)) return; // çok büyük çoğunluk burada, parse ETMEDEN elenir
  sayac.parse++;
  for (const dom of derDomainleri(der)) domainIsle(dom);
}

// ── SÜREKLİ AKTİF TARAMA (urlscan) ─────────────────────────────────────────────
// CertStream PASİF'tir (yeni sertifika = yeni domain). Bu döngü AKTİF'tir: tüm markaları
// sürekli urlscan'de tarar → MEVCUT/eski sahteleri de bulur. İkisi birlikte = her marka 7/24
// canlı izlenir. Kibar hız (marka başına ~4sn) → ~100 marka ~7dk/tur, urlscan limitine saygı.
const URLSCAN_KEY = process.env.URLSCAN_KEY;
async function urlscanAra(q) {
  try {
    const r = await fetch(`https://urlscan.io/api/v1/search/?q=${encodeURIComponent(q)}&size=40`, {
      headers: URLSCAN_KEY ? { "API-Key": URLSCAN_KEY } : { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return [];
    return (await r.json()).results || [];
  } catch { return []; }
}
async function aktifTaramaDongu() {
  console.log("[aktif] sürekli marka taraması başladı (urlscan)");
  for (;;) {
    const markalar = MARKALAR.filter((m) => m.anahtar && m.anahtar.length >= 4);
    let tur = 0;
    for (const m of markalar) {
      try {
        const res = await urlscanAra(`page.domain:${m.anahtar}*`);
        for (const r of res) {
          const dom = kok(r.page?.domain || "");
          if (!dom || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) continue;
          if ((m.resmi || []).some((x) => dom === x || dom.endsWith("." + x))) continue; // resmî → atla
          if (eslesenMarka(dom) === m.anahtar) { adayGonder(dom, m.anahtar); tur++; } // guardrail'den geçir
        }
      } catch { /* bu marka atla */ }
      await bekle(4000); // kibar: urlscan hız-sınırına saygı
    }
    console.log(`[aktif] tam tur bitti — ${markalar.length} marka tarandı, ${tur} aday`);
    await bekle(30000);
  }
}

// ── CT log keşfi + takibi ───────────────────────────────────────────────────
// Operatör filtresi (env): CT_ONLY_OP=TrustAsia → yalnız o operatör(ler); CT_SKIP_OP=TrustAsia → onu atla.
// Böylece Asya worker'ı SADECE TrustAsia'yı, Frankfurt worker'ı TrustAsia HARİÇ dinler.
const ONLY_OP = (process.env.CT_ONLY_OP || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const SKIP_OP = (process.env.CT_SKIP_OP || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);

async function kullanilabilirLoglar() {
  const j = await (await fetch(LOG_LIST_URL, { signal: AbortSignal.timeout(15000) })).json();
  const now = Date.now();
  const perOp = [];
  for (const op of j.operators || []) {
    const opAd = (op.name || "").toLowerCase();
    if (ONLY_OP.length && !ONLY_OP.some((o) => opAd.includes(o))) continue; // yalnız-liste
    if (SKIP_OP.some((o) => opAd.includes(o))) continue;                    // atla-liste
    const grup = [];
    for (const log of op.logs || []) {
      const st = log.state && Object.keys(log.state)[0];
      const ti = log.temporal_interval;
      const kapsar = !ti || (Date.parse(ti.start_inclusive) <= now && now < Date.parse(ti.end_exclusive));
      if ((st === "usable" || st === "qualified") && kapsar) grup.push({ ad: log.description || log.url, url: log.url.replace(/\/$/, ""), op: op.name });
    }
    if (grup.length) perOp.push(grup);
  }
  // HİÇ KAÇIRMAMA: bir operatöre sabitlendiyse (CT_ONLY_OP) o operatörün TÜM loglarını takip et
  // (o operatörün tek sertifikasını bile kaçırma). Aksi halde operatörler arası SIRAYLA CT_MAX_LOG
  // kadar seç. Zero-miss için: her operatöre bir worker (CT_ONLY_OP) → 21 logun TAMAMI kapsanır.
  if (ONLY_OP.length) return perOp.flat();
  const secili = [];
  for (let i = 0; secili.length < CT_MAX_LOG; i++) {
    let eklendi = false;
    for (const grup of perOp) if (grup[i]) { secili.push(grup[i]); eklendi = true; if (secili.length >= CT_MAX_LOG) break; }
    if (!eklendi) break;
  }
  return secili;
}

// Status + Retry-After taşıyan HTTP hatası — 429 (hız-sınırı) özel işlensin diye.
class HttpHata extends Error {
  constructor(msg, status, retryAfter) { super(msg); this.status = status; this.retryAfter = retryAfter; }
}

async function getSth(url, ms = 12000) {
  const r = await fetch(`${url}/ct/v1/get-sth`, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new HttpHata(`get-sth ${r.status}`, r.status, Number(r.headers.get("retry-after")) || 0);
  sonAktivite = Date.now();
  return (await r.json()).tree_size;
}

async function getEntries(url, start, end, ms = 20000) {
  const r = await fetch(`${url}/ct/v1/get-entries?start=${start}&end=${end}`, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new HttpHata(`get-entries ${r.status}`, r.status, Number(r.headers.get("retry-after")) || 0);
  sonAktivite = Date.now();
  return (await r.json()).entries || [];
}

function bekle(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Tek bir logu güncel uçtan İLERİYE takip et (yalnız YENİ sertifikalar, atlama yok).
async function logTakip(log) {
  // Kayıtlı konum varsa ORADAN devam et (restart boşluğu ~0); yoksa uçtan başla.
  let pos = Number.isInteger(positions[log.url]) ? positions[log.url] : null;
  let hata = 0;
  // Telemetri + uyarlanabilir hız durumu (özet ve kaçırma-uyarısı bunları okur).
  log.google = /google/i.test(log.op);   // Google atlarsa telafi var; Google-dışı atlarsa GERÇEK risk
  log.pace = 0;                            // istekler arası uyarlanan gecikme (429→artar, başarı→azalır)
  log.geride = 0;                          // şu anki lag (tree_size - pos)
  log.atlama = 0;                          // kaç kez uca-resync (atlama) yapıldı
  log.hataUsteUste = 0;                    // üst üste hata (timeout/429) — "erişilemiyor" tespiti
  log.timeout = 20000;                     // uyarlanan istek timeout'u (yavaş loga—TrustAsia—daha çok süre)
  log.chunk = CHUNK;                        // uyarlanan batch boyutu (timeout→küçült; yanıt yetişemeyen TrustAsia küçük batch'e iner)
  console.log(`[ct] takip başlıyor: ${log.ad} (${log.op})${pos !== null ? ` — konum ${pos}'dan sürdürülüyor` : ""}`);
  for (;;) {
    try {
      const boyut = await getSth(log.url, Math.min(20000, log.timeout));
      hata = 0; log.hataUsteUste = 0;
      if (log.timeout > 20000) log.timeout = Math.max(20000, log.timeout - 5000); // başarı → tabana in
      if (pos !== null && pos > boyut) pos = boyut; // kayıt bozuk/log sıfırlanmış → uca çek
      if (pos === null) { pos = boyut; positions[log.url] = pos; posDirty = true; await bekle(TIK_MS); continue; } // ilk turda sadece ucu al
      log.geride = Math.max(0, boyut - pos);
      if (boyut <= pos) { if (log.pace > 0) log.pace = Math.max(0, log.pace - 50); await bekle(TIK_MS); continue; }

      // Uzun kesinti sonrası devasa backlog → uca yakın resync (nadir, GÜRÜLTÜLÜ).
      // Google atlarsa çoklu-operatör telafisi var; GOOGLE-DIŞI atlama = gerçek kaçırma riski.
      if (boyut - pos > KOPMA_ESIK) {
        log.atlama++;
        const ek = log.google ? "" : "  GOOGLE-DIŞI OPERATÖR — GERÇEK KAÇIRMA RİSKİ (bu sertifikalar başka logda olmayabilir)";
        console.log(` [ct] ${log.ad} (${log.op}): ${boyut - pos} geride (uzun kesinti?) — uca resync, arası atlanıyor${ek}`);
        pos = boyut - KEEPUP_TAVAN;
      }

      const hedef = Math.min(boyut - 1, pos + KEEPUP_TAVAN - 1);
      let start = pos;
      while (start <= hedef) {
        if (log.pace) await bekle(log.pace);   // hız-sınırına saygı: istekleri araklı at (429'u önle)
        const son = Math.min(hedef, start + log.chunk - 1);
        const entries = await getEntries(log.url, start, son, log.timeout);
        if (!entries.length) break;          // geçici boş → pos'u İLERLETME (atlama yok)
        for (const e of entries) entryIsle(e);
        start += entries.length;             // yalnız gerçekten işlenen kadar ilerle
        if (log.chunk < CHUNK) log.chunk = Math.min(CHUNK, log.chunk + 100); // başarı → batch'i tabana çıkar
      }
      pos = start;                           // = işlenen son + 1 (boşsa olduğu yerde kalır)
      positions[log.url] = pos; posDirty = true; // diske yaz (debounced) → restart'ta buradan devam
      log.geride = Math.max(0, boyut - pos);
      if (log.pace > 0) log.pace = Math.max(0, log.pace - 50); // başarı → hızlan (tabana doğru)
    } catch (e) {
      hata++; log.hataUsteUste++;
      const timeoutHata = /abort|timeout|timed out/i.test(e.message || "");
      if (e.status === 429) {
        // HIZ-SINIRI: bu logu yavaşlat (pace artır, Retry-After'a saygı) — atlamaya
        // sürükleyen 429 fırtınasını dindirir. Google en sık burada.
        log.pace = Math.min(4000, (log.pace || 0) + 300);
        const bekleme = Math.min(60000, Math.max((e.retryAfter || 0) * 1000, 2000 * hata));
        console.log(`[ct] ${log.ad} 429 hız-sınırı — pace=${log.pace}ms, ${Math.round(bekleme / 1000)}sn bekle`);
        await bekle(bekleme);
      } else {
        // TIMEOUT: yavaş log (TrustAsia) — hem DAHA ÇOK süre ver (45sn'e kadar) hem
        // batch'i KÜÇÜLT (64'e kadar) ki yanıt timeout'a yetişsin. Küçük batch + çok süre.
        if (timeoutHata) {
          log.timeout = Math.min(45000, log.timeout + 8000);
          log.chunk = Math.max(64, Math.floor(log.chunk / 2));
        }
        const bekleme = Math.min(30000, 2000 * hata); // üstel geri çekilme
        console.log(`[ct] ${log.ad} hata(${hata}): ${e.message}${timeoutHata ? ` — timeout=${log.timeout}ms, chunk=${log.chunk}` : ""} — ${bekleme / 1000}sn sonra`);
        await bekle(bekleme);
      }
    }
  }
}

// ── Sağlık ucu + watchdog ───────────────────────────────────────────────────
http.createServer((req, res) => {
  const taze = Date.now() - sonAktivite < STALL_MS;
  const govde = JSON.stringify({ ok: taze, sonAktiviteSnÖnce: Math.round((Date.now() - sonAktivite) / 1000), ...sayac, dedup: gorulen.size });
  res.writeHead(taze ? 200 : 503, { "Content-Type": "application/json" });
  res.end(govde);
}).listen(PORT, () => console.log(`[sağlık] http :${PORT}/health`));

setInterval(() => {
  if (Date.now() - sonAktivite > STALL_MS) {
    console.error(`[watchdog] ${Math.round((Date.now() - sonAktivite) / 1000)}sn'dir CT yanıtı yok — süreç bitiriliyor (Fly yeniden başlatır).`);
    process.exit(1);
  }
}, 30000);

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of gorulen) if (now - v > DEDUP_TTL) gorulen.delete(k);
}, 3600 * 1000);

setInterval(() => {
  // Per-log lag (geride) + atlama sayısı — kısa isim (log tanımından tırnak içi).
  const durumStr = (l) => (l.hataUsteUste > 2 ? "ERİŞİLEMİYOR" : `${l.geride || 0}${l.atlama ? `/atla×${l.atlama}` : ""}${l.pace ? `/${l.pace}ms` : ""}`);
  const perLog = TAKIP_LOGLAR
    .map((l) => `${(l.ad.match(/'([^']+)'/) || [])[1] || l.op}:${durumStr(l)}`)
    .join("  ");
  console.log(`[özet] entry=${sayac.entry} parse=${sayac.parse} domain=${sayac.domain} aday=${sayac.aday} (dedup ${gorulen.size}) | ${perLog}`);
  // GERÇEK KAÇIRMA RİSKİ: Google-DIŞI bir operatör ciddi geride, atlamış ya da
  // ERİŞİLEMİYORSA (Google atlaması çoklu-operatör kuralıyla telafi edilir; Google-dışı edilmez).
  const riskli = TAKIP_LOGLAR.filter((l) => !l.google && ((l.geride || 0) > 50000 || (l.atlama || 0) > 0 || l.hataUsteUste > 2));
  if (riskli.length) {
    console.error(
      ` [KAÇIRMA RİSKİ] Google-dışı operatör sorunlu → ${riskli
        .map((l) => `${l.op}(${l.hataUsteUste > 2 ? "ERİŞİLEMİYOR" : `${l.geride} geride`}${l.atlama ? `, atla×${l.atlama}` : ""})`)
        .join(", ")} — bu sertifikalar başka logda olmayabilir, kaçmış olabilirler!`
    );
  }
}, 60 * 1000);

// Konumu periyodik diske yaz + Fly restart'ta (SIGTERM) son konumu flush et → boşluk ~0.
setInterval(posKaydet, 5000);
function temizKapan() { posKaydet(); process.exit(0); }
process.on("SIGTERM", temizKapan);
process.on("SIGINT", temizKapan);

// Süreç asla sessizce ölmesin — logla, watchdog gerekirse toparlar.
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e && e.message));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e && e.message));

(async () => {
  if (!SECRET) {
    console.error("HATA: MARKA_ADAY_SECRET tanımlı değil. Çıkılıyor.");
    process.exit(1);
  }
  console.log(`[başlıyor] SİTS = ${SITS}`);
  await markalariYukle();
  setInterval(markalariYukle, 30 * 60 * 1000); // 30 dk — yeni eklenen markalar hızlı devreye girsin

  let loglar = await kullanilabilirLoglar();
  if (!loglar.length) { console.error("HATA: kullanılabilir CT log bulunamadı."); process.exit(1); }
  TAKIP_LOGLAR = loglar; // özet/telemetri bu diziden per-log lag & atlama okur
  const opSayisi = new Set(loglar.map((l) => l.op)).size;
  console.log(`[ct] ${loglar.length} log / ${opSayisi} operatör takip edilecek: ${loglar.map((l) => `${l.ad}(${l.op})`).join(", ")}`);
  for (const log of loglar) logTakip(log); // paralel, sonsuz döngüler
  if (AKTIF_TARAMA) aktifTaramaDongu(); // SÜREKLİ aktif marka taraması (urlscan) — yalnız tek worker'da (mükerrer değil)
  else console.log("[aktif] AKTIF_TARAMA=0 → bu worker salt-CT (aktif urlscan taraması kapalı)");
})();
