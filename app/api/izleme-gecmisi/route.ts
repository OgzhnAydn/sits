import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, firebaseHazir } from "@/lib/firebase";

export const runtime = "nodejs";

// İZLEME GEÇMİŞİ — bir sahte adresin DOĞUŞUNDAN bugüne kadar bizim onu periyodik izlediğimizin
// DÜRÜST kaydı. İki parça döner:
//  • olaylar  : aday doc'undaki GERÇEK denetim izi (certAni/zaman/yaşam-geçişleri/render/bildirim/son-tarama)
//  • kareler  : tarih-bazlı EKRAN GÖRÜNTÜSÜ arşivi — her çağrıda güncel görüntü DEĞİŞTİYSE eklenir (birikir)
// Uydurma yok: yoksa boş döner; park/ölü adreste görüntü alınamaz, o zaman kare eklenmez.
const CORS: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
export async function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

const belgeId = (deger: string) => `dom_${deger.toLowerCase().replace(/[^a-z0-9]/g, "")}`.slice(0, 200);
const sade = (v: string) => v.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

type Olay = { t: number; baslik: string; tur: string; not?: string };
type Kare = { t: number; ekran: string; durum: string | null; risk: number | null };

export async function GET(req: NextRequest) {
  const domain = sade(new URL(req.url).searchParams.get("domain") || "");
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return NextResponse.json({ hata: "geçerli domain gerekli." }, { status: 400, headers: CORS });
  if (!firebaseHazir || !db) return NextResponse.json({ domain, olaylar: [], kareler: [], guncel: null, not: "veri kaynağı kapalı" }, { headers: CORS });

  let a: Record<string, unknown> | null = null;
  try { const snap = await getDoc(doc(db, "marka_adaylari", belgeId(domain))); if (snap.exists()) a = snap.data() as Record<string, unknown>; } catch { /* kurallar yoksa geç */ }
  if (!a) return NextResponse.json({ domain, olaylar: [], kareler: [], guncel: null, not: "Bu adres için izleme kaydı yok." }, { headers: CORS });

  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const olaylar: Olay[] = [];
  if (num(a.certAni)) olaylar.push({ t: a.certAni as number, baslik: "Sertifika alındı (adresin doğuşu)", tur: "dogum" });
  if (num(a.zaman)) olaylar.push({ t: a.zaman as number, baslik: "İlk tespit — izlemeye alındı", tur: "tespit" });
  const render = a.render as { zaman?: number; cloaking?: boolean; finalUrl?: string } | undefined;
  if (render?.zaman) olaylar.push({ t: render.zaman, baslik: "Gerçek tarayıcıda açıldı (kontrol)", tur: "render", not: render.cloaking ? "cloaking: bota temiz, kurbana tuzak" : render.finalUrl ? `son adres: ${render.finalUrl}` : undefined });
  const adlar: Record<string, string> = { DOGRULANDI: "Tehdit doğrulandı", IZLEMEDE: "İzlemeye alındı", PASIF: "Pasifleşti — erişilemez", ELENDI: "Elendi — tehdit değil", ADAY: "Aday kaydı açıldı" };
  for (const g of ((a.yasamGecmisi as { durum?: string; t?: number; neden?: string }[]) || [])) {
    if (g.t && g.durum) olaylar.push({ t: g.t, baslik: adlar[g.durum] || g.durum, tur: "yasam", not: g.neden });
  }
  const bildirim = a.bildirim as { zaman?: number; kaynak?: string } | undefined;
  if (bildirim?.zaman) olaylar.push({ t: bildirim.zaman, baslik: "USOM'a bildirildi", tur: "bildirim", not: bildirim.kaynak });
  if (num(a.sonTarama)) olaylar.push({ t: a.sonTarama as number, baslik: "Son kontrol yapıldı", tur: "kontrol", not: `durum: ${(a.durum as string) || "—"}` });
  olaylar.sort((x, y) => y.t - x.t);

  // Güncel ekran görüntüsü — urlscan PASİF arama (hızlı; aktif tarama tetiklemez).
  let guncelEkran: string | null = null;
  try {
    const r = await fetch(`https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(domain)}&size=1`, {
      headers: process.env.URLSCAN_KEY ? { "API-Key": process.env.URLSCAN_KEY } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) { const j = (await r.json()) as { results?: { _id?: string }[] }; const id = j.results?.[0]?._id; if (id) guncelEkran = `https://urlscan.io/screenshots/${id}.png`; }
  } catch { /* urlscan erişilemedi → kare eklenmez */ }

  // Tarih-bazlı kare arşivi: güncel görüntü bir öncekinden FARKLIYSA ekle (birikir, son 30).
  let kareler: Kare[] = [];
  try {
    const gref = doc(db, "izleme_gecmisi", belgeId(domain));
    const gsnap = await getDoc(gref);
    kareler = gsnap.exists() ? (((gsnap.data() as { kareler?: Kare[] }).kareler) || []) : [];
    const sonEkran = kareler[kareler.length - 1]?.ekran;
    if (guncelEkran && guncelEkran !== sonEkran) {
      kareler = [...kareler, { t: Date.now(), ekran: guncelEkran, durum: (a.durum as string) || null, risk: (a.skor as number) ?? null }].slice(-30);
      await setDoc(gref, { domain, kareler, sonGuncelleme: Date.now() }, { merge: true });
    }
  } catch { /* kurallar yoksa geç */ }

  return NextResponse.json(
    { domain, guncel: { durum: (a.durum as string) || null, risk: (a.skor as number) ?? null, yasam: (a.yasamDurumu as string) || null }, guncelEkran, olaylar, kareler },
    { headers: CORS },
  );
}
