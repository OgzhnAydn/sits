// Basit, bağımlılıksız IP-bazlı kayan pencere rate limit.
// Not: Serverless'te bellek örnek-başınadır (best-effort). Asıl sağlamlık için
// ileride Upstash/Redis veya Firestore sayaç eklenebilir; bu tek örnek taşmasını
// ve yaygın kötüye-kullanımı engeller.

type Kova = { sayi: number; sifirla: number };
const kovalar = new Map<string, Kova>();

export type LimitSonuc = { ok: boolean; kalan: number; bekleMs: number };

export function rateLimit(anahtar: string, limit: number, pencereMs: number): LimitSonuc {
  const simdi = Date.now();

  // Ara sıra süresi geçmiş kovaları temizle (bellek şişmesin)
  if (kovalar.size > 5000) {
    for (const [k, v] of kovalar) if (simdi > v.sifirla) kovalar.delete(k);
  }

  const k = kovalar.get(anahtar);
  if (!k || simdi > k.sifirla) {
    kovalar.set(anahtar, { sayi: 1, sifirla: simdi + pencereMs });
    return { ok: true, kalan: limit - 1, bekleMs: pencereMs };
  }
  k.sayi++;
  if (k.sayi > limit) return { ok: false, kalan: 0, bekleMs: k.sifirla - simdi };
  return { ok: true, kalan: limit - k.sayi, bekleMs: k.sifirla - simdi };
}

export function istemciIp(req: Request): string {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) return (xff.split(",")[0] || "").trim() || "anon";
  return h.get("x-real-ip") || "anon";
}

// Uç için tek satırlık yardımcı: limit aşıldıysa 429 Response döner, değilse null.
export function limitAsildi(req: Request, kapsam: string, limit: number, pencereMs = 60_000): Response | null {
  const s = rateLimit(`${kapsam}:${istemciIp(req)}`, limit, pencereMs);
  if (s.ok) return null;
  const saniye = Math.ceil(s.bekleMs / 1000);
  return new Response(
    JSON.stringify({ hata: `Çok fazla istek. ${saniye} sn sonra tekrar dene.` }),
    { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(saniye) } }
  );
}
