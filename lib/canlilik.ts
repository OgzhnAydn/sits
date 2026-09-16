// CANLILIK PROBE — bir domainin GERÇEK durumunu hızlı sonda ile sınıflandırır (batch-uyumlu).
// domainOsint (40-60s derin analiz) yerine hafif (~birkaç sn): DNS + HTTP status + SSL + redirect →
// Live/Dead/Parked/Redirect + kök neden. Kullanıcı vizyonu: "her alan adının DNS/HTTP/SSL durumunu
// eşzamanlı sorgulat + neden bu durumda olduğunu sınıflandır."
import net from "node:net";
import tls from "node:tls";

export type CanlilikDurum =
  | "live"        // aktif web sunucusu, içerik sunuyor (HTTP 200 + gerçek sayfa)
  | "redirect"    // 3xx / meta / JS ile başka adrese yönlendiriyor (cloaking)
  | "parked"      // domain kayıtlı ama park/satılık/varsayılan sunucu sayfası
  | "dead"        // sunucu kapalı: bağlantı reddedildi / zaman aşımı / DNS düştü
  | "bilinmiyor"; // sonda tamamlanamadı

export type CanlilikSonuc = {
  domain: string;
  durum: CanlilikDurum;
  dns: { cozuldu: boolean; ip: string | null; cname: string | null };
  http: { status: number | null; sunucu: string | null; hata: string | null };
  ssl: { gecerli: boolean | null; veren: string | null; bitis: string | null };
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

// TLS el sıkışması + sertifika bilgisi (geçerlilik/veren/bitiş). Port 443 kapalıysa null.
function sslKontrol(host: string, ms = 6000): Promise<{ gecerli: boolean | null; veren: string | null; bitis: string | null }> {
  return new Promise((coz) => {
    let bitti = false;
    const son = (v: { gecerli: boolean | null; veren: string | null; bitis: string | null }) => { if (!bitti) { bitti = true; try { s.destroy(); } catch { /* */ } coz(v); } };
    const s = tls.connect({ host, port: 443, servername: host, timeout: ms, rejectUnauthorized: false }, () => {
      try {
        const c = s.getPeerCertificate();
        const veren = c && c.issuer ? (String(c.issuer.O || c.issuer.CN || "") || null) : null;
        const bitis = c && c.valid_to ? new Date(c.valid_to).toISOString().slice(0, 10) : null;
        const gecerli = s.authorized || (!!bitis && new Date(bitis) > new Date()); // rejectUnauthorized=false → süre ile teyit
        son({ gecerli, veren, bitis });
      } catch { son({ gecerli: null, veren: null, bitis: null }); }
    });
    s.on("timeout", () => son({ gecerli: null, veren: null, bitis: null }));
    s.on("error", () => son({ gecerli: null, veren: null, bitis: null }));
  });
}

const TARAYICI = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", accept: "text/html" };
const PARK_IMZA = /this domain (is|may be) (for sale|available)|is available to be registered|parklogic|sedoparking|parkingcrew|hugedomains|dan\.com|buy this domain|domain (is )?for sale|this (web )?page is parked|alan ad[ıi] sat[ıi]l|welcome to nginx|apache2? (ubuntu |debian )?default page|it works!|default web (page|site)|site not (yet )?configured|litespeed web server|cyberpanel|domain (default|park)/i;
const YONLENDIR_KANAL = /t\.me\/|telegram|wa\.me\/|whatsapp|api\.whatsapp/i;

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
    ssl: { gecerli: null, veren: null, bitis: null },
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
  // Herhangi bir HTTP yanıtı döndüyse SUNUCU AYAKTA = live (redirect/park yukarıda yakalandı).
  if (httpRes.status && httpRes.status >= 200) {
    const st = httpRes.status;
    sonuc.durum = "live";
    const sun = httpRes.sunucu ? ", " + httpRes.sunucu : "";
    sonuc.kokNeden =
      st < 300 ? `Canlı web sunucusu (HTTP ${st}${sun}) — aktif içerik sunuyor.`
      : st === 401 || st === 403 ? `Sunucu ayakta ama erişim kısıtlı (HTTP ${st}) — bot-duvarı/yetki koruması olabilir.`
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
        const m = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+url=([^"'>\s]+)/i);
        if (m && m[1]) {
          const hedef = new URL(m[1], current).toString();
          if (new URL(hedef).hostname.replace(/^www\./, "") !== domain.replace(/^www\./, "")) {
            return { status: r.status, sunucu, hata: null, redirectHedef: hedef, park };
          }
        }
      } catch { /* gövde okunamadı */ }
    }
    return { status: r.status, sunucu, hata: null, redirectHedef: null, park };
  }
  return { status: null, sunucu: null, hata: "timeout", redirectHedef: null, park: false };
}
