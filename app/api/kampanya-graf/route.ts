import { NextRequest, NextResponse } from "next/server";
import { domainImzalari, dnaEslesenler, takipEslesenler, telegramEslesenler } from "@/lib/store";
import { pasifDns } from "@/lib/passiveDns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// KAMPANYA GRAFİĞİ — tek bir domainin AYNI SALDIRGANA ait kardeş domainlerini, bağ NEDENİYLE
// birlikte döndürür (düğüm + kenar). "1 yakala → tüm küme." Kaynaklar GERÇEK, uydurma yok:
//  • altyapı-DNA (NS/ASN/MX/favicon imzası)  • takip-ID (GA/GTM/AdSense/Pixel)
//  • Telegram exfil kanalı  • aynı sunucu (reverse-IP / passive DNS)
const CORS: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
export async function OPTIONS() { return new NextResponse(null, { headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" } }); }

const sade = (v: string) => String(v || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

export async function GET(req: NextRequest) {
  const domain = sade(new URL(req.url).searchParams.get("domain") || "");
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return NextResponse.json({ hata: "geçerli domain gerekli." }, { status: 400, headers: CORS });

  const imz = await domainImzalari(domain).catch(() => null);

  const [dna, takip, tg, pdns] = await Promise.all([
    imz?.dnaImza ? dnaEslesenler(imz.dnaImza, domain).catch(() => []) : Promise.resolve([] as string[]),
    imz?.takipId ? takipEslesenler(imz.takipId, domain).catch(() => []) : Promise.resolve([] as string[]),
    imz?.telegramImza ? telegramEslesenler(imz.telegramImza, domain).catch(() => []) : Promise.resolve([] as string[]),
    pasifDns(domain).then((p) => (p.kardesDomainler || []).map((k) => sade(k.domain))).catch(() => [] as string[]),
  ]);

  // Bir domain birden çok NEDENLE bağlı olabilir → neden kümesi topla.
  const edgeMap = new Map<string, Set<string>>();
  const ekle = (liste: string[], neden: string) => {
    for (const d of liste) { const dd = sade(d); if (dd && dd !== domain && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(dd)) { if (!edgeMap.has(dd)) edgeMap.set(dd, new Set()); edgeMap.get(dd)!.add(neden); } }
  };
  ekle(dna, "altyapı-DNA");
  ekle(takip, "takip-ID");
  ekle(tg, "Telegram");
  ekle(pdns, "aynı sunucu (IP)");

  const nodes = [
    { id: domain, merkez: true, risk: imz?.risk ?? null },
    ...[...edgeMap.keys()].map((d) => ({ id: d, merkez: false })),
  ];
  const edges = [...edgeMap.entries()].map(([hedef, nedenler]) => ({ kaynak: domain, hedef, nedenler: [...nedenler] }));

  // Neden başına sayım (özet).
  const nedenSayim: Record<string, number> = {};
  for (const [, ns] of edgeMap) for (const n of ns) nedenSayim[n] = (nedenSayim[n] || 0) + 1;

  return NextResponse.json(
    {
      ok: true,
      merkez: domain,
      analizEdilmis: !!imz,
      imzalar: { dna: !!imz?.dnaImza, takip: !!imz?.takipId, telegram: !!imz?.telegramImza },
      kumeBoyutu: nodes.length,        // merkez + kardeşler
      kardesSayisi: edgeMap.size,
      nedenSayim,
      nodes,
      edges,
      not: imz ? undefined : "Bu domain henüz derin analiz edilmemiş — DNA/takip/Telegram imzaları yok; yalnız aynı-IP kardeşleri gösterilir. Önce /api/osint ile analiz edilince küme zenginleşir.",
    },
    { headers: CORS },
  );
}
