import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { AVCI_MARKALAR, gercekTaklit } from "@/lib/korunanMarkalar";

export const runtime = "nodejs";

// CANLI CT PANELİ — 6 logun canlı boyutları + örneklem akışı + aşama sayıları.
// Sol panel: akış · Orta: her log için tespit aşamaları · Sağ: tespitler (ayrı API).

type Log = { url: string; ad: string; kisa: string; op: string };
let LOGLAR: Log[] | null = null;
let LOG_T = 0;

function kisaAd(desc: string, url: string): string {
  const m = desc.match(/'([^']+)'/);
  if (m) return m[1];
  return (url.split("/").filter(Boolean).pop() || url).slice(0, 14);
}

async function loglariSec(): Promise<Log[]> {
  if (LOGLAR && Date.now() - LOG_T < 3_600_000) return LOGLAR;
  try {
    const j = (await (await fetch("https://www.gstatic.com/ct/log_list/v3/log_list.json", { signal: AbortSignal.timeout(8000) })).json()) as {
      operators?: { name?: string; logs?: { url: string; description?: string; state?: Record<string, unknown>; temporal_interval?: { start_inclusive: string; end_exclusive: string } }[] }[];
    };
    const now = Date.now();
    const perOp: Log[][] = [];
    for (const op of j.operators || []) {
      const grup: Log[] = [];
      for (const log of op.logs || []) {
        const st = log.state && Object.keys(log.state)[0];
        const ti = log.temporal_interval;
        const kapsar = !ti || (Date.parse(ti.start_inclusive) <= now && now < Date.parse(ti.end_exclusive));
        if ((st === "usable" || st === "qualified") && kapsar) {
          grup.push({ url: log.url.replace(/\/$/, ""), ad: log.description || log.url, kisa: kisaAd(log.description || "", log.url), op: op.name || "" });
        }
      }
      if (grup.length) perOp.push(grup);
    }
    const sec: Log[] = [];
    for (let i = 0; sec.length < 6; i++) {
      let eklendi = false;
      for (const g of perOp) if (g[i]) { sec.push(g[i]); eklendi = true; if (sec.length >= 6) break; }
      if (!eklendi) break;
    }
    if (sec.length) { LOGLAR = sec; LOG_T = now; }
  } catch {
    /* liste alınamadı — varsa eski seçim */
  }
  return LOGLAR || [];
}

function entryBilgi(leafInput: string, extraData?: string): { domain: string; ca: string } | null {
  let leaf: Buffer;
  try { leaf = Buffer.from(leafInput, "base64"); } catch { return null; }
  if (leaf.length < 15) return null;
  const tip = leaf.readUInt16BE(10);
  let der: Buffer;
  if (tip === 0) { const len = (leaf[12] << 16) | (leaf[13] << 8) | leaf[14]; der = leaf.subarray(15, 15 + len); }
  else if (tip === 1) { let ed: Buffer; try { ed = Buffer.from(extraData || "", "base64"); } catch { return null; } if (ed.length < 3) return null; const len = (ed[0] << 16) | (ed[1] << 8) | ed[2]; der = ed.subarray(3, 3 + len); }
  else return null;
  try {
    const x = new crypto.X509Certificate(der);
    const san = (x.subjectAltName || "").split(",").map((s) => s.trim()).filter((s) => s.startsWith("DNS:")).map((s) => s.slice(4).toLowerCase());
    if (!san.length) return null;
    const im = (x.issuer || "").match(/O=([^\n]+)/);
    return { domain: san[0], ca: im ? im[1].trim().replace(/^"|"$/g, "") : "" };
  } catch { return null; }
}

// Ucuz ön-filtre: domain herhangi bir marka anahtarını içeriyor mu?
function onFiltreGecer(domain: string): boolean {
  for (const m of AVCI_MARKALAR) if (domain.includes(m.anahtar)) return true;
  return false;
}
function eslesenMarka(domain: string): string | null {
  for (const m of AVCI_MARKALAR) if (gercekTaklit(domain, m.anahtar)) return m.ad;
  return null;
}

export async function GET() {
  const loglar = await loglariSec();
  if (!loglar.length) return NextResponse.json({ ok: false, loglar: [], akis: [] });

  // Tüm logların canlı boyutu (get-sth ucuz). get-entries yalnız DÖNEN çift log (429 koruması).
  const grup = Math.floor(Date.now() / 3000) % Math.ceil(loglar.length / 2);
  const orneklenecek = new Set([grup * 2, grup * 2 + 1]);

  const sonuc = await Promise.all(
    loglar.map(async (log, idx) => {
      let toplam = 0;
      try {
        const sth = (await (await fetch(`${log.url}/ct/v1/get-sth`, { signal: AbortSignal.timeout(7000) })).json()) as { tree_size?: number };
        toplam = sth.tree_size || 0;
      } catch { /* bu logun boyutu alınamadı */ }
      let cekildi = 0, onFiltre = 0, eslesme = 0;
      const akis: { i: number; kisa: string; domain: string; ca: string; marka: string | null }[] = [];
      if (orneklenecek.has(idx) && toplam > 20) {
        try {
          const start = toplam - 9, end = toplam - 1;
          const ent = (await (await fetch(`${log.url}/ct/v1/get-entries?start=${start}&end=${end}`, { signal: AbortSignal.timeout(9000) })).json()) as { entries?: { leaf_input: string; extra_data?: string }[] };
          for (let k = 0; k < (ent.entries || []).length; k++) {
            const b = entryBilgi(ent.entries![k].leaf_input, ent.entries![k].extra_data);
            if (!b) continue;
            cekildi++;
            const of = onFiltreGecer(b.domain);
            if (of) onFiltre++;
            const marka = of ? eslesenMarka(b.domain) : null;
            if (marka) eslesme++;
            akis.push({ i: start + k, kisa: log.kisa, domain: b.domain, ca: b.ca, marka });
          }
        } catch { /* get-entries başarısız (429?) — bu tur atla */ }
      }
      return { log, toplam, cekildi, onFiltre, eslesme, akis };
    })
  );

  const loglarOut = sonuc.map((s) => ({ kisa: s.log.kisa, ad: s.log.ad, op: s.log.op, toplam: s.toplam, cekildi: s.cekildi, onFiltre: s.onFiltre, eslesme: s.eslesme, orneklendi: s.cekildi > 0 }));
  const akis = sonuc.flatMap((s) => s.akis).sort((a, b) => a.i - b.i);
  const toplam = sonuc.reduce((a, s) => a + s.toplam, 0);

  return NextResponse.json({ ok: true, toplam, loglar: loglarOut, akis });
}
