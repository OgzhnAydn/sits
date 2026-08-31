import { NextRequest, NextResponse } from "next/server";
import { dilekceUret } from "@/lib/dilekce";
import { aiMetin, AI_MODELI } from "@/lib/ai";
import { limitAsildi } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 45;

type Girdi = {
  kategori: string;
  kategoriAdi: string;
  ozet: string;
  gostergeler: { url: string[]; iban: string[]; telefon: string[] };
  referansNo: string;
};

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "dilekce", 15);
  if (limit) return limit;

  let g: Girdi;
  try {
    ({ girdi: g } = await req.json());
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }
  if (!g || !g.kategori || !g.referansNo) {
    return NextResponse.json({ hata: "Eksik bilgi." }, { status: 400 });
  }

  const tarih = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const sablon = dilekceUret(g, tarih); // hem yedek hem 'kurum' kaynağı

  const gostergeMetin =
    [
      ...g.gostergeler.iban.map((v) => `IBAN: ${v}`),
      ...g.gostergeler.telefon.map((v) => `Telefon: ${v}`),
      ...g.gostergeler.url.map((v) => `Site: ${v}`),
    ].join(", ") || "yok";

  const ai = await aiMetin({
    model: AI_MODELI,
    maxTokens: 1300,
    system:
      "Sen deneyimli bir hukuk asistanısın. Türkçe, RESMİ bir şikayet dilekçesi yaz. " +
      "Gerçek kişisel bilgileri ASLA uydurma; [Ad Soyad], [T.C. Kimlik No], [İletişim] gibi köşeli parantezli yer tutucular bırak. " +
      "Uygun makama hitap, KONU, AÇIKLAMALAR (olayı akıcı ve hukuki dille anlat, verilen göstergeleri dahil et), HUKUKİ DAYANAK (ilgili TCK maddelerine genel atıf), TALEP ve tarih + imza bölümleri olsun. " +
      "Kısa ve net paragraflar. Sadece dilekçe metnini döndür, başka açıklama yazma.",
    icerik:
      `Makam: ${sablon.kurum}\nKategori: ${g.kategoriAdi}\nOlay özeti: ${g.ozet}\nTespit edilen göstergeler: ${gostergeMetin}\nTarih: ${tarih}\nReferans: ${g.referansNo}`,
  });

  if (ai && ai.length > 120) {
    const metin = `${ai}\n\n------------------------------------------------------------\nBu dilekçe SİTS ile hazırlanmıştır (Referans: ${g.referansNo}). İhbarınızı https://ihbarweb.org.tr üzerinden de yapabilirsiniz. Acil durumlarda 155.`;
    return NextResponse.json({ kurum: sablon.kurum, metin, ai: true });
  }
  return NextResponse.json({ ...sablon, ai: false });
}
