import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { aiClient, AI_MODELI } from "@/lib/ai";
import { limitAsildi } from "@/lib/rateLimit";
import { normalize } from "@/lib/demoVeri";
import { domainOsint, telefonOsint, ibanOsint } from "@/lib/osint";
import { gostergeSorgula } from "@/lib/store";
import { seedKontrol } from "@/lib/seed";
import { gostergeCikar, siniflandir, KATEGORI_ADI } from "@/lib/analyze";
import { ESIK, GOSTER_ESIK } from "@/lib/esik";

export const runtime = "nodejs";
export const maxDuration = 45;

type Mesaj = { role: "user" | "assistant"; content: string };

// Claude'un çağırabileceği araç: bir göstergeyi (link/IBAN/telefon) kontrol et.
async function gostergeKontrolAraci(girisDeger: string) {
  const { deger, tip } = normalize(girisDeger);
  let rapor;
  if (tip === "url") rapor = await domainOsint(deger);
  else if (tip === "telefon") rapor = await telefonOsint(deger);
  else rapor = ibanOsint(deger);
  const crowd = await gostergeSorgula(deger, tip);
  const seed = seedKontrol(deger, tip);
  return {
    tip,
    deger,
    risk: rapor.risk,
    bulgular: rapor.bulgular,
    alanlar: rapor.alanlar,
    topluluk: crowd?.bulundu && crowd.benzersiz >= GOSTER_ESIK ? { benzersizBildiren: crowd.benzersiz, dogrulandi: crowd.benzersiz >= ESIK } : null,
    tehditListesinde: seed,
  };
}

const SISTEM =
  "Sen 'Nazar'sin — MirLeon'in sıcak, sakin ve net siber güvenlik danışmanısın. Karşındaki teknik bilgisi olmayan bir vatandaş. " +
  "Kısa ve anlaşılır konuş, korkutma, ASLA para/kart/şifre bilgisi isteme, garanti verme. " +
  "Kullanıcı bir bağlantı, IBAN veya telefon numarası paylaşırsa ya da 'şu güvenli mi' diye sorarsa, MUTLAKA gosterge_kontrol aracını kullan ve dönen gerçek verilere göre yorumla — uydurma. " +
  "MirLeon resmi bir devlet kurumu değildir; acil/suç durumunda 155 veya 112'ye, ihbar için ihbarweb.org.tr'ye yönlendir. Türkçe yanıt ver.";

const ARACLAR = [
  {
    name: "gosterge_kontrol",
    description:
      "Bir internet bağlantısı (URL), IBAN ya da telefon numarasının dolandırıcılık riskini kontrol eder: açık kaynak OSINT + topluluk bildirimleri + tehdit listesi. Kullanıcı bir değer paylaştığında kullan.",
    input_schema: {
      type: "object" as const,
      properties: { deger: { type: "string", description: "Kontrol edilecek URL, IBAN veya telefon" } },
      required: ["deger"],
    },
  },
];

// Anahtar yoksa: kural-tabanlı kısa yanıt.
async function yedekCevap(mesaj: string): Promise<string> {
  const g = gostergeCikar(mesaj);
  const kayitlar = [
    ...g.url.map((v) => ({ tip: "url", deger: v })),
    ...g.iban.map((v) => ({ tip: "iban", deger: v })),
    ...g.telefon.map((v) => ({ tip: "telefon", deger: v })),
  ];
  if (kayitlar.length) {
    const parcalar: string[] = [];
    for (const k of kayitlar) {
      const crowd = await gostergeSorgula(k.deger, k.tip);
      const seed = seedKontrol(k.deger, k.tip);
      let durum = "kaydımızda belirgin bir olumsuzluk yok";
      if (seed) durum = "açık tehdit listesinde (oltalama/zararlı) kayıtlı — işlem yapma";
      else if (crowd?.bulundu && crowd.benzersiz >= ESIK) durum = `${crowd.benzersiz} farklı kişi dolandırıcı olarak bildirmiş — çok dikkatli ol`;
      else if (crowd?.bulundu && crowd.benzersiz >= GOSTER_ESIK) durum = `${crowd.benzersiz} kişi bildirmiş (henüz doğrulanmadı) — temkinli ol`;
      parcalar.push(`• ${k.deger}: ${durum}.`);
    }
    return `Paylaştığını kontrol ettim:\n${parcalar.join("\n")}\n\nEmin olmadan kart/şifre bilgisi girme, ödeme yapma. Detaylı rapor için Sorgula ekranını kullanabilirsin.`;
  }
  const { kategori, guven } = siniflandir(mesaj, g);
  if (guven !== "yok" && kategori !== "diger") {
    return `Bu içerik ${KATEGORI_ADI[kategori]} gibi görünüyor (güven: ${guven}). Bir bağlantı, IBAN veya numara paylaşırsan onu da tek tek kontrol edebilirim. Acil bir durumsa 155/112.`;
  }
  return "Merhaba, ben Nazar Şüpheli bir bağlantı, IBAN, telefon numarası ya da mesaj yapıştır — birlikte kontrol edelim. (Not: yapay zeka anahtarı tanımlı olmadığından şu an temel modda yanıt veriyorum.)";
}

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "sohbet", 20);
  if (limit) return limit;

  let mesajlar: Mesaj[];
  try {
    ({ mesajlar } = await req.json());
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }
  if (!Array.isArray(mesajlar) || !mesajlar.length) {
    return NextResponse.json({ hata: "Mesaj gerekli." }, { status: 400 });
  }
  const sonKullanici = [...mesajlar].reverse().find((m) => m.role === "user")?.content || "";

  const client = aiClient();
  if (!client) {
    return NextResponse.json({ cevap: await yedekCevap(sonKullanici), ai: false });
  }

  try {
    const konusma: Anthropic.MessageParam[] = mesajlar
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    for (let tur = 0; tur < 4; tur++) {
      const resp = await client.messages.create({
        model: AI_MODELI,
        max_tokens: 900,
        system: SISTEM,
        tools: ARACLAR,
        messages: konusma,
      });

      if (resp.stop_reason === "tool_use") {
        konusma.push({ role: "assistant", content: resp.content });
        const sonuclar: Anthropic.ToolResultBlockParam[] = [];
        for (const blok of resp.content) {
          if (blok.type === "tool_use" && blok.name === "gosterge_kontrol") {
            const giris = (blok.input as { deger?: string })?.deger || "";
            const veri = await gostergeKontrolAraci(giris);
            sonuclar.push({ type: "tool_result", tool_use_id: blok.id, content: JSON.stringify(veri) });
          }
        }
        konusma.push({ role: "user", content: sonuclar });
        continue;
      }

      const cevap = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return NextResponse.json({ cevap, ai: true });
    }
    // araç döngüsü çok uzadı → yedeğe düş
    return NextResponse.json({ cevap: await yedekCevap(sonKullanici), ai: false });
  } catch {
    return NextResponse.json({ cevap: await yedekCevap(sonKullanici), ai: false });
  }
}
