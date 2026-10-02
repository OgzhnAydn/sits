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
  const page = await ctx.newPage();
  const chain = [];
  page.on("response", (r) => { try { if (r.request().isNavigationRequest()) chain.push({ u: r.url().slice(0, 120), s: r.status() }); } catch { /* */ } });

  let status = null, finalUrl = url, title = "", html = "";
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    status = resp ? resp.status() : null;
    await page.waitForTimeout(2000); // JS yönlendirme / lazy içerik otursun
    finalUrl = page.url();
    title = (await page.title().catch(() => "")).slice(0, 200);
    html = (await page.content().catch(() => "")).slice(0, 80000);
  } catch { /* navigasyon hatası — yine de ekran görüntüsü deneriz */ }

  let shotB64 = "";
  try { const buf = await page.screenshot({ type: "jpeg", quality: 68, fullPage: false }); shotB64 = buf.toString("base64"); } catch { /* */ }
  await ctx.close().catch(() => {});
  return { status, finalUrl, title, html, shotB64, proxy: !!TR_PROXY, chain: chain.slice(0, 12) };
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
