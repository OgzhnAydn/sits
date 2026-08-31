// Bir e-postanın veri-ihlallerinde geçip geçmediğini sayar (XposedOrNot — ücretsiz).
// Periyodik izlemede "yeni sızıntı çıktı mı" karşılaştırması için kullanılır.

export type SizintiDurum = { sayi: number; isimler: string[]; hata: boolean };

export async function sizintiSay(email: string): Promise<SizintiDurum> {
  try {
    const r = await fetch(`https://api.xposedornot.com/v1/check-email/${encodeURIComponent(email)}`, {
      headers: { "User-Agent": "Mozilla/5.0", accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) {
      // XposedOrNot 404 = hiç ihlalde yok (temiz)
      if (r.status === 404) return { sayi: 0, isimler: [], hata: false };
      return { sayi: 0, isimler: [], hata: true };
    }
    const j = await r.json();
    const liste: string[] = Array.isArray(j?.breaches?.[0]) ? j.breaches[0] : [];
    return { sayi: liste.length, isimler: liste.slice(0, 30), hata: false };
  } catch {
    return { sayi: 0, isimler: [], hata: true };
  }
}
