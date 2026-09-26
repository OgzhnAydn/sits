// TR E-TİCARET TESPİTİ — "bu adres Türkiye'ye satış yapan bir e-ticaret sitesi mi?"
// Amaç: ETBİS'te KAYITLI OLMAYAN ama TR'ye e-ticaret yapan siteleri (kayıtsız/şüpheli)
// yakalamak. Açık-dünya problemi: "hepsini" bulamayız → KEŞFETTİĞİMİZ adayları sınıflarız.
//
// KUSURSUZ / AŞIRI-İDDİA YOK:
//   • Çıktı "kayıtsız/illegal" DEĞİL → "ETBİS kaydı bulunamadı, incelenmeli" (kuyruk, iddia değil).
//   • Yerel liste ~%100 tam olmayabilir → kesin damga için resmi ETBİS teyidi gerekir.
//   • Yalnız YÜKSEK-güven TR-e-ticaret sinyali olanlar aday sayılır (meşru işletmeye iftira yok).
import { guvenliGetir } from "./osint";
import { etbisYerel } from "./etbisYerel";

// ── SİNYALLER ────────────────────────────────────────────────────────────────
// 1) Türk ödeme geçidi — EN GÜÇLÜ sinyal. Sayfada varsa TR'ye satış neredeyse kesin.
const ODEME_GECIT: { ad: string; re: RegExp }[] = [
  { ad: "iyzico", re: /iyzico|iyzipay|iyziclient|iyzico\.com|iyzipos/i },
  { ad: "PayTR", re: /paytr\.com|www\.paytr|paytr_token|\bpaytr\b/i },
  { ad: "Sipay", re: /sipay\.com\.tr|\bsipay\b/i },
  { ad: "Param", re: /param\.com\.tr|parampos|param_pos/i },
  { ad: "Craftgate", re: /craftgate/i },
  { ad: "Moka", re: /moka\.com|mokapos|mokapay|moka united/i },
  { ad: "Paratika", re: /paratika/i },
  { ad: "Shopier", re: /shopier/i },
  { ad: "BKM Express", re: /bkmexpress|bkm\.com\.tr/i },
  { ad: "Papara", re: /papara\.com|papara ile öde/i },
  { ad: "PayU TR", re: /payu\.com\.tr|secure\.payu\.com\.tr/i },
  { ad: "Garanti Sanal POS", re: /sanalpos\.garanti|est\.garanti|vpos\.garanti/i },
];
// 2) TR e-ticaret platformları — güçlü.
const PLATFORM: { ad: string; re: RegExp }[] = [
  { ad: "ikas", re: /ikas\.com|myikas|cdn\.myikas|ikas storefront/i },
  { ad: "Ticimax", re: /ticimax|ticimaxcdn/i },
  { ad: "IdeaSoft", re: /ideasoft|ideacdn\.net/i },
  { ad: "T-Soft", re: /t-soft|tsoft(app|cdn|hosting)?/i },
  { ad: "Faprika", re: /faprika/i },
  { ad: "Platform404", re: /platform404/i },
  { ad: "Projesoft", re: /projesoft/i },
  { ad: "Softtr/Ero", re: /softtr|erobot|ero\.com\.tr/i },
];
// 3) Türk kargo entegrasyonu.
const KARGO = /yurti[çc]i kargo|aras kargo|mng kargo|ptt kargo|s[üu]rat kargo|hepsijet|sendeo|kolay gelsin|trendyol express|kargom nerede/i;
// 4) Genel e-ticaret altyapısı (zayıf; TR-hedef ile birlikte anlamlı).
const GENEL_PLATFORM = /shopify|woocommerce|wp-content\/plugins\/woocommerce|add-to-cart|magento|opencart|prestashop|shopware|\bwix stores\b/i;
// 5) Türkçe e-ticaret akışı (sepet/ödeme/kargo dili).
const TR_ETICARET = /sepete ekle|sepetim|sepete at|hemen al|sipari[şs]lerim|favorilerime ekle|[üu]cretsiz kargo|kap[ıi]da [öo]deme|taksit se[çc]enek|stok kodu|beden se[çc]|renk se[çc]|satın al/i;
// 6) TL fiyatlandırma.
const TL_FIYAT = /₺|\bTL\b|\bTRY\b|t[üu]rk liras[ıi]|\d+[.,]\d{2}\s*(TL|₺)/i;
// 7) Türkçe içerik / TR hedef dili.
const TR_DIL = /lang=["']?tr|hakk[ıi]m[ıi]zda|[İi]leti[şs]im|gizlilik s[öo]zle[şs]mesi|[üu]ye ol|giri[şs] yap|kategoriler|mesafeli sat[ıi][şs]/i;

export type EticaretSonuc = {
  domain: string;
  eticaret: boolean;                 // TR e-ticaret sitesi mi (güven eşiğini geçti)
  guven: number;                     // 0-100
  sinyaller: string[];               // insan-okur kanıt
  odemeGecitleri: string[];          // tespit edilen TR ödeme geçitleri
  platform?: string;                 // tespit edilen platform
  etbisKayitli: boolean;             // yerel ETBİS listesinde mi
  etbisDogrulanmis: boolean;
  sonuc: "kayitli-eticaret" | "kayitsiz-eticaret-aday" | "eticaret-degil" | "erisilemedi";
  not: string;
};

const TARAYICI = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "tr-TR,tr;q=0.9,en;q=0.6",
};

