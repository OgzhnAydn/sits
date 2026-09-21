import { NextRequest, NextResponse } from "next/server";
import { bahisTRHedefli } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

// TAM yasa dışı bahis listesi (CSV) — TR-hedefli TÜM tespitler. PDF 70k satırda 300sn'ye
// sığmaz; CSV render'sızdır → tamamı hızlı dışa aktarılır. Türkçe Excel için ; ayraç + UTF-8 BOM.
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const esik = Math.max(0, Math.min(99, Number(u.searchParams.get("esik")) || 0)); // vars: TÜMÜ

  const ham = await bahisTRHedefli(90000);
  const tr = ham.filter((a) => a.trHedefli && (a.guven || 0) >= esik && a.engelli !== true);
  tr.sort((a, b) => (b.guven || 0) - (a.guven || 0) || (b.zaman || 0) - (a.zaman || 0));

  const esc = (s: unknown) => { const t = String(s ?? ""); return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const gun = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : "");
  const satir: string[] = ["sira;domain;marka;guven;ilk_gorulme"];
  for (let i = 0; i < tr.length; i++) {
    const a = tr[i];
    satir.push([i + 1, a.domain, a.marka || "", a.guven || 0, gun(a.zaman)].map(esc).join(";"));
  }
  const csv = "﻿" + satir.join("\r\n"); // BOM → Excel Türkçe karakterleri doğru okur

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="MirLeon-YasaDisiBahis-TumListe.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
