import { NextRequest, NextResponse } from "next/server";
import { bahisTRHedefli } from "@/lib/store";
import { bahisListePdf, type BahisSatir } from "@/lib/pdf/BahisListePdf";

export const runtime = "nodejs";
export const maxDuration = 60;

// Yasa dışı bahis TESPİT LİSTESİ (PDF) — TR-hedefli, güven ≥ eşik (vars %90), tıklanabilir bağlantılı.
// Dürüst çerçeve: USOM durumu kayıtlı; BTK engeli yurtdışı sunucudan güvenilir görülemez (PDF'te belirtilir).
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const esik = Math.max(50, Math.min(99, Number(u.searchParams.get("esik")) || 90));
  // PDF'e yazılacak azami satır. Vars: TAMAMI (0/"hepsi" = sınırsız). Kullanıcı isterse ?adet=N ile kısar.
  const adetParam = (u.searchParams.get("adet") || "").toLowerCase();
  const kapak = adetParam === "" || adetParam === "hepsi" || adetParam === "0"
    ? Infinity : Math.max(100, Number(adetParam) || Infinity);

  // TR-hedefli kayıtların TAMAMINI çek (cursor-sayfalama, ~30k / ~13sn), yüksek-güven + engelsiz süz.
  const ham = await bahisTRHedefli(60000);
  const tr = ham.filter((a) => a.trHedefli && (a.guven || 0) >= esik && a.engelli !== true);
  tr.sort((a, b) => (b.guven || 0) - (a.guven || 0) || (b.zaman || 0) - (a.zaman || 0));
  const bizOnce = tr.filter((a) => a.usomda === false).length;

  const liste: BahisSatir[] = tr.slice(0, kapak).map((a) => ({
    domain: a.domain, marka: a.marka || null, guven: a.guven || 0, usomda: a.usomda ?? null, engelli: a.engelli ?? null, zaman: a.zaman || 0,
  }));

  const refNo = `MRL-BAHIS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`;
  const tarih = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  const pdf = await bahisListePdf({ tarih, refNo, guvenEsik: esik, toplam: tr.length, bizOnce, liste });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="MirLeon-YasaDisiBahis-TespitListesi.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
