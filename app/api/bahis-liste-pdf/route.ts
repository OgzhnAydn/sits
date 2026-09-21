import { NextRequest, NextResponse } from "next/server";
import { bahisTRHedefli } from "@/lib/store";
import { bahisListePdf, type BahisSatir } from "@/lib/pdf/BahisListePdf";
import { canlilikProbe } from "@/lib/canlilik";

export const runtime = "nodejs";
export const maxDuration = 300; // 70k+ satır tüm-liste → uzun; Vercel Pro'da 300sn'ye izin verilir

// Yasa dışı bahis TESPİT LİSTESİ (PDF) — TR-hedefli, güven ≥ eşik (vars %90), tıklanabilir bağlantılı.
// Dürüst çerçeve: USOM durumu kayıtlı; BTK engeli yurtdışı sunucudan güvenilir görülemez (PDF'te belirtilir).
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  // PDF (formatlı + ★) yüksek-güvenli alt küme (vars %90). TAM 70k liste PDF'e sığmıyor →
  // tamamı için /api/bahis-liste-csv (hafif, tüm TR-hedefli).
  const esik = Math.max(0, Math.min(99, Number(u.searchParams.get("esik")) || 90));
  // PDF'e yazılacak azami satır. Vars: TAMAMI (0/"hepsi" = sınırsız). Kullanıcı isterse ?adet=N ile kısar.
  const adetParam = (u.searchParams.get("adet") || "").toLowerCase();
  const kapak = adetParam === "" || adetParam === "hepsi" || adetParam === "0"
    ? Infinity : Math.max(100, Number(adetParam) || Infinity);

  // TR-hedefli kayıtların TAMAMINI çek (cursor-sayfalama). Sınır 90k → 70k+ evren tamamen okunur.
  const ham = await bahisTRHedefli(90000);
  const tr = ham.filter((a) => a.trHedefli && (a.guven || 0) >= esik && a.engelli !== true);
  tr.sort((a, b) => (b.guven || 0) - (a.guven || 0) || (b.zaman || 0) - (a.zaman || 0));

  // CANLILIK ★: 30k'nın tamamı denemek imkânsız → en yüksek güvenli ilk N adres canlilikProbe ile
  // denenir; içerik SUNANLARA (durum "live") ★ konur. Kalan satırlar listede kalır (★'sız).
  const PROBE_N = 40, BATCH = 40; // tek batch (~9sn) → tüm-liste üretimiyle birlikte 60sn'ye sığar
  const canliMap = new Map<string, boolean>();
  const probeList = tr.slice(0, PROBE_N).map((a) => a.domain);
  for (let i = 0; i < probeList.length; i += BATCH) {
    const grup = probeList.slice(i, i + BATCH);
    const res = await Promise.all(grup.map(async (d) => {
      try { const c = await canlilikProbe(d); return [d, c.durum === "live"] as const; } catch { return [d, false] as const; }
    }));
    for (const [d, live] of res) canliMap.set(d, live);
  }
  const canliSayi = [...canliMap.values()].filter(Boolean).length;

  const liste: BahisSatir[] = tr.slice(0, kapak).map((a) => ({
    domain: a.domain, marka: a.marka || null, guven: a.guven || 0, usomda: a.usomda ?? null, engelli: a.engelli ?? null, zaman: a.zaman || 0,
    canli: canliMap.get(a.domain) === true ? true : undefined,
  }));

  const refNo = `MRL-BAHIS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`;
  const tarih = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  const pdf = await bahisListePdf({ tarih, refNo, guvenEsik: esik, toplam: tr.length, canliSayi, probeAdet: probeList.length, liste });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="MirLeon-YasaDisiBahis-TespitListesi.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
