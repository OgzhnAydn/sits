import { NextRequest, NextResponse } from "next/server";
import { gorselAnaliz } from "@/lib/gorsel";
import { limitAsildi } from "@/lib/rateLimit";
import { geminiVarMi, geminiGorselJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 45;

type GorselYorum = {
  tur: string;
  risk: number;
  ozet: string;
  taktik: string[];
  gostergeler?: { iban?: string[]; telefon?: string[]; url?: string[] };
  adimlar: string[];
};

// Gemini Vision: görsele bakıp dolandırıcılık/tehdit/oltalama değerlendirmesi.
// Ekran görüntüsündeki metni OKUR + görsel bağlamı (logo taklidi, sahte arayüz)
// değerlendirir — düz OCR'ın bir adım ötesi.
async function gorselYorumla(b64: string, mime: string): Promise<GorselYorum | null> {
  if (!geminiVarMi) return null;
  const system =
    "Sen MirLeon'in kıdemli siber güvenlik analistisin. Sana bir ekran görüntüsü ya da görsel verilir " +
    "(SMS, WhatsApp/DM, sosyal medya paylaşımı, e-posta, site vb.). Teknik bilgisi olmayan bir vatandaş için değerlendir. " +
    "Görseldeki METNİ oku; dolandırıcılık, oltalama, tehdit, taciz, sahte hesap açısından incele; kullanılan manipülasyon taktiğini (aciliyet, otorite taklidi, korkutma, ödül) tespit et. Logo/arayüz taklidi varsa belirt. " +
    'SADECE şu JSON: {"tur":"kısa etiket (ör. Kargo dolandırıcılığı/Banka oltalaması/Tehdit/Temiz)","risk":0-100 sayı,"ozet":"1-2 cümle sıcak, net sonuç","taktik":["kullanılan taktikler"],"gostergeler":{"iban":[],"telefon":[],"url":[]},"adimlar":["somut adım"]}. ' +
    "Türkçe, korkutmadan, garanti vermeden. Görselde metin yoksa/ilgisizse tur:'Belirsiz' de.";
  return geminiGorselJson<GorselYorum>(system, "Bu görseli değerlendir.", b64, mime);
}

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

// Skora göre Nazar'ın sıcak yorumu (AI kredisi gerektirmez).
function hamsiYorum(skor: number, ai: number, deepfake: number): { ozet: string; adimlar: string[] } {
  if (skor >= 70) {
    return {
      ozet:
        deepfake >= ai
          ? "Bu fotoğrafta güçlü bir deepfake (yüz değiştirme) işareti var. Çok dikkatli ol."
          : "Bu görsel büyük ihtimalle yapay zeka ile üretilmiş. Gerçek bir kişi/olay sanma.",
      adimlar: [
        "Bu görsele dayanarak para gönderme, kişisel bilgi paylaşma.",
        "Karşı tarafı görüntülü aramaya davet et — sahte profiller genelde kaçınır.",
        "Şüpheliyse görseli ve profili not al, ihbarweb.org.tr üzerinden bildir.",
      ],
    };
  }
  if (skor >= 40) {
    return {
      ozet: "Bazı yapay üretim işaretleri var ama kesin değil. Temkinli ol.",
      adimlar: [
        "Görselin kaynağını sorgula — nereden geldi, kim gönderdi?",
        "Aynı fotoğrafı Google Görseller'de tersine aratmayı dene.",
        "Acele bir isteğe (para, kod, bilgi) eşlik ediyorsa dur ve doğrula.",
      ],
    };
  }
  return {
    ozet: "Belirgin bir yapay üretim ya da deepfake izi bulunamadı. Yine de tek başına kanıt sayma.",
    adimlar: [
      "Tespit %100 kesin değildir; şüphen varsa başka işaretlere de bak.",
      "Kişiyi tanımıyorsan görüntülü görüşmeyle doğrula.",
    ],
  };
}

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "gorsel", 15);
  if (limit) return limit;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ hata: "Görsel alınamadı." }, { status: 400 });
  }

  const dosya = form.get("gorsel");
  if (!(dosya instanceof Blob)) {
    return NextResponse.json({ hata: "Bir görsel dosyası ekle." }, { status: 400 });
  }
  if (!dosya.type.startsWith("image/")) {
    return NextResponse.json({ hata: "Sadece görsel (JPG/PNG/WebP) yükleyebilirsin." }, { status: 400 });
  }
  if (dosya.size > MAX_BYTES) {
    return NextResponse.json({ hata: "Görsel 12 MB'tan küçük olmalı." }, { status: 400 });
  }

  const buf = Buffer.from(await dosya.arrayBuffer());

  // Sightengine (deepfake/AI) + Claude Vision (içerik değerlendirmesi) paralel
  const [rapor, gorselYorum] = await Promise.all([
    gorselAnaliz(buf, dosya.type),
    gorselYorumla(buf.toString("base64"), dosya.type),
  ]);
  const yorum = hamsiYorum(rapor.skor, rapor.aiOlasilik, rapor.deepfakeOlasilik);

  return NextResponse.json({ ...rapor, yorum, gorselYorum });
}