export async function eticaretTR(domain: string): Promise<EticaretSonuc> {
  const host = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  const etb = etbisYerel(host);
  const cikti = (sonuc: EticaretSonuc["sonuc"], not: string, guven = 0, sinyaller: string[] = [], odemeGecitleri: string[] = [], platform?: string, eticaret = false): EticaretSonuc =>
    ({ domain: host, eticaret, guven, sinyaller, odemeGecitleri, platform, etbisKayitli: etb.kayitliMi, etbisDogrulanmis: etb.dogrulanmisMi, sonuc, not });

  if (!host || !host.includes(".")) return cikti("eticaret-degil", "Geçersiz alan adı.");

  let html = "";
  try {
    const r = (await guvenliGetir(`https://${host}/`, 9000, TARAYICI)) || (await guvenliGetir(`http://${host}/`, 9000, TARAYICI));
    if (!r) return cikti("erisilemedi", "Sayfa çekilemedi (yanıt yok / zaman aşımı / engelli).");
    if (!r.ok) return cikti("erisilemedi", `Sayfa çekilemedi (HTTP ${r.status}).`);
    const ct = r.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml|text\/plain/.test(ct)) return cikti("eticaret-degil", "HTML olmayan yanıt (içerik incelenemedi).");
    html = (await r.text()).slice(0, 250000);
  } catch {
    return cikti("erisilemedi", "Sayfa çekilemedi (bağlantı hatası).");
  }

  const sinyaller: string[] = [];
  let guven = 0;
  const gecitler = ODEME_GECIT.filter((g) => g.re.test(html)).map((g) => g.ad);
  if (gecitler.length) { guven += 55; sinyaller.push(`Türk ödeme geçidi: ${gecitler.join(", ")}`); }
  const plat = PLATFORM.find((p) => p.re.test(html));
  if (plat) { guven += 35; sinyaller.push(`TR e-ticaret platformu: ${plat.ad}`); }
  const kargo = KARGO.test(html);
  if (kargo) { guven += 18; sinyaller.push("Türk kargo firması entegrasyonu"); }
  const tl = TL_FIYAT.test(html);
  if (tl) { guven += 15; sinyaller.push("TL / ₺ fiyatlandırma"); }
  const trEt = TR_ETICARET.test(html);
  if (trEt) { guven += 20; sinyaller.push("Türkçe e-ticaret akışı (sepet / ödeme / kargo dili)"); }
  const genel = GENEL_PLATFORM.test(html);
  const trDil = TR_DIL.test(html) || /\.tr$/.test(host);
  if (genel && (tl || trEt || trDil)) { guven += 15; sinyaller.push("Genel e-ticaret altyapısı (Shopify / WooCommerce / …) + TR hedef"); }
  guven = Math.min(100, guven);

  // TR-HEDEF KAPISI: yalnız "mağaza" olması yetmez; TÜRKİYE'ye satış işareti şart.
  const trHedef = gecitler.length > 0 || tl || trEt || trDil || kargo || /\.tr$/.test(host);
  // E-TİCARET İŞARETİ: ödeme geçidi/platform (kesin) VEYA genel-altyapı+TR VEYA TR-akış+fiyat/dil.
  const eticaretSinyali = gecitler.length > 0 || Boolean(plat) || (genel && trHedef) || (trEt && (tl || trDil || kargo));
  const eticaret = Boolean(eticaretSinyali && trHedef && guven >= 40);

  if (!eticaret) {
    return cikti("eticaret-degil", guven > 0 ? "E-ticaret işaretleri var ama TR e-ticaret eşiğini geçmedi (güven düşük)." : "TR e-ticaret işareti bulunamadı.", guven, sinyaller, gecitler, plat?.ad, false);
  }

  const sonuc: EticaretSonuc["sonuc"] = etb.kayitliMi ? "kayitli-eticaret" : "kayitsiz-eticaret-aday";
  const not = etb.kayitliMi
    ? "TR e-ticaret + ETBİS'te KAYITLI — meşru görünüyor (sicilde var)."
    : "TR e-ticaret işaretleri VAR ama yerel ETBİS listesinde kayıt BULUNAMADI — İNCELENMELİ. (Liste anlık döküm, ~%100 tam olmayabilir; kesin 'kayıtsız' hükmü için resmi ETBİS teyidi gerekir.)";
  return { domain: host, eticaret: true, guven, sinyaller, odemeGecitleri: gecitler, platform: plat?.ad, etbisKayitli: etb.kayitliMi, etbisDogrulanmis: etb.dogrulanmisMi, sonuc, not };
}
