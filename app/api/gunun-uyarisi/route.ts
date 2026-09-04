import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { UYARILAR } from "@/lib/uyarilar";

export const runtime = "nodejs";

const KONULAR = [
  "sahte kargo SMS'i",
  "yatırım/kripto dolandırıcılığı",
  "WhatsApp/Instagram hesap ele geçirme",
  "sahte banka araması",
  "sahte alışveriş sitesi",
  "ödül/çekiliş tuzağı",
  "sextortion/şantaj",
  "sahte devlet/e-Devlet mesajı",
  "sahte iş ilanı",
  "QR kod dolandırıcılığı",
];

function yerel() {
  const gun = Math.floor(Date.now() / 86400000);
  return { ...UYARILAR[gun % UYARILAR.length], ai: false };
}

const SISTEM = `Sen "MirLeon", vatandaşları koruyan sıcak ve sevimli bir dijital koruyucu maskotsun.
Türkiye'deki güncel bir siber-dolandırıcılık türü hakkında KISA, karikatür/samimi dille bir uyarı üret.
SADECE geçerli JSON döndür: {"etiket":"2-3 kelimelik tür","baslik":"dikkat çekici kısa başlık","metin":"1-2 cümle somut korunma tavsiyesi"}
Korkutma, panik yaratma; sıcak ve net ol. Emoji kullanma. Türkçe yaz.`;

export async function GET(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json(yerel());

  try {
    const seed = Number(new URL(req.url).searchParams.get("s") ?? "0");
    const konu = KONULAR[(seed + Math.floor(Date.now() / 3600000)) % KONULAR.length];
    const client = new Anthropic({ apiKey: key });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: SISTEM,
      messages: [{ role: "user", content: `Konu: ${konu}. Bu konuda bugünün uyarısını üret.` }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!j.baslik || !j.metin) return NextResponse.json(yerel());
    return NextResponse.json({
      etiket: j.etiket ?? "Uyarı",
      baslik: j.baslik,
      metin: j.metin,
      ai: true,
    });
  } catch {
    return NextResponse.json(yerel());
  }
}
