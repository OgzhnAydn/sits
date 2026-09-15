import { NextRequest, NextResponse } from "next/server";
import { pasifDns } from "@/lib/passiveDns";
import { canlilikProbe } from "@/lib/canlilik";
import { cacheOku, cacheYaz } from "@/lib/osintCache";

export const runtime = "nodejs";
export const maxDuration = 30;

// Passive DNS + altyapı korelasyonu: bir domainin geçmiş IP'leri + aynı (adanmış) IP'yi
// paylaşan kardeş domainler. Paylaşımlı/CDN altyapı yanlış-pozitif kapısı modülde.
// Ücretsiz kaynakların (mnemonic/HackerTarget) kotasını korumak için 12 saat cache'lenir.
export async function GET(req: NextRequest) {
  const domain = (new URL(req.url).searchParams.get("domain") || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]{4,253}\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ hata: "Geçerli bir alan adı gir (ör. ornek.com)." }, { status: 400 });
  }

  const onbellek = (await cacheOku("pdns", domain)) as Awaited<ReturnType<typeof pasifDns>> | null;
  if (onbellek) return NextResponse.json({ domain, ...onbellek, onbellek: true });

  // Mevcut IP'yi canlılık probundan al (pivot adayı) — best-effort.
  let mevcutIp: string | undefined;
  try { mevcutIp = (await canlilikProbe(domain)).dns.ip || undefined; } catch { /* yoksa mnemonic geçmişi yeter */ }

  const sonuc = await pasifDns(domain, mevcutIp);
  await cacheYaz("pdns", domain, sonuc).catch(() => {});
  return NextResponse.json({ domain, mevcutIp: mevcutIp || null, ...sonuc });
}
