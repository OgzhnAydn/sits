// CANLILIK PROBE — bir domainin GERÇEK durumunu hızlı sonda ile sınıflandırır (batch-uyumlu).
// domainOsint (40-60s derin analiz) yerine hafif (~birkaç sn): DNS + HTTP status + SSL + redirect →
// Live/Dead/Parked/Redirect + kök neden. Kullanıcı vizyonu: "her alan adının DNS/HTTP/SSL durumunu
// eşzamanlı sorgulat + neden bu durumda olduğunu sınıflandır."
import net from "node:net";
import tls from "node:tls";

export type CanlilikDurum =
  | "live"           // aktif web sunucusu, içerik sunuyor (HTTP 2xx + gerçek sayfa)
  | "redirect"       // 3xx / meta / JS ile başka adrese yönlendiriyor (cloaking)
  | "parked"         // domain kayıtlı ama park/satılık/varsayılan sunucu sayfası
  | "erisim_kisitli" // sunucu ayakta ama HTTP 401/403 — bot-duvarı/cloaking ya da kilitli; içerik DOĞRULANAMADI
  | "dead"           // sunucu kapalı: bağlantı reddedildi / zaman aşımı / DNS düştü
  | "bilinmiyor";    // sonda tamamlanamadı

export type CanlilikSonuc = {
  domain: string;
  durum: CanlilikDurum;
  dns: { cozuldu: boolean; ip: string | null; cname: string | null };
  http: { status: number | null; sunucu: string | null; hata: string | null };
  ssl: { gecerli: boolean | null; guvenilir: boolean | null; veren: string | null; bitis: string | null; baslangic?: string | null };
  redirectHedef: string | null;   // yönlendirme varsa nereye
  kokNeden: string;               // insan-okunur açıklama (kök neden analizi)
  zaman: number;
};

// Özel/iç IP'lere sonda atma (SSRF koruması).
function ozelIp(ip: string): boolean {
  return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|fe80)/i.test(ip);
}

// Tek çözücüye sorgu — Status kodu + A/CNAME. Bizim taraf hatasında status=null.
async function dnsSorgu(url: string, headers?: Record<string, string>): Promise<{ status: number | null; ip: string | null; cname: string | null }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), headers });
    const j = (await r.json()) as { Status?: number; Answer?: { type: number; data: string }[] };
    const ans = j.Answer || [];
    return { status: typeof j.Status === "number" ? j.Status : null, ip: ans.find((a) => a.type === 1)?.data || null, cname: ans.find((a) => a.type === 5)?.data || null };
  } catch { return { status: null, ip: null, cname: null }; }
}

