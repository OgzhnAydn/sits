import { NextRequest, NextResponse } from "next/server";
import { yenidenTaraBatch } from "@/lib/yenidenTara";

export const runtime = "nodejs";
export const maxDuration = 60;

// Aktif adayları yeniden tarayıp risk yörüngesine nokta ekler.
// Manuel: /api/yeniden-tara?n=8   ·   ?offset=N ile belirli batch.
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const n = Math.min(15, Math.max(1, Number(u.searchParams.get("n")) || 8));
  const offParam = u.searchParams.get("offset");
  const sonuc = await yenidenTaraBatch(n, offParam !== null ? Number(offParam) : undefined);
  return NextResponse.json({ ok: true, ...sonuc });
}
