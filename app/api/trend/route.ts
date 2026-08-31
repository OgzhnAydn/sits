import { NextRequest, NextResponse } from "next/server";
import { sonGostergeler, kampanyaVerisi, type GostergeOzet } from "@/lib/store";
import { kampanyalariBul } from "@/lib/kampanya";
import { ESIK } from "@/lib/esik";
import { aiJson, AI_HIZLI } from "@/lib/ai";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";

const TIP_ADI: Record<string, string> = { url: "site", iban: "IBAN", telefon: "telefon" };

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "trend", 15);
  if (limit) return limit;

  const [veri, kampDugum] = await Promise.all([sonGostergeler(200), kampanyaVerisi(200)]);
  const kampanyalar = kampanyalariBul(kampDugum);

  // Sayımlar
  const tipSay: Record<string, number> = {};
  const katSay: Record<string, number> = {};
  for (const g of veri) {
    tipSay[g.tip] = (tipSay[g.tip] || 0) + 1;
    if (g.kategori) katSay[g.kategori] = (katSay[g.kategori] || 0) + 1;
  }
  const dogrulanan = veri.filter((g) => g.benzersiz >= ESIK);
  const enCok: GostergeOzet[] = [...veri].sort((a, b) => b.benzersiz - a.benzersiz).slice(0, 6);

  const sayilar = {
    toplam: veri.length,
    dogrulanan: dogrulanan.length,
    site: tipSay.url || 0,
    iban: tipSay.iban || 0,
    telefon: tipSay.telefon || 0,
    kategoriler: katSay,
  };

  if (!veri.length) {
    return NextResponse.json({
      sayilar,
      enCok: [],
      kampanyalar,
      ozet: "Henüz trend çıkaracak kadar bildirim yok. İlk bildirimler geldikçe burada haftalık dolandırıcılık nabzını göreceksin.",
      maddeler: [],
      ai: false,
    });
  }

  // AI özet (varsa); yoksa kural-tabanlı
  const katMetin = Object.entries(katSay).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(", ");
  const ai = await aiJson<{ ozet: string; maddeler: string[] }>({
    model: AI_HIZLI,
    maxTokens: 500,
    system:
      "Sen SİTS'in dolandırıcılık istihbarat analistisin. Verilen topluluk bildirim istatistiklerinden kısa bir 'haftalık nabız' çıkar. " +
      'SADECE JSON: {"ozet":"1-2 cümle genel durum","maddeler":["dikkat çeken 2-4 kısa gözlem"]}. Türkçe, abartma, kişi/marka itham etme.',
    icerik: `Toplam gösterge: ${veri.length}. Doğrulanmış: ${dogrulanan.length}. Site: ${sayilar.site}, IBAN: ${sayilar.iban}, Telefon: ${sayilar.telefon}. Kategoriler: ${katMetin || "yok"}.`,
  });

  const enCokTip = Object.entries(tipSay).sort((a, b) => b[1] - a[1])[0];
  const yedekOzet = `Son ${veri.length} gösterge içinde ${dogrulanan.length} tanesi ${ESIK}+ kişi tarafından doğrulandı. En çok ${enCokTip ? TIP_ADI[enCokTip[0]] || enCokTip[0] : "gösterge"} bildirildi.`;
  const yedekMaddeler = Object.entries(katSay).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} kategorisinde ${v} gösterge.`);

  return NextResponse.json({
    sayilar,
    enCok,
    kampanyalar,
    ozet: ai?.ozet || yedekOzet,
    maddeler: ai?.maddeler?.length ? ai.maddeler : yedekMaddeler,
    ai: Boolean(ai),
  });
}