// KESİNLİK KAPISI: "ölü/kaldırılmış" damgası EMİN olmalı → İKİ bağımsız çözücü (Google + Cloudflare).
// - "var": en az bir çözücü A/CNAME döndü.
// - "kaldirilmis": İKİSİ de NXDOMAIN (Status 3) → alan adı gerçekten silinmiş (kesin).
// - "adres-yok": ikisi de NOERROR ama A yok → alan var, web adresi yok (yayında değil).
// - "belirsiz": bir çözücü yanıt vermedi / uyuşmazlık → EMİN DEĞİLİZ, ölü DEME.
type DnsDurum = { cozuldu: boolean; ip: string | null; cname: string | null; kesinlik: "var" | "kaldirilmis" | "adres-yok" | "belirsiz" };
async function dnsCoz(domain: string): Promise<DnsDurum> {
  const [g, c] = await Promise.all([
    dnsSorgu(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`),
    dnsSorgu(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, { accept: "application/dns-json" }),
  ]);
  const ip = g.ip || c.ip, cname = g.cname || c.cname;
  if (ip || cname) return { cozuldu: true, ip, cname, kesinlik: "var" };
  const ikiYanit = g.status !== null && c.status !== null; // kesinlik için ikisi de konuşmalı
  if (!ikiYanit) return { cozuldu: false, ip: null, cname: null, kesinlik: "belirsiz" }; // bizim taraf hatası
  if (g.status === 3 && c.status === 3) return { cozuldu: false, ip: null, cname: null, kesinlik: "kaldirilmis" }; // NXDOMAIN × 2
  if (g.status === 0 && c.status === 0) return { cozuldu: false, ip: null, cname: null, kesinlik: "adres-yok" };
  return { cozuldu: false, ip: null, cname: null, kesinlik: "belirsiz" }; // uyuşmazlık → emin değiliz
}

// TLS el sıkışması + sertifika bilgisi. gecerli=süre içinde; guvenilir=TARAYICI GİBİ güvenilir köke
// zincirleniyor (s.authorized) → false ise kendinden-imzalı/geçersiz CA (phishing sinyali). Port 443 kapalıysa null.
type SslSonuc = { gecerli: boolean | null; guvenilir: boolean | null; veren: string | null; bitis: string | null; baslangic: string | null; hata: string | null };
function sslKontrol(host: string, ms = 6000): Promise<SslSonuc> {
  return new Promise((coz) => {
    let bitti = false;
    const bos: SslSonuc = { gecerli: null, guvenilir: null, veren: null, bitis: null, baslangic: null, hata: null };
    const son = (v: SslSonuc) => { if (!bitti) { bitti = true; try { s.destroy(); } catch { /* */ } coz(v); } };
    const s = tls.connect({ host, port: 443, servername: host, timeout: ms, rejectUnauthorized: false }, () => {
      try {
        const c = s.getPeerCertificate();
        const veren = c && c.issuer ? (String(c.issuer.O || c.issuer.CN || "") || null) : null;
        const bitis = c && c.valid_to ? new Date(c.valid_to).toISOString().slice(0, 10) : null;
        // Sertifika veriliş (notBefore) — "sertifika doğdu" anı; yakalama gecikmesi için.
        const baslangic = c && c.valid_from ? new Date(c.valid_from).toISOString().slice(0, 10) : null;
        const gecerli = !!bitis && new Date(bitis) > new Date(); // süre içinde mi
        const guvenilir = s.authorized === true; // güvenilir köke zincirleniyor mu (tarayıcı davranışı)
        const hata = s.authorized ? null : (s.authorizationError ? String(s.authorizationError) : "GÜVENİLMEZ");
        son({ gecerli, guvenilir, veren, bitis, baslangic, hata });
      } catch { son(bos); }
    });
    s.on("timeout", () => son(bos));
    s.on("error", () => son(bos));
  });
}

const TARAYICI = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", accept: "text/html" };
const PARK_IMZA = /this domain (is|may be) (for sale|available)|is available to be registered|parklogic|sedoparking|parkingcrew|hugedomains|dan\.com|buy this domain|domain (is )?for sale|this (web )?page is parked|alan ad[ıi] sat[ıi]l|welcome to nginx|apache2? (ubuntu |debian )?default page|it works!|default web (page|site)|site not (yet )?configured|litespeed web server|cyberpanel|domain (default|park)|location\.href\s*=\s*["']\/lander["']|img1\.wsimg\.com\/parking|caf\.godaddy/i;
const YONLENDIR_KANAL = /t\.me\/|telegram|wa\.me\/|whatsapp|api\.whatsapp/i;
// Park/satılık pazarları — buraya yönlendirme cloaking değil, alan adı satışta/park (aktif içerik yok).
const PARK_PAZAR = /(?:^|\.)(?:forsale\.godaddy|sale\.godaddy|godaddy)\.com$|(?:^|\.)sedo(?:parking)?\.com$|(?:^|\.)dan\.com$|(?:^|\.)afternic\.com$|(?:^|\.)hugedomains\.com$|(?:^|\.)bodis\.com$|(?:^|\.)above\.com$|(?:^|\.)parkingcrew\.(?:net|com)$|(?:^|\.)uniregistry(?:market)?\.(?:com|link)$|(?:^|\.)buydomains\.com$|(?:^|\.)domainmarket\.com$|(?:^|\.)sav\.com$|(?:^|\.)voodoo\.com$|(?:^|\.)namebright\.com$|(?:^|\.)cashparking\.com$/i;

// Ham TCP bağlanabilirlik (port 80/443 açık mı) — "connection refused" vs "timeout" ayrımı için.
function portAcik(host: string, port: number, ms = 5000): Promise<"acik" | "refused" | "timeout"> {
  return new Promise((coz) => {
    const s = new net.Socket();
    let bitti = false;
    const son = (v: "acik" | "refused" | "timeout") => { if (!bitti) { bitti = true; try { s.destroy(); } catch { /* */ } coz(v); } };
    s.setTimeout(ms);
    s.once("connect", () => son("acik"));
    s.once("timeout", () => son("timeout"));
    s.once("error", (e: NodeJS.ErrnoException) => son(e.code === "ECONNREFUSED" ? "refused" : "timeout"));
    s.connect(port, host);
  });
}

export async function canlilikProbe(domain: string): Promise<CanlilikSonuc> {
  const d = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  const sonuc: CanlilikSonuc = {
    domain: d, durum: "bilinmiyor",
    dns: { cozuldu: false, ip: null, cname: null },
    http: { status: null, sunucu: null, hata: null },
    ssl: { gecerli: null, guvenilir: null, veren: null, bitis: null, baslangic: null },
    redirectHedef: null, kokNeden: "", zaman: Date.now(),
  };

  // 1) DNS — İKİ çözücüyle kesinlik. "ölü" damgası ancak EMİN olunca (NXDOMAIN×2 veya A-yok×2).
  const dns = await dnsCoz(d);
  sonuc.dns = { cozuldu: dns.cozuldu, ip: dns.ip, cname: dns.cname };
  if (!dns.cozuldu) {
    if (dns.kesinlik === "kaldirilmis") {
      sonuc.durum = "dead";
      sonuc.kokNeden = "Alan adı DNS'ten KALDIRILMIŞ (NXDOMAIN — iki bağımsız çözücü teyitli): kayıt düşmüş/silinmiş, site artık yok.";
      return sonuc;
    }
    if (dns.kesinlik === "adres-yok") {
      sonuc.durum = "dead";
      sonuc.kokNeden = "Alan adı kayıtlı ama web adres kaydı (A) yok (iki çözücü teyitli) — şu an yayında değil.";
      return sonuc;
    }
    // BELİRSİZ: çözücü yanıtı eksik/uyuşmuyor → EMİN DEĞİLİZ, "ölü" DEME.
    sonuc.durum = "bilinmiyor";
    sonuc.kokNeden = "DNS durumu doğrulanamadı (çözücü yanıtı belirsiz/zaman aşımı) — kesinleşmedi, tekrar denenmeli.";
    return sonuc;
  }
  if (dns.ip && ozelIp(dns.ip)) {
    sonuc.durum = "bilinmiyor";
    sonuc.kokNeden = "Özel/iç IP'ye çözülüyor — sonda atlanmadı (güvenlik).";
    return sonuc;
  }

  // 2) SSL + port + HTTP — eşzamanlı.
  const [ssl, p443, httpRes] = await Promise.all([
    sslKontrol(d),
    portAcik(d, 443),
    httpProbe(d),
  ]);
  sonuc.ssl = ssl;
  sonuc.http = { status: httpRes.status, sunucu: httpRes.sunucu, hata: httpRes.hata };
  sonuc.redirectHedef = httpRes.redirectHedef;

  // 3) SINIFLANDIRMA + KÖK NEDEN
  // KESİNLİK: Buraya geldiysek DNS ÇÖZÜLDÜ → alan adı VAR, "kaldırılmış" DİYEMEYİZ. HTTP sondası
  // başarısızsa bu BİZİM vantajımızdan (Vercel cloud IP) erişilememesidir — site cloud-IP'yi
  // engelliyor / ağ yolu / geçici kapalı olabilir → "bilinmiyor" (EMİN DEĞİLİZ), asla "dead".
  // (Gerçek örnek: tuvturk.com.tr Vercel'den timeout ama site CANLI.) Tek kesin "dead" = NXDOMAIN.
  if (httpRes.hata === "refused" || (p443 === "refused" && httpRes.status === null)) {
    sonuc.durum = "bilinmiyor";
    sonuc.kokNeden = "Alan adı DNS'te KAYITLI ama sonda bağlantısı reddedildi (port kapalı görünüyor) — sunucu kapalı OLABİLİR ama cloud-IP engeli de olabilir; kaldırıldığı KESİN DEĞİL.";
    return sonuc;
  }
  if (httpRes.hata === "timeout" && httpRes.status === null) {
    sonuc.durum = "bilinmiyor";
    sonuc.kokNeden = "Alan adı DNS'te KAYITLI ama sunucu sondaya yanıt vermedi (zaman aşımı) — site cloud-IP'mizi engelliyor ya da geçici kapalı olabilir; kaldırıldığı KESİN DEĞİL.";
    return sonuc;
  }
  if (httpRes.hata === "ssl") {
    sonuc.durum = "bilinmiyor";
    sonuc.kokNeden = "TLS el sıkışması başarısız — sondadan doğrulanamadı (sertifika/TLS hatası ya da engelleme).";
    return sonuc;
  }
  if (httpRes.hata && httpRes.status === null) {
    sonuc.durum = "bilinmiyor";
    sonuc.kokNeden = "Alan adı DNS'te var ama sondadan erişilemedi — kaldırıldığı KESİN DEĞİL.";
    return sonuc;
  }
  if (httpRes.redirectHedef) {
    let hedefHost = "";
    try { hedefHost = new URL(httpRes.redirectHedef).hostname.replace(/^www\./, ""); } catch { /* */ }
    // SATIŞ/PARK pazarına (forsale.godaddy, sedo, dan, afternic…) yönlendirme = cloaking DEĞİL:
    // alan adı satışa çıkarılmış/park edilmiş, aktif oltalama sayfası yok → "parked".
    if (hedefHost && PARK_PAZAR.test(hedefHost)) {
      sonuc.durum = "parked";
      sonuc.kokNeden = `Alan adı satışa çıkarılmış / park sayfasına (${hedefHost}) yönleniyor — aktif içerik yok, pasif izleme adayı.`;
      return sonuc;
    }
    const kanal = YONLENDIR_KANAL.test(httpRes.redirectHedef);
    sonuc.durum = "redirect";
    sonuc.kokNeden = kanal
      ? `Telegram/WhatsApp dolandırıcılık kanalına yönlendiriyor: ${httpRes.redirectHedef.slice(0, 80)}`
      : `Başka adrese yönlendiriyor (cloaking): ${httpRes.redirectHedef.slice(0, 80)}`;
    return sonuc;
  }
  if (httpRes.park) {
    sonuc.durum = "parked";
    sonuc.kokNeden = "Park/satılık ya da varsayılan sunucu sayfası — içerik yüklenmemiş, pasif izleme adayı.";
    return sonuc;
  }
  // HTTP 401/403: sunucu ayakta ama İÇERİK YOK (Forbidden). "CANLI" DEMEK FAZLA İDDİALI — bot-duvarı
  // ardında cloaklanmış phishing OLABİLİR ya da kilitli/kaldırılmış olabilir; ikisi de doğrulanamaz →
  // ayrı "erisim_kisitli" durumu (ne kesin canlı ne ölü).
  if (httpRes.status === 401 || httpRes.status === 403) {
    sonuc.durum = "erisim_kisitli";
    sonuc.kokNeden = `Sunucu ayakta ama erişim kısıtlı (HTTP ${httpRes.status}) — içerik bot-duvarı/cloaking ardında olabilir ya da kilitli; canlı phishing içeriği DOĞRULANAMADI.`;
    return sonuc;
  }
  // Diğer HTTP yanıtları SUNUCU AYAKTA = live (redirect/park/401/403 yukarıda ayrıldı).
  if (httpRes.status && httpRes.status >= 200) {
    const st = httpRes.status;
    sonuc.durum = "live";
    const sun = httpRes.sunucu ? ", " + httpRes.sunucu : "";
    sonuc.kokNeden =
      st < 300 ? `Canlı web sunucusu (HTTP ${st}${sun}) — aktif içerik sunuyor.`
      : st === 404 ? `Sunucu ayakta, sayfa bulunamadı (HTTP 404) — altyapı hazır, içerik henüz yüklenmemiş olabilir.`
      : st >= 500 ? `Sunucu ayakta ama uygulama hatası (HTTP ${st}) — veritabanı/kod hatası (kurulum yarım).`
      : `Sunucu ayakta (HTTP ${st}${sun}).`;
    return sonuc;
  }
  sonuc.durum = "bilinmiyor";
  sonuc.kokNeden = "Sonda tamamlanamadı.";
  return sonuc;
}

// HTTP sondası: redirect'i MANUEL izle (hedefi yakala), park/kanal içeriğini oku.
async function httpProbe(domain: string): Promise<{ status: number | null; sunucu: string | null; hata: string | null; redirectHedef: string | null; park: boolean }> {
  let current = `https://${domain}/`;
  for (let i = 0; i < 4; i++) {
    let r: Response;
    try {
      r = await fetch(current, { redirect: "manual", headers: TARAYICI, signal: AbortSignal.timeout(9000) });
    } catch (e) {
      const msg = (e as Error).message.toLowerCase();
      const hata = /econnrefused|refused/.test(msg) ? "refused" : /certificate|ssl|tls|handshake/.test(msg) ? "ssl" : /timeout|aborted/.test(msg) ? "timeout" : "hata";
      // İlk denemede https başarısızsa http'ye düş (bir kez).
      if (i === 0 && current.startsWith("https://")) { current = `http://${domain}/`; continue; }
      return { status: null, sunucu: null, hata, redirectHedef: null, park: false };
    }
    const sunucu = r.headers.get("server");
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (loc) {
        const hedef = new URL(loc, current).toString();
        // Aynı hosta (http→https, /→/tr) yönlendirme "cloaking" değil — izlemeye devam et.
        try {
          if (new URL(hedef).hostname.replace(/^www\./, "") === domain.replace(/^www\./, "")) { current = hedef; continue; }
        } catch { /* */ }
        return { status: r.status, sunucu, hata: null, redirectHedef: hedef, park: false };
      }
    }
    // 200/4xx/5xx — gövdeyi (park/kanal için) oku.
    let park = false;
    if (r.status === 200) {
      try {
        const html = (await r.text()).slice(0, 8000);
        park = PARK_IMZA.test(html);
        // İstemci-taraflı yönlendirme: meta-refresh VEYA sayfa başındaki JS location.
        // (GoDaddy satılık sayfası forsale.godaddy.com'a JS ile atar; yalnız meta bakmak yetmez.)
        const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+url=([^"'>\s]+)/i);
        const js = html.match(/(?:window\.|top\.|self\.|document\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i)
          || html.match(/location\.(?:replace|assign)\s*\(\s*["']([^"']+)["']/i);
        const ham = (meta && meta[1]) || (js && js[1]);
        if (ham) {
          const hedef = new URL(ham.replace(/^['"]|['"]$/g, "").trim(), current).toString();
          if (/^https?:/i.test(hedef) && new URL(hedef).hostname.replace(/^www\./, "") !== domain.replace(/^www\./, "")) {
            return { status: r.status, sunucu, hata: null, redirectHedef: hedef, park };
          }
        }
      } catch { /* gövde okunamadı */ }
    }
    return { status: r.status, sunucu, hata: null, redirectHedef: null, park };
  }
  return { status: null, sunucu: null, hata: "timeout", redirectHedef: null, park: false };
}
