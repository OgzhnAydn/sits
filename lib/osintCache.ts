// OSINT sonuçları için sunucu-içi (bellek) önbellek — dış API kotasını korur.
// Not: Serverless'te bellek örnek-başınadır (best-effort). Firestore yerine bellek
// kullanıyoruz ki App Check enforcement client-SDK yazmalarını kesince cache kırılmasın.
// İleride paylaşımlı cache gerekirse Admin SDK + Firestore veya Redis eklenebilir.

const TTL_MS = 3 * 60 * 60 * 1000; // 3 saat — güvenlik aracı için taze; anlık "yeniden tara" cache'i taze:true ile atlar

type Giris = { rapor: unknown; ms: number };
const bellek = new Map<string, Giris>();

function anahtar(tip: string, deger: string) {
  return `${tip}_${deger.toLowerCase().replace(/[^a-z0-9]/g, "")}`.slice(0, 200);
}

// Derin kopya — çağıran cache'ten aldığı raporu mutasyona uğratınca (route,
// crowd/seed/kampanya bulgularını EKLER) saklı nesne bozulmasın diye şart.
function kopya<T>(x: T): T {
  try {
    return structuredClone(x);
  } catch {
    return JSON.parse(JSON.stringify(x)) as T;
  }
}

export async function cacheOku(tip: string, deger: string): Promise<unknown | null> {
  const g = bellek.get(anahtar(tip, deger));
  if (!g) return null;
  if (Date.now() - g.ms > TTL_MS) {
    bellek.delete(anahtar(tip, deger));
    return null;
  }
  return kopya(g.rapor); // çağıran mutasyonu saklı kopyaya sızmasın
}

export async function cacheYaz(tip: string, deger: string, rapor: unknown): Promise<void> {
  // Ara sıra bayat girişleri temizle (bellek şişmesin)
  if (bellek.size > 5000) {
    const simdi = Date.now();
    for (const [k, v] of bellek) if (simdi - v.ms > TTL_MS) bellek.delete(k);
  }
  bellek.set(anahtar(tip, deger), { rapor: kopya(rapor), ms: Date.now() });
}
