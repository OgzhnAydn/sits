// İtibarlı (güvenilir) domain koruması. Tehdit feed'leri bazen meşru bir siteyi
// (ör. github.com'da barındırılan bir phishing sayfası yüzünden github.com'u)
// içerebilir. Bu liste, bilinen büyük/resmi siteleri feed/tohum yanlış-pozitifine
// karşı korur. USOM'un RESMİ tekil kaydını ezmez (o güvenilir kaynaktır).

// Türk resmi/kurumsal + büyük global siteler (registrable domain).
const ITIBARLI = new Set<string>([
  // Global
  "google.com", "youtube.com", "gmail.com", "github.com", "github.io",
  "microsoft.com", "live.com", "outlook.com", "office.com", "bing.com",
  "apple.com", "icloud.com", "amazon.com", "amazon.com.tr", "facebook.com",
  "instagram.com", "whatsapp.com", "twitter.com", "x.com", "linkedin.com",
  "wikipedia.org", "cloudflare.com", "mozilla.org", "netflix.com", "spotify.com",
  "yahoo.com", "reddit.com", "telegram.org", "t.me", "vercel.app", "firebaseapp.com",
  // Türk bankalar
  "ziraatbank.com.tr", "ziraatbankasi.com.tr", "halkbank.com.tr", "vakifbank.com.tr",
  "garantibbva.com.tr", "akbank.com", "isbank.com.tr", "yapikredi.com.tr",
  "denizbank.com", "teb.com.tr", "sekerbank.com.tr", "qnbfinansbank.com",
  "ingbank.com.tr", "kuveytturk.com.tr", "turkiyefinans.com.tr", "albaraka.com.tr",
  "papara.com", "enpara.com",
  // Türk e-ticaret / hizmet
  "hepsiburada.com", "trendyol.com", "n11.com", "sahibinden.com", "gittigidiyor.com",
  "turkcell.com.tr", "turktelekom.com.tr", "vodafone.com.tr",
  "yurticikargo.com", "araskargo.com.tr", "suratkargo.com.tr", "mngkargo.com.tr",
  // Türk haber / medya (yanlış "dikkat" damgasına karşı)
  "haberturk.com", "hurriyet.com.tr", "milliyet.com.tr", "sozcu.com.tr", "sabah.com.tr",
  "cnnturk.com", "ntv.com.tr", "cumhuriyet.com.tr", "trthaber.com", "aa.com.tr",
  "haberler.com", "mynet.com", "onedio.com", "eksisozluk.com", "webtekno.com",
  "yenisafak.com", "posta.com.tr", "takvim.com.tr", "haber7.com", "t24.com.tr",
]);

// Resmi Türk kurumsal uzantıları (nic.tr sıkı denetler → sahtesi alınamaz).
const RESMI_SONEK = [".gov.tr", ".edu.tr", ".bel.tr", ".pol.tr", ".tsk.tr", ".k12.tr"];

// Bir domain'in registrable (kayıt edilebilir) kısmını kabaca çıkar.
// alt.alan.example.com.tr → example.com.tr
function kokDomain(domain: string): string {
  const d = domain.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const p = d.split(".");
  if (p.length <= 2) return d;
  // İki parçalı TLD'ler (com.tr, gov.tr, org.uk…) için son 3 parça
  const ikiliTld = ["com.tr", "net.tr", "org.tr", "gov.tr", "edu.tr", "co.uk", "com.au"];
  const son2 = p.slice(-2).join(".");
  return ikiliTld.includes(son2) ? p.slice(-3).join(".") : p.slice(-2).join(".");
}

export function itibarliMi(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (RESMI_SONEK.some((s) => d.endsWith(s))) return true;
  if (ITIBARLI.has(d)) return true;
  return ITIBARLI.has(kokDomain(d));
}
