import { NextRequest, NextResponse } from "next/server";
import { KORUNAN_MARKALAR } from "@/lib/korunanMarkalar";
import { tehditKontrol } from "@/lib/tehditListeleri";
import tls from "node:tls";
import { promises as dns } from "node:dns";

export const runtime = "nodejs";
export const maxDuration = 60;

// RESMÎ VARLIK SAĞLIK İZLEME — müşterinin verdiği resmî adresleri (resmiVarliklar) izler.
// DÜRÜSTLÜK: Kesin/ IP-bağımsız sinyal = SERTİFİKA (TLS el sıkışması gerçek sertifikayı verir).
// Bizim bulut-IP probumuzun HTTP 404/403'ü resmî sitede "down" DEĞİLDİR (WAF/coğrafi engel) →
// asla "sorunlu" demeyiz, en fazla "doğrulanamadı". Resmî siteyi yanlış alarma düşürmek yasak.

type VarlikSaglik = {
  domain: string;
  durum: "saglikli" | "dikkat" | "dogrulanamadi" | "sorunlu";
  ip: string | null;
  certGun: number | null;   // sertifikaya kalan gün (negatif = dolmuş)
  certVeren: string | null;
  http: number | null;      // bizim noktamızdan (ikincil/bilgi)
  karaListe: boolean;       // resmî adres yanlışlıkla/ele geçirilerek listede mi
  not: string;
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const cache: Record<string, { v: VarlikSaglik[]; zaman: number }> = {};
const TTL = 60 * 60 * 1000; // saatlik

function sertifikaBilgi(host: string): Promise<{ gun: number | null; veren: string | null }> {
  return new Promise((resolve) => {
    let bitti = false;
    const bit = (r: { gun: number | null; veren: string | null }) => { if (!bitti) { bitti = true; try { s.destroy(); } catch { /* */ } resolve(r); } };
    const s = tls.connect({ host, port: 443, servername: host, timeout: 9000, rejectUnauthorized: false }, () => {
      const c = s.getPeerCertificate();
      if (!c || !c.valid_to) return bit({ gun: null, veren: null });
      const gun = Math.floor((Date.parse(c.valid_to) - Date.now()) / 86400000);
      const ham = c.issuer && (c.issuer.O || c.issuer.CN);
      const veren = Array.isArray(ham) ? (ham[0] || null) : (ham || null);
      bit({ gun, veren });
    });
    s.on("error", () => bit({ gun: null, veren: null }));
    s.on("timeout", () => bit({ gun: null, veren: null }));
  });
}

async function varlikSagligi(domain: string): Promise<VarlikSaglik> {
  const [ipler, cert, tehdit] = await Promise.all([
    dns.resolve4(domain).catch(() => [] as string[]),
    sertifikaBilgi(domain),
    tehditKontrol(domain).catch(() => ({ usom: false, kaynaklar: [] as string[] })),
  ]);
  const ip = ipler[0] || null;
  const dnsVar = ipler.length > 0;
  // HTTP (ikincil) — tarayıcı UA; hata/engel resmî sitede alarm değildir.
  let http: number | null = null;
  try {
    const r = await fetch(`https://${domain}/`, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(10000) });
    http = r.status;
  } catch { http = null; }

  const karaListe = Boolean(tehdit.usom && tehdit.kaynaklar.length);
  // KARAR — sertifika öncelikli:
  let durum: VarlikSaglik["durum"]; let not = "";
  if (karaListe) { durum = "sorunlu"; not = "Resmî adres kara listede — ele geçirilmiş olabilir, ACİL doğrula."; }
  else if (cert.gun !== null && cert.gun <= 0) { durum = "sorunlu"; not = "Sertifika SÜRESİ DOLMUŞ — kullanıcı tarayıcıda uyarı görür, yenilenmeli."; }
  else if (cert.gun !== null && cert.gun < 30) { durum = "dikkat"; not = `Sertifikaya ${cert.gun} gün — yenileme zamanı yaklaştı.`; }
  else if (dnsVar && cert.gun !== null) {
    durum = "saglikli";
    not = (http && http >= 200 && http < 400) ? "Ayakta · içerik yayında." : "Ayakta (DNS + sertifika geçerli) · HTTP bizim erişim noktamızdan doğrulanamadı (WAF/coğrafi engel olabilir).";
  }
  else if (!dnsVar) { durum = "dogrulanamadi"; not = "Bizim çözücümüzden A kaydı gelmedi — yayında olmayabilir ya da coğrafi DNS; TR noktasından teyit gerekir."; }
  else { durum = "dogrulanamadi"; not = "Sertifika okunamadı — teyit gerekir."; }

  return { domain, durum, ip, certGun: cert.gun, certVeren: cert.veren, http, karaListe, not };
}

const kesfCache: Record<string, { v: (VarlikSaglik & { aciklama: string })[]; zaman: number }> = {};

export async function GET(req: NextRequest) {
  const marka = (new URL(req.url).searchParams.get("marka") || "").toLowerCase().trim();
  const m = KORUNAN_MARKALAR.find((x) => x.anahtar === marka);
  const liste = m?.resmiVarliklar || [];
  const kesfListe = m?.kesfedilenVarliklar || [];
  if (!liste.length && !kesfListe.length) return NextResponse.json({ marka, varliklar: [], kesfedilen: [], ozet: { toplam: 0, saglikli: 0, dikkat: 0, sorunlu: 0 } }, { headers: { "Cache-Control": "no-store" } });

  // MÜŞTERİ listesi (yetkili)
  const c = cache[marka];
  let varliklar: VarlikSaglik[];
  if (c && Date.now() - c.zaman < TTL) varliklar = c.v;
  else { varliklar = await Promise.all(liste.map(varlikSagligi)); cache[marka] = { v: varliklar, zaman: Date.now() }; }

  // KEŞFEDİLEN listesi (CT/DNS — müşteri onayı bekler)
  const kc = kesfCache[marka];
  let kesfedilen: (VarlikSaglik & { aciklama: string })[];
  if (kc && Date.now() - kc.zaman < TTL) kesfedilen = kc.v;
  else { kesfedilen = await Promise.all(kesfListe.map(async (k) => ({ ...(await varlikSagligi(k.domain)), aciklama: k.aciklama }))); kesfCache[marka] = { v: kesfedilen, zaman: Date.now() }; }

  const say = (d: VarlikSaglik["durum"]) => varliklar.filter((x) => x.durum === d).length;
  const ozet = { toplam: varliklar.length, saglikli: say("saglikli"), dikkat: say("dikkat") + say("dogrulanamadi"), sorunlu: say("sorunlu") };
  return NextResponse.json({ marka, varliklar, kesfedilen, ozet, guncelleme: cache[marka]?.zaman || Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
