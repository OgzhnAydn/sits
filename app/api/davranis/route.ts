import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// DAVRANIŞ / SANDBOX ANALİZİ — urlscan.io'nun GERÇEK-TARAYICI sandbox sonucundan:
// ekran görüntüsü + yönlendirme + sayfanın çağırdığı HER kaynağın HTTP durum kodu +
// veri gönderdiği dış adresler. Müşteri diliyle sunmak üzere sadeleştirilmiş döner.
// GET ?domain=X → mevcut tarama varsa {durum:"hazir",...}; yoksa tarama tetikler {durum:"taraniyor",uuid}
// GET ?uuid=Y   → poll: {durum:"hazir",...} | {durum:"taraniyor"}

const UA = { "User-Agent": "Mozilla/5.0" };

type UrlscanResult = {
  task?: { screenshotURL?: string; url?: string };
  page?: { url?: string; domain?: string; status?: string | number; title?: string; redirected?: string };
  data?: { requests?: { request?: { request?: { url?: string } }; response?: { response?: { status?: number } } }[] };
  lists?: { domains?: string[]; ips?: string[] };
  verdicts?: { overall?: { malicious?: boolean; score?: number } };
};

function kodAciklama(kod: number): string {
  if (kod >= 200 && kod < 300) return "çalışıyor";
  if (kod === 301 || kod === 302 || kod === 307 || kod === 308) return "başka adrese yönlendiriyor";
  if (kod === 401) return "giriş/yetki istiyor";
  if (kod === 403) return "erişim reddedildi (engelli olabilir)";
  if (kod === 404) return "bulunamadı (o sayfa yok)";
  if (kod === 429) return "çok fazla istek (hız sınırı)";
  if (kod === 525 || kod === 526) return "sunucu SSL hatası (arka sunucu bozuk)";
  if (kod === 521 || kod === 522 || kod === 523) return "sunucu kapalı/erişilemez";
  if (kod >= 500) return "sunucu hatası";
  if (kod >= 400) return "istek hatası";
  return "bilinmiyor";
}

function analizEt(j: UrlscanResult, sorgulanan: string): Record<string, unknown> {
  const gorsel = j.task?.screenshotURL || (j.task?.url ? undefined : undefined);
  const sonAdres = j.page?.url || "";
  const sonHost = (j.page?.domain || "").toLowerCase();
  const yonlendirdi = !!sonHost && sonHost !== sorgulanan && !sonHost.endsWith("." + sorgulanan) && !sorgulanan.endsWith("." + sonHost);
  const anaDurum = Number(j.page?.status) || null;

  const reqs = j.data?.requests || [];
  let ok = 0, yon = 0, h4 = 0, h5 = 0;
  const dikkat: { yol: string; kod: number; aciklama: string }[] = [];
  const gorulen = new Set<string>();
  for (const r of reqs) {
    const kod = Number(r.response?.response?.status);
    if (!kod) continue;
    if (kod < 300) ok++;
    else if (kod < 400) yon++;
    else if (kod < 500) h4++;
    else h5++;
    // Dikkat çeken (2xx/3xx dışı) ilk birkaç kaynağı müşteriye göster.
    if (kod >= 400 && dikkat.length < 6) {
      let yol = "";
      try { const u = new URL(r.request?.request?.url || ""); yol = (u.pathname + u.search).slice(0, 60) || "/"; } catch { yol = "kaynak"; }
      const anahtar = yol + kod;
      if (!gorulen.has(anahtar)) { gorulen.add(anahtar); dikkat.push({ yol, kod, aciklama: kodAciklama(kod) }); }
    }
  }

  // Dış adresler = taranan domain dışındaki bağlanılan alanlar (3rd-party / olası veri hedefi).
  const disAdresler = (j.lists?.domains || [])
    .map((d) => String(d).toLowerCase())
    .filter((d) => d && d !== sorgulanan && !d.endsWith("." + sorgulanan) && !sorgulanan.endsWith("." + d))
    .filter((d, i, a) => a.indexOf(d) === i)
    .slice(0, 12);

  return {
    durum: "hazir",
    gorsel,
    sonAdres,
    yonlendirdi,
    yonlendirmeHedef: yonlendirdi ? sonAdres : null,
    anaDurum,
    anaDurumAciklama: anaDurum ? kodAciklama(anaDurum) : null,
    baslik: (j.page?.title || "").slice(0, 120),
    kaynaklar: { toplam: ok + yon + h4 + h5, calisan: ok, yonlendirme: yon, hata4xx: h4, hata5xx: h5 },
    dikkat,
    disAdresler,
    zararli: !!j.verdicts?.overall?.malicious,
    // Faz 2: TR çıkış noktası tanımlıysa "kullanıcı gibi TR'den görünüm" burada eklenecek.
    trGorunum: process.env.TR_PROXY ? "hazır (TR çıkışı tanımlı)" : null,
  };
}

async function sonucAl(uuid: string, key?: string): Promise<UrlscanResult | null> {
  try {
    const r = await fetch(`https://urlscan.io/api/v1/result/${uuid}/`, { headers: key ? { "API-Key": key } : UA, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return (await r.json()) as UrlscanResult;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const key = process.env.URLSCAN_KEY;
  const uuid = (u.searchParams.get("uuid") || "").replace(/[^a-f0-9-]/gi, "");
  const domain = (u.searchParams.get("domain") || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

  // Poll modu
  if (uuid) {
    const j = await sonucAl(uuid, key);
    if (j && j.page) return NextResponse.json(analizEt(j, domain || (j.page.domain || "").toLowerCase()));
    return NextResponse.json({ durum: "taraniyor", uuid });
  }

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return NextResponse.json({ durum: "yok" });

  // 1) Mevcut (pasif) tarama var mı? — anında sonuç.
  try {
    const s = await (await fetch(`https://urlscan.io/api/v1/search/?q=page.domain:%22${encodeURIComponent(domain)}%22&size=1`, { headers: key ? { "API-Key": key } : UA, signal: AbortSignal.timeout(9000) })).json() as { results?: { _id?: string }[] };
    const id = s.results?.[0]?._id;
    if (id) {
      const j = await sonucAl(id, key);
      if (j && j.page) return NextResponse.json(analizEt(j, domain));
    }
  } catch { /* aramada hata → tarama tetikle */ }

  // 2) Yoksa AKTİF tarama tetikle (anahtar gerekli) → uuid ile poll edilir.
  if (key) {
    try {
      const r = await fetch("https://urlscan.io/api/v1/scan/", {
        method: "POST",
        headers: { "API-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ url: `http://${domain}`, visibility: "unlisted" }),
        signal: AbortSignal.timeout(9000),
      });
      const j = (await r.json()) as { uuid?: string; message?: string };
      if (j.uuid) return NextResponse.json({ durum: "taraniyor", uuid: j.uuid });
      return NextResponse.json({ durum: "yok", not: j.message || "tarama başlatılamadı" });
    } catch { return NextResponse.json({ durum: "yok" }); }
  }
  return NextResponse.json({ durum: "yok" });
}
