import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { aiClient, AI_MODELI } from "@/lib/ai";
import { geminiMetin, geminiVarMi } from "@/lib/gemini";
import { limitAsildi } from "@/lib/rateLimit";
import { markaAdaylariMarka } from "@/lib/store";
import { gercekTaklit } from "@/lib/korunanMarkalar";

export const runtime = "nodejs";
export const maxDuration = 45;

type Mesaj = { role: "user" | "assistant"; content: string };

// Sağlayıcı-bağımsız yanıt: önce Claude (varsa — güvenilir, 7/24), yoksa Gemini (503'e karşı 3 deneme).
async function yanitUret(system: string, mesajlar: Mesaj[]): Promise<string | null> {
  const claude = aiClient();
  if (claude) {
    try {
      const konusma: Anthropic.MessageParam[] = mesajlar.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const resp = await claude.messages.create({ model: AI_MODELI, max_tokens: 800, system, messages: konusma });
      const t = resp.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n").trim();
      if (t) return t;
    } catch { /* Claude başarısız → Gemini'ye düş */ }
  }
  if (geminiVarMi) {
    const konusma = mesajlar.slice(-12).map((m) => `${m.role === "user" ? "Müşteri" : "Destek"}: ${m.content}`).join("\n");
    const user = `Konuşma:\n${konusma}\n\nDestek olarak, son müşteri mesajına kısa ve net Türkçe yanıt ver:`;
    for (let i = 0; i < 3; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1200));
      const t = (await geminiMetin(system, user))?.trim();
      if (t) return t;
    }
  }
  return null;
}

// MÜŞTERİ DESTEK ASİSTANI (B2B) — markanın koruma panosunu KULLANAN müşteriye 7/24 yardım.
// Vatandaş sohbetinden (Nazar) AYRIdır: burada muhatap, markası korunan kurum/operatör.
const SISTEM =
  "Sen 'MirLeon Destek'sin — MirLeon marka koruma platformunun 7/24 müşteri destek asistanısın. " +
  "Muhatabın, markası taklit/dolandırıcılığa karşı korunan bir kurumun yetkilisi. Sıcak, profesyonel, NET konuş; kısa yanıt ver (en çok birkaç cümle). " +
  "Görevin: panodaki tespitleri açıklamak (skor ne demek, 'aktif tuzak/park/inceleme' farkı, USOM'a bildirme akışı, kapatma takibi), " +
  "sonraki adımı önermek, platformun ne yaptığını/yapmadığını DÜRÜST anlatmak. " +
  "ASLA abartma/uydurma: 'kapatıldı' gibi kesin ifadeleri yalnız veriyle söyle; USOM listesinde olmak ≠ site kapandı. " +
  "ASLA şifre/kart/ödeme bilgisi isteme, garanti verme. Aşağıda bu markanın GERÇEK pano özeti var — cevaplarını buna dayandır. " +
  "Çözemediğin, insan gerektiren (sözleşme, faturalandırma, özel takedown talebi) veya kullanıcının 'uzmanla görüşmek istiyorum' dediği durumda: " +
  "kısaca 'Bunu bir uzmanımıza iletebilirim — paneldeki Uzmana ilet düğmesini kullanabilirsiniz' de. Türkçe yanıt ver.";

async function markaOzeti(marka: string, markaAdi: string): Promise<string> {
  if (!marka) return "Şu an belirli bir marka seçili değil (genel operatör görünümü).";
  try {
    const ham = await markaAdaylariMarka(marka, 300);
    const gecerli = ham.filter((a) => a.manuel || gercekTaklit(a.domain, a.marka));
    const aktif = gecerli.filter((a) => a.durum === "aktif-tuzak" || a.durum === "canli").length;
    const park = gecerli.filter((a) => a.durum === "park" || a.durum === "yayinda-degil").length;
    const bildirilen = gecerli.filter((a) => a.bildirim?.zaman).length;
    const enYuksek = [...gecerli].sort((x, y) => (y.skor || 0) - (x.skor || 0)).slice(0, 5)
      .map((a) => `- ${a.domain} (skor ${a.skor}${a.bildirim?.zaman ? ", USOM'a bildirildi" : ", bildirilmedi"})`).join("\n");
    return `${markaAdi} markası pano özeti:\n` +
      `Toplam tespit: ${gecerli.length} · Aktif tuzak: ${aktif} · Park/pasif: ${park} · USOM'a bildirilen: ${bildirilen} · bekleyen: ${gecerli.length - bildirilen}\n` +
      `En yüksek skorlu tespitler:\n${enYuksek || "- (kayıt yok)"}`;
  } catch {
    return `${markaAdi} markası için pano özeti şu an alınamadı; genel yardım verebilirsin.`;
  }
}

function yedekCevap(): string {
  return "Merhaba, ben MirLeon Destek. Yapay zekâ yardımcısı şu an yanıt veremedi, " +
    "ama sorunuzu bir uzmanımıza iletebilirim — paneldeki \"Uzmana ilet\" düğmesini kullanın, en kısa sürede dönüş yapalım.";
}

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "destek", 30);
  if (limit) return limit;

  let body: { marka?: string; markaAdi?: string; mesajlar?: Mesaj[] };
  try { body = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }
  const mesajlar = Array.isArray(body.mesajlar) ? body.mesajlar : [];
  if (!mesajlar.length) return NextResponse.json({ hata: "Mesaj gerekli." }, { status: 400 });

  if (!aiClient() && !geminiVarMi) return NextResponse.json({ cevap: yedekCevap(), ai: false });

  try {
    const ozet = await markaOzeti((body.marka || "").toLowerCase(), body.markaAdi || body.marka || "Marka");
    const system = `${SISTEM}\n\n--- GERÇEK PANO VERİSİ ---\n${ozet}`;
    const cevap = await yanitUret(system, mesajlar);
    return NextResponse.json({ cevap: cevap || yedekCevap(), ai: !!cevap });
  } catch {
    return NextResponse.json({ cevap: yedekCevap(), ai: false });
  }
}
