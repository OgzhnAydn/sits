// İçerik-tabanlı taklit tespiti: bir domainin favicon'unu, korunan markaların
// favicon'larıyla karşılaştırır. İsim tamamen alakasız olsa bile (yyy.com.sr),
// site markanın favicon'unu KOPYALADIYSA → birebir eşleşir → güçlü taklit işareti.
//
// Marka favicon parmak izleri BİR KEZ hesaplanıp bellekte önbelleklenir (24 saat).

import { faviconHash } from "./osint";
import { KORUNAN_MARKALAR } from "./korunanMarkalar";

type MarkaRef = { anahtar: string; ad: string };
let cache: { map: Map<string, MarkaRef>; t: number } | null = null;
const TTL = 24 * 3600 * 1000;

async function markaFaviconlari(): Promise<Map<string, MarkaRef>> {
  if (cache && Date.now() - cache.t < TTL) return cache.map;
  const map = new Map<string, MarkaRef>();
  await Promise.all(
    KORUNAN_MARKALAR.map(async (m) => {
      const resmi = m.resmi[0];
      if (!resmi) return;
      const h = await faviconHash(resmi);
      if (h) map.set(h, { anahtar: m.anahtar, ad: m.ad });
    })
  );
  // En az birkaç marka favicon'u alınabildiyse önbelleğe yaz (boş cache'e takılma).
  if (map.size > 0) cache = { map, t: Date.now() };
  return map;
}

// Bir domainin favicon'u, korunan bir markanınkiyle birebir aynı mı?
export async function faviconMarkaEslesme(domain: string): Promise<MarkaRef | null> {
  const h = await faviconHash(domain);
  if (!h) return null;
  const map = await markaFaviconlari();
  return map.get(h) || null;
}
