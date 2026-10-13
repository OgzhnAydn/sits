// ── STATİK DAVRANIŞ SONDASI — "sitenin NE YAPTIĞINA bak" (her tespit için, hafif) ──────────────
// TR-render (Playwright) ağır ve yalnız öne çıkanlarda çalışır. Bu sonda SADECE bir HTTP fetch + HTML
// analiziyle, HER canlı tespit için şunları çıkarır (DevTools "initiator/ağ" zincirinin statik karşılığı):
//   • disHostlar      → sayfanın bağlandığı 3. parti host'lar (CDN/analitik ayrılır, gürültü olmasın)
//   • formHedefleri   → <form action> hedefleri + hassas alan (şifre/kart/kimlik) var mı
//   • exfilHedef      → hassas form + DIŞ/şüpheli action = olası veri-sızdırma ucu
//   • supheliScript   → inline script'te zararlı imzalar (obfuscation/exfil/keylogger)
//   • clipboardHijack → panoya yazma (clipboard ele geçirme) script'i
// UYDURMA YOK: ulaşılamazsa boş döner. FP koruması: exfil yalnız HASSAS ALAN + dış/şüpheli hedefte;
// tanınan CDN/analitik host'lar "3. parti" sayılır ama exfil işareti DEĞİL.
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5", Accept: "text/html" };

export type FormHedef = { host: string; url: string; disAktarim: boolean; hassasAlan: boolean };
export type DavranisStatik = {
  ulasildi: boolean;
  disHostlar: string[];
  ucuncuTaraf: string[];       // tanınan CDN/analitik (nötr)
  formHedefleri: FormHedef[];
  exfilHedef: string | null;   // en güçlü: hassas form → dış/şüpheli hedef
  supheliScript: string[];
  clipboardHijack: boolean;
  not?: string;
};

// Tanınan CDN / analitik / yasal 3. taraf — exfil DEĞİL (gürültüyü ayırır).
const TANINAN_3P = /(?:^|\.)(?:googleapis|gstatic|google-analytics|googletagmanager|google|doubleclick|cloudflare|cloudflareinsights|jsdelivr|unpkg|cdnjs|bootstrapcdn|jquery|fontawesome|fonts|facebook|fbcdn|twitter|x|linkedin|youtube|ytimg|gravatar|wp|recaptcha|hotjar|sentry|segment|mixpanel|intercom|hcaptcha|cloudfront|akamai|fastly|azureedge|stripe|paypal)\.(?:com|net|org|io|co)$/i;

// Hassas alan imzaları (sayfa hassas veri topluyor mu).
const HASSAS = /type=["']?password|autocomplete=["']?(?:current-password|new-password|cc-number|cc-csc)|name=["']?(?:pass|sifre|şifre|parola|password|cardnumber|kart|iban|cvv|cvc|tckn|tc_?kimlik|kimlik_?no)["']?|placeholder=["'][^"']*(?:şifre|sifre|parola|kart numaras|iban|cvv|kimlik|tc no)/i;

// Zararlı/şüpheli script imzaları (render SUPHE listesinin statik karşılığı).
const SCRIPT_SUPHE: [RegExp, string][] = [
  [/clipboard\.writeText|execCommand\(\s*['"]copy['"]|navigator\.clipboard/i, "panoya yazma (clipboard ele geçirme olabilir)"],
  [/addEventListener\(\s*['"]keydown['"]|onkeypress|onkeyup\s*=/i, "tuş-kaydı (keylogger) şüphesi"],
  [/document\.write\s*\(\s*['"]?\s*<script|eval\s*\(\s*(?:atob|unescape|String\.fromCharCode)/i, "dinamik/gizlenmiş kod enjeksiyonu"],
  [/(?:fetch|XMLHttpRequest|\.ajax)\s*\([^)]*\.php|new Image\(\)\.src\s*=|navigator\.sendBeacon/i, "arka planda veri gönderme ucu"],
  [/coinhive|cryptonight|webminepool|coinimp|miner\.start/i, "kripto madenciliği"],
  [/t\.me\/|api\.telegram\.org|wa\.me\//i, "Telegram/WhatsApp kanalına veri/yönlendirme"],
];

const host = (u: string, taban: string): string => { try { return new URL(u, `https://${taban}/`).hostname.replace(/^www\./, ""); } catch { return ""; } };

export async function davranisStatik(domain: string): Promise<DavranisStatik> {
  const d = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  const bos: DavranisStatik = { ulasildi: false, disHostlar: [], ucuncuTaraf: [], formHedefleri: [], exfilHedef: null, supheliScript: [], clipboardHijack: false };

  let html = "", sonUrl = `https://${d}/`;
  for (const url of [`https://${d}/`, `http://${d}/`]) {
    try {
      const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(8000) });
      sonUrl = r.url || url;
      html = (await r.text()).slice(0, 200_000);
      if (html) break;
    } catch { /* diğer şema */ }
  }
  if (!html) return { ...bos, not: "İçeriğe ulaşılamadı." };

  const kok = d.replace(/^www\./, "");
  const ayniKok = (h: string) => h === kok || h.endsWith("." + kok) || kok.endsWith("." + h);

  // 1) Bağlanılan host'lar — src/href/action mutlak URL'leri (initiator benzeri bağımlılık listesi).
  const dis = new Set<string>(), p3 = new Set<string>();
  for (const m of html.matchAll(/(?:src|href|action|data-src|content)=["'](https?:\/\/[^"'>\s]+)["']/gi)) {
    const h = host(m[1], d);
    if (!h || ayniKok(h)) continue;
    if (TANINAN_3P.test(h)) p3.add(h); else dis.add(h);
  }

  // 2) Formlar — action hedefi + hassas alan var mı (exfil kararı için).
  const formlar: FormHedef[] = [];
  const hassasSayfa = HASSAS.test(html);
  for (const m of html.matchAll(/<form\b[^>]*\baction=["']([^"']+)["'][^>]*>/gi)) {
    const u = m[1].trim(); if (!u || u.startsWith("#") || u.startsWith("javascript:")) continue;
    const h = host(u, d) || kok;
    const disAktarim = !ayniKok(h) || /\.php(\?|$)/i.test(u);
    formlar.push({ host: h, url: new URL(u, sonUrl).toString().slice(0, 160), disAktarim, hassasAlan: hassasSayfa });
  }

  // 3) Inline script imza analizi + clipboard hijack.
  let scriptHavuz = "";
  for (const m of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) scriptHavuz += "\n" + m[1];
  scriptHavuz = scriptHavuz.slice(0, 120_000);
  const supheli = SCRIPT_SUPHE.filter(([re]) => re.test(scriptHavuz)).map(([, ad]) => ad);
  const clipboardHijack = /clipboard\.writeText|execCommand\(\s*['"]copy['"]/i.test(scriptHavuz);

  // 4) EXFİL KARARI (en güçlü, FP-korumalı): HASSAS alan var VE action dış host'a/.php'ye gidiyor.
  const exfilForm = formlar.find((f) => f.hassasAlan && f.disAktarim && !TANINAN_3P.test(f.host));
  const exfilHedef = exfilForm ? exfilForm.url : null;

  return {
    ulasildi: true,
    disHostlar: [...dis].slice(0, 12),
    ucuncuTaraf: [...p3].slice(0, 12),
    formHedefleri: formlar.slice(0, 6),
    exfilHedef,
    supheliScript: supheli,
    clipboardHijack,
  };
}
