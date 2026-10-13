// TR-VANTAGE RENDER SERVİSİ — siteyi GERÇEK bir Türk kullanıcısı gibi ziyaret eder (TR locale/UA +
// opsiyonel TR residential proxy), KENDİ ekran görüntümüzü + içeriğini alır. urlscan'in bulut-IP'den
// gördüğü "temiz" sayfayı değil, kurbanın gördüğü GERÇEK sayfayı analiz ederiz (cloaking'i kırar).
// POST /render { url }  →  { status, finalUrl, title, html, shotB64, proxy, chain }
import http from "node:http";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT || 4700);
const SECRET = process.env.RENDER_SECRET || "";
const TR_PROXY = process.env.TR_PROXY || "";

// SSRF koruması: yalnız genel internet adresleri — özel/iç ağ host'ları reddet.
function ozelHost(h) {
  h = h.toLowerCase();
  return h === "localhost" || h === "::1" || /\.(local|internal)$/.test(h) ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

let browser;
async function tarayici() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"] });
  }
  return browser;
}

async function render(url) {
  const b = await tarayici();
  const opts = {
    locale: "tr-TR", timezoneId: "Europe/Istanbul",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true,
    extraHTTPHeaders: { "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5" },
  };
  if (TR_PROXY) { try { const u = new URL(TR_PROXY); opts.proxy = { server: `${u.protocol}//${u.host}`, username: u.username ? decodeURIComponent(u.username) : undefined, password: u.password ? decodeURIComponent(u.password) : undefined }; } catch { /* geçersiz proxy → proxysiz */ } }

  const ctx = await b.newContext(opts);
  // CLIPBOARD İZLEME — sayfa panoya bir şey yazarsa (clipboard hijack) kaydet.
  await ctx.addInitScript(() => {
    window.__clip = [];
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        const o = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = (t) => { try { window.__clip.push(String(t).slice(0, 400)); } catch { /* */ } return o(t); };
      }
    } catch { /* */ }
    document.addEventListener("copy", () => { try { const s = (document.getSelection && document.getSelection().toString()) || ""; if (s) window.__clip.push(s.slice(0, 400)); } catch { /* */ } });
  });
  const page = await ctx.newPage();

  // AĞ TRANSACTIONLARI — her istek+yanıt (method, durum, URL, tip, IP). Yönlendirme zinciri de burada.
  const network = [], chain = [];
  page.on("response", async (r) => {
    try {
      const req = r.request();
      let ip = ""; try { const a = await r.serverAddr(); ip = a ? a.ipAddress : ""; } catch { /* */ }
      const tip = (r.headers()["content-type"] || "").split(";")[0];
      if (network.length < 120) network.push({ m: req.method(), s: r.status(), u: r.url().slice(0, 200), t: tip, ip });
      if (req.isNavigationRequest()) chain.push({ u: r.url().slice(0, 120), s: r.status() });
    } catch { /* */ }
  });

  let status = null, finalUrl = url, title = "", html = "";
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    status = resp ? resp.status() : null;
    await page.waitForTimeout(2500); // JS yönlendirme / lazy içerik / geç istekler otursun
    finalUrl = page.url();
    title = (await page.title().catch(() => "")).slice(0, 200);
    html = (await page.content().catch(() => "")).slice(0, 80000);
  } catch { /* navigasyon hatası — yine de ekran görüntüsü deneriz */ }

  // SCRIPT TOPLAMA + ŞÜPHE ANALİZİ (inline + external; zararlı/obfuscation/clipboard-hijack işaretleri)
  let scripts = { inlineN: 0, external: [], supheli: [] };
  let clipboard = [];
  try {
    const sc = await page.evaluate(() => {
      const inline = [...document.querySelectorAll("script:not([src])")].map((s) => s.textContent || "").filter(Boolean);
      const external = [...document.querySelectorAll("script[src]")].map((s) => s.src).filter(Boolean).slice(0, 40);
      return { inlineN: inline.length, src: inline.join("\n").slice(0, 40000), external };
    });
    clipboard = await page.evaluate(() => (window.__clip || []).slice(0, 10)).catch(() => []);
    const SUPHE = [
      [/eval\s*\(|new Function\s*\(/i, "eval / dinamik kod çalıştırma"],
      [/atob\s*\(|unescape\s*\(|String\.fromCharCode/i, "gizlenmiş (obfuscated) kod"],
      [/clipboard\.writeText|execCommand\(['"]copy/i, "panoya yazma — clipboard ele geçirme olabilir"],
      [/coinhive|cryptonight|miner|coinimp|webminepool/i, "kripto madenciliği"],
      [/document\.write\s*\(\s*['"]?\s*<script/i, "dinamik script enjeksiyonu"],
      [/addEventListener\(['"]keydown['"]|onkeypress/i, "tuş-kaydı (keylogger) şüphesi"],
      [/\.php['"]?\s*[,)]|bot\d|sendData|exfil/i, "veri sızdırma ucu"],
    ];
    const havuz = sc.src + " " + sc.external.join(" ") + " " + clipboard.join(" ");
    scripts = { inlineN: sc.inlineN, external: sc.external, supheli: SUPHE.filter(([re]) => re.test(havuz)).map(([, ad]) => ad) };
  } catch { /* */ }

  let shotB64 = "";
  try { const buf = await page.screenshot({ type: "jpeg", quality: 68, fullPage: false }); shotB64 = buf.toString("base64"); } catch { /* */ }
  await ctx.close().catch(() => {});
  return { status, finalUrl, title, html, shotB64, proxy: !!TR_PROXY, chain: chain.slice(0, 12), network, clipboard, scripts };
}

// ── ANLIK RENDER WORKER ── Vercel kuyruğunu sürekli çeker, yakalanan her adayı kısa sürede
// gerçek tarayıcıda açar, sinyalleri geri yazar (Vercel cron timeout'u yok). SITS_API+secret ile açılır.
const SITS_API = (process.env.SITS_API || "").replace(/\/$/, "");
const WSECRET = process.env.RENDER_WORKER_SECRET || process.env.MARKA_ADAY_SECRET || "";
const WARALIK = Number(process.env.WORKER_ARALIK || 45000);
const WAKTIF = process.env.WORKER_AKTIF !== "0" && !!SITS_API && !!WSECRET;

function baslikFarkli(a, b) {
  const n = (s) => (s || "").toLowerCase().replace(/[^a-z0-9ğüşıöç]/gi, "").slice(0, 50);
  const x = n(a), y = n(b);
  if (!x || !y || x === y) return false;
  return !(x.includes(y.slice(0, 14)) || y.includes(x.slice(0, 14)));
}
async function botBaslik(url) {
  // BOT görünümü: googlebot UA + düz fetch (JS yok). Render'ın (kurban görünümü) başlığından
  // belirgin farklıysa → cloaking (bot'a temiz, kurbana tuzak).
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }, signal: AbortSignal.timeout(8000) });
    const h = await r.text();
    const m = h.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    return m ? m[1].trim() : "";
  } catch { return ""; }
}
async function workerTur() {
  try {
    const q = await fetch(`${SITS_API}/api/render-kuyruk?secret=${encodeURIComponent(WSECRET)}&n=6`, { signal: AbortSignal.timeout(15000) });
    if (!q.ok) { console.log(`[render-worker] kuyruk HTTP ${q.status}`); return 0; }
    const j = await q.json();
    const adaylar = j.adaylar || [];
    console.log(`[render-worker] kuyruk: ${adaylar.length} aday · tani ${JSON.stringify(j._tani || {})}`);
    let n = 0;
    for (const a of adaylar) {
      const url = "https://" + a.domain;
      const bt = await botBaslik(url);
      let r; try { r = await render(url); } catch { continue; }
      const host = a.domain.replace(/^www\./, "");
      const disHost = new Set((r.network || []).map((x) => { try { return new URL(x.u).hostname.replace(/^www\./, ""); } catch { return ""; } })
        .filter((h) => h && h !== host && !h.endsWith("." + host))).size;
      const sinyal = { zaman: Date.now(), finalUrl: r.finalUrl, yonlendirme: (r.chain || []).length,
        cloaking: !!bt && baslikFarkli(r.title || "", bt), clipboard: (r.clipboard || []).length > 0,
        supheliScript: r.scripts?.supheli || [], agHost: disHost };
      const pr = await fetch(`${SITS_API}/api/render-sonuc`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: WSECRET, domain: a.domain, marka: a.marka, render: sinyal }), signal: AbortSignal.timeout(15000) }).catch(() => null);
      console.log(`[render-worker] ${a.domain} → sonuc HTTP ${pr ? pr.status : "yok"} · cloaking=${sinyal.cloaking} clip=${sinyal.clipboard} supheli=${sinyal.supheliScript.length}`);
      n++;
    }
    return n;
  } catch { return 0; }
}
if (WAKTIF) {
  console.log(`[render-worker] aktif — kuyruk: ${SITS_API}/api/render-kuyruk, aralık ${WARALIK}ms`);
  (async function dongu() { for (;;) { const n = await workerTur().catch(() => 0); await new Promise((r) => setTimeout(r, n > 0 ? 3000 : WARALIK)); } })();
}

http.createServer(async (req, res) => {
  const cevap = (kod, obj) => { res.writeHead(kod, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "GET" && req.url === "/health") return cevap(200, { ok: true, proxy: !!TR_PROXY });
  if (req.method !== "POST" || !req.url.startsWith("/render")) { res.writeHead(404); res.end("x"); return; }
  if (SECRET && req.headers.authorization !== "Bearer " + SECRET) return cevap(401, { hata: "Yetkisiz." });
  let body = ""; req.on("data", (d) => { body += d; if (body.length > 4000) req.destroy(); });
  req.on("end", async () => {
    let url = ""; try { url = String(JSON.parse(body).url || "").trim(); } catch { /* */ }
    url = url.replace(/^https?:\/\//i, ""); url = "https://" + url.replace(/^\/+/, "");
    let host = ""; try { host = new URL(url).hostname; } catch { return cevap(400, { hata: "Geçersiz URL." }); }
    if (!host || ozelHost(host)) return cevap(400, { hata: "İzin verilmeyen host." });
    try { cevap(200, await render(url)); }
    catch (e) { cevap(500, { hata: String(e?.message || e) }); }
  });
}).listen(PORT, () => console.log(`[render] :${PORT} ${TR_PROXY ? "(TR proxy AKTİF)" : "(proxy yok — sunucu IP'si)"}`));

process.on("SIGTERM", async () => { try { await browser?.close(); } catch { /* */ } process.exit(0); });
