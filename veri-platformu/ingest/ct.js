// CT OKUMA + AYRIŞTIRMA — Certificate Transparency loglarından ham sertifikaları çeker ve
// {domain, all_domains, tld, ...} normalize kayıtlar üretir. Üretici (producer) bunu Redpanda'ya yazar.
import crypto from "node:crypto";

const IKI_PARCA = new Set(["com.tr", "net.tr", "org.tr", "gov.tr", "edu.tr", "co.uk", "org.uk", "com.au", "co.jp", "com.br", "com.mx", "co.za", "com.tw", "co.in"]);
function tldCoz(host) {
  const p = host.split(".");
  if (p.length < 2) return "";
  const son2 = p.slice(-2).join(".");
  return IKI_PARCA.has(son2) ? son2 : p[p.length - 1];
}

// gstatic log listesinden KULLANILABİLİR + güncel-zaman-aralıklı logları seç.
export async function loglariSec(adet = 6) {
  try {
    const j = await (await fetch("https://www.gstatic.com/ct/log_list/v3/log_list.json", { signal: AbortSignal.timeout(8000) })).json();
    const now = Date.now(), yil = new Date().getFullYear();
    const secili = [];
    for (const op of j.operators || []) for (const l of op.logs || []) {
      if (!l.state || !("usable" in l.state)) continue;
      const ti = l.temporal_interval;
      if (ti) { const bas = new Date(ti.start_inclusive).getTime(), bit = new Date(ti.end_exclusive).getTime(); if (now < bas || now > bit) continue; }
      if (String(l.url).includes(String(yil)) || String(l.url).includes(String(yil + 1))) secili.push({ url: l.url.replace(/\/$/, ""), ad: l.description || l.url });
    }
    return secili.slice(0, adet);
  } catch { return [{ url: "https://ct.googleapis.com/logs/us1/argon2026h2", ad: "argon2026h2" }]; }
}

export function derCoz(leafInput, extraData) {
  let leaf; try { leaf = Buffer.from(leafInput, "base64"); } catch { return null; }
  if (leaf.length < 15) return null;
  const tip = leaf.readUInt16BE(10);
  if (tip === 0) { const len = (leaf[12] << 16) | (leaf[13] << 8) | leaf[14]; return leaf.subarray(15, 15 + len); }
  if (tip === 1) { let ed; try { ed = Buffer.from(extraData || "", "base64"); } catch { return null; } if (ed.length < 3) return null; const len = (ed[0] << 16) | (ed[1] << 8) | ed[2]; return ed.subarray(3, 3 + len); }
  return null;
}

// DER → normalize sertifika kaydı (Redpanda mesaj gövdesi). Hata → null.
export function parseCert(der, logSource, index) {
  try {
    const x = new crypto.X509Certificate(der);
    const sanlar = (x.subjectAltName || "").split(",").map((s) => s.trim()).filter((s) => s.startsWith("DNS:")).map((s) => s.slice(4).toLowerCase());
    if (!sanlar.length) return null;
    const birincil = sanlar[0].replace(/^\*\./, "");
    const im = (x.issuer || "").match(/O=([^\n,]+)/);
    return {
      domain: birincil,
      all_domains: [...new Set(sanlar.map((d) => d.replace(/^\*\./, "")))].slice(0, 50),
      tld: tldCoz(birincil),
      is_wildcard: sanlar.some((d) => d.startsWith("*.")) ? 1 : 0,
      not_before: new Date(x.validFrom).toISOString(),
      not_after: new Date(x.validTo).toISOString(),
      issuer_ca: im ? im[1].trim().replace(/^"|"$/g, "") : "bilinmiyor",
      serial: (x.serialNumber || "").slice(0, 64),
      log_source: logSource,
      cert_index: index,
      leaf_hash: crypto.createHash("sha256").update(der).digest("hex").slice(0, 32),
    };
  } catch { return null; }
}

// Bir CT log turundan son sertifikaları çek → parseCert ile üret. Yield: normalize kayıt.
export async function* logTuru(log, pencere = 256) {
  try {
    const sth = await (await fetch(`${log.url}/ct/v1/get-sth`, { signal: AbortSignal.timeout(7000) })).json();
    const toplam = sth.tree_size || 0;
    if (toplam < pencere + 10) return;
    const geri = pencere + Math.floor(Math.random() * Math.min(50000, toplam - pencere - 1));
    const start = Math.max(0, toplam - geri), end = start + pencere - 1;
    const ent = await (await fetch(`${log.url}/ct/v1/get-entries?start=${start}&end=${end}`, { signal: AbortSignal.timeout(10000) })).json();
    let i = start;
    for (const e of ent.entries || []) {
      const der = derCoz(e.leaf_input, e.extra_data);
      const rec = der && parseCert(der, log.ad, i);
      i++;
      if (rec) yield rec;
    }
  } catch { /* bu log turu atla */ }
}
