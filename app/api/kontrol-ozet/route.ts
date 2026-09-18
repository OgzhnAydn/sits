import { NextResponse } from "next/server";
import { markaAdaylariGetir, kullaniciMarkalariGetir, type MarkaAday } from "@/lib/store";
import { gercekTaklit, KORUNAN_MARKALAR, domainSade, tescilliBilgi } from "@/lib/korunanMarkalar";

export const runtime = "nodejs";

// Bir domainin TESCİLLİ kök adı (subdomain'siz): "bitbucket.brainchild.com.ph" → "brainchild.com.ph".
const tescilliKok = (dom: string): string => {
  try { const t = tescilliBilgi(domainSade(dom)); return t.label ? `${t.label}.${t.tld}` : dom; } catch { return dom; }
};

// KONTROL ODASI özeti — sistem-geneli operatör görünümü: tüm markalar, sistem
// sağlığı, kanal durumu. (Son 400 tespit üzerinden anlık tablo.)
export async function GET() {
  const ham = await markaAdaylariGetir(400);
  const gecerliHam = ham.filter((a) => gercekTaklit(a.domain, a.marka));
  // SUBDOMAIN ŞİŞMESİNİ ÖNLE: tek meşru/sahte domainin onlarca subdomaini (mail/imap/proxy/bitbucket…)
  // ayrı "tespit" olarak sayılıp sayıyı şişiriyordu. Aynı marka+tescilli-kök TEK tespit — temsili olarak
  // en yüksek skorlu/en yeni kayıt tutulur. Bir domain = bir tehdit.
  const tekMap = new Map<string, MarkaAday>();
  for (const a of gecerliHam) {
    const k = `${a.marka}|${tescilliKok(a.domain)}`;
    const v = tekMap.get(k);
    if (!v || (a.skor || 0) > (v.skor || 0) || (a.zaman || 0) > (v.zaman || 0)) tekMap.set(k, a);
  }
  const gecerli = [...tekMap.values()];

  const perMarka: Record<string, { marka: string; markaAdi: string; toplam: number; aktif: number; canli: number; sonZaman: number }> = {};
  for (const a of gecerli) {
    const m = (perMarka[a.marka] ||= { marka: a.marka, markaAdi: a.markaAdi || a.marka, toplam: 0, aktif: 0, canli: 0, sonZaman: 0 });
    m.toplam++;
    if (a.durum === "aktif-tuzak") m.aktif++;
    if (a.durum === "canli" || a.durum === "aktif-tuzak") m.canli++;
    if ((a.zaman || 0) > m.sonZaman) m.sonZaman = a.zaman || 0;
  }
  // KAYITLI TÜM MARKALAR görünsün — tespiti olmayan da 0 ile listede yer alsın (izleme kapsamı).
  // Hem hardcoded KORUNAN_MARKALAR hem KULLANICI'nın eklediği markalar (marka koruma dropdown'ı ile
  // AYNI evren) → operatör bir marka eklediğinde kontrol odasında da anında görünür (çift yönlü senkron).
  for (const m of KORUNAN_MARKALAR) {
    if (!perMarka[m.anahtar]) perMarka[m.anahtar] = { marka: m.anahtar, markaAdi: m.ad, toplam: 0, aktif: 0, canli: 0, sonZaman: 0 };
  }
  const ozelMarkalar = await kullaniciMarkalariGetir().catch(() => []);
  for (const m of ozelMarkalar) {
    if (!perMarka[m.anahtar]) perMarka[m.anahtar] = { marka: m.anahtar, markaAdi: m.ad, toplam: 0, aktif: 0, canli: 0, sonZaman: 0 };
  }
  const markalar = Object.values(perMarka).sort((x, y) => y.toplam - x.toplam || x.markaAdi.localeCompare(y.markaAdi, "tr"));
  const sonTespit = gecerli.length ? Math.max(...gecerli.map((a) => a.zaman || 0)) : 0;
  const now = Date.now();
  const buGun = gecerli.filter((a) => a.zaman && now - a.zaman < 86400000).length;
  const sonlar = [...gecerli].sort((a, b) => (b.zaman || 0) - (a.zaman || 0)).slice(0, 25)
    .map((a) => ({ domain: a.domain, marka: a.markaAdi || a.marka, skor: a.skor, durum: a.durum || "", zaman: a.zaman || 0 }));

  const kanallar = {
    ios: true,
    android: true,
    google: Boolean(process.env.GCP_SA_KEY),
    meta: Boolean(process.env.META_AD_TOKEN),
  };

  // ── ANALİZ DAĞILIMLARI (grafikler için) — hepsi gerçek `gecerli` veriden ──
  // 1) Durum dağılımı (donut).
  const durumDagilim = {
    aktifTuzak: gecerli.filter((a) => a.durum === "aktif-tuzak").length,
    canli: gecerli.filter((a) => a.durum === "canli").length,
    park: gecerli.filter((a) => a.durum === "park").length,
    pasif: gecerli.filter((a) => a.durum === "yayinda-degil").length,
  };
  // 2) En çok kötüye kullanılan uzantılar (TLD bar) — tescilli TLD bazında.
  const tldSay: Record<string, number> = {};
  for (const a of gecerli) {
    let tld = "";
    try { tld = tescilliBilgi(domainSade(a.domain)).tld || ""; } catch { /* */ }
    if (!tld) tld = a.domain.split(".").pop() || "?";
    tldSay[tld] = (tldSay[tld] || 0) + 1;
  }
  const tldDagilim = Object.entries(tldSay).map(([tld, adet]) => ({ tld, adet })).sort((x, y) => y.adet - x.adet).slice(0, 8);
  // 3) Günlük tespit trendi — son 14 gün (son tespitlerin günlük dağılımı, 0-dolgulu).
  const gunAnahtar = (t: number) => new Date(t).toISOString().slice(0, 10);
  const gunSay: Record<string, number> = {};
  for (const a of gecerli) { if (a.zaman) gunSay[gunAnahtar(a.zaman)] = (gunSay[gunAnahtar(a.zaman)] || 0) + 1; }
  const gunlukTrend: { gun: string; adet: number }[] = [];
  for (let i = 13; i >= 0; i--) { const g = gunAnahtar(now - i * 86400000); gunlukTrend.push({ gun: g, adet: gunSay[g] || 0 }); }
  // 4) Kaynak dağılımı — CT gerçek-zamanlı vs geçmişe dönük (biz-önce kapsamı).
  const kaynakDagilim = {
    ct: gecerli.filter((a) => a.kaynak === "certstream").length,
    diger: gecerli.filter((a) => a.kaynak && a.kaynak !== "certstream").length,
  };

  return NextResponse.json({
    ozet: { toplam: gecerli.length, marka: markalar.length, buGun, sonTespit, aktif: gecerli.filter((a) => a.durum === "aktif-tuzak").length },
    markalar, sonlar, kanallar, durumDagilim, tldDagilim, gunlukTrend, kaynakDagilim,
  });
}
