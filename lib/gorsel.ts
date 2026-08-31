// Görsel deepfake / yapay-zeka üretimi tespiti (üçüncü taraf: Sightengine).
// Anahtar yoksa "sağlayıcı gerekli" raporu döner; UI yine de akışı gösterir.

export type GorselRapor = {
  aiOlasilik: number; // 0-100: yapay zeka ile üretilmiş olma ihtimali
  deepfakeOlasilik: number; // 0-100: yüz değiştirme (deepfake) ihtimali
  skor: number; // 0-100: genel şüphe (ikisinin en yükseği)
  seviye: "Yüksek" | "Orta" | "Düşük";
  bulgular: string[];
  saglayici: "sightengine" | "yok";
  gercek: boolean; // gerçek bir API'den mi geldi
  hata?: string;
};

function seviye(skor: number): "Yüksek" | "Orta" | "Düşük" {
  if (skor >= 70) return "Yüksek";
  if (skor >= 40) return "Orta";
  return "Düşük";
}

// Sağlayıcı tanımlı değilse: dürüst boş rapor.
function anahtarYok(): GorselRapor {
  return {
    aiOlasilik: 0,
    deepfakeOlasilik: 0,
    skor: 0,
    seviye: "Düşük",
    bulgular: [
      "Görsel analizi için sağlayıcı anahtarı tanımlı değil.",
      ".env.local içine SIGHTENGINE_USER ve SIGHTENGINE_SECRET ekleyince aktifleşir.",
    ],
    saglayici: "yok",
    gercek: false,
    hata: "Sağlayıcı anahtarı yok.",
  };
}

export async function gorselAnaliz(buf: Buffer, mime: string): Promise<GorselRapor> {
  const user = process.env.SIGHTENGINE_USER;
  const secret = process.env.SIGHTENGINE_SECRET;
  if (!user || !secret) return anahtarYok();

  try {
    const fd = new FormData();
    fd.append("media", new Blob([new Uint8Array(buf)], { type: mime || "image/jpeg" }), "gorsel");
    fd.append("models", "genai,deepfake");
    fd.append("api_user", user);
    fd.append("api_secret", secret);

    const resp = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: fd,
    });
    const d = await resp.json();

    if (d.status !== "success") {
      return {
        ...anahtarYok(),
        hata: d.error?.message || "Sağlayıcı yanıtı başarısız.",
      };
    }

    // Sightengine skorları 0..1 arası döner.
    const ai = Math.round((d.type?.ai_generated ?? 0) * 100);
    const deepfake = Math.round((d.type?.deepfake ?? 0) * 100);
    const skor = Math.max(ai, deepfake);

    const bulgular: string[] = [];
    if (ai >= 40)
      bulgular.push(`Görsel %${ai} ihtimalle yapay zeka ile üretilmiş görünüyor (Midjourney, DALL·E vb.).`);
    if (deepfake >= 40)
      bulgular.push(`Yüzde %${deepfake} ihtimalle deepfake (yüz değiştirme) izi var.`);
    if (!bulgular.length)
      bulgular.push("Belirgin bir yapay üretim ya da deepfake izi bulunamadı.");

    return {
      aiOlasilik: ai,
      deepfakeOlasilik: deepfake,
      skor,
      seviye: seviye(skor),
      bulgular,
      saglayici: "sightengine",
      gercek: true,
    };
  } catch (e) {
    return {
      ...anahtarYok(),
      hata: e instanceof Error ? e.message : "Sağlayıcıya ulaşılamadı.",
    };
  }
}
