import { NextRequest, NextResponse } from "next/server";
import { bahisAdaylariGetir, bahisAdayKaydet } from "@/lib/store";
import { usomBiliniyor } from "@/lib/usom";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// USOM'UN KAPATMADIĞI, HÂLÂ AÇIK yasa dışı bahis siteleri — asıl değerli/aksiyon listesi.
// YÖNTEM (kullanıcı notu): USOM API'sine "kapandı mı" diye SORMAYIZ (bayat/güvenilmez olabilir).
// Siteyi GERÇEKTEN AÇAR, HTTP RESPONSE'una bakarız: bahis içeriği mi geliyor (AÇIK), yoksa
// erişim-engeli / park / ölü mü (KAPALI). USOM durumu yalnız EK bilgi olarak gösterilir.
const UA = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

const RE_ENGEL = /erişime? engellenmi|5651 say[ıi]l[ıi]|bilgi teknolojileri ve ileti[şs]im kurumu|telekom[üu]nikasyon ileti[şs]im ba[şs]kanl|bu (web )?site.{0,30}engel|court order|domain.{0,20}seized|el konulmu[şs]tur|yasal olarak engel/i;
const RE_PARK = /sat[ıi]l[ıi]k|domain for sale|buy this domain|parkingcrew|sedoparking|above\.com|account suspended|default web page|welcome to nginx|it works!|coming soon|hemen al|this domain is parked/i;
const RE_BAHIS = /bahis|casino|iddaa|rulet|\bslot|bonus|canl[ıi] bahis|deneme bonus|freespin|para yat[ıi]r|[çc]ekim|giri[şs] yap|sportsbook|jackpot|betting|mostbet|1xbet|melbet|slot oyna/i;
const RE_CFWALL = /just a moment|checking your browser|attention required|cloudflare|bir dakika|ddos.?guard|verifying you are human/i;

type SiteDurum = { durum: "acik" | "acik-botduvar" | "kapali-engelli" | "park" | "kapali-dead" | "belirsiz"; httpKod?: number; ipucu?: string };
async function siteDurumu(domain: string): Promise<SiteDurum> {
  for (const scheme of ["https", "http"]) {
    try {
      const r = await fetch(`${scheme}://${domain}/`, { headers: { "User-Agent": UA, accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
      const kod = r.status;
      const govde = (await r.text().catch(() => "")).slice(0, 25000);
      // Cloudflare ORIGIN hataları (521-524): CF origin'e ulaşamıyor → site fiilen KAPALI/down.
      if ([521, 522, 523, 524].includes(kod)) return { durum: "kapali-dead", httpKod: kod, ipucu: "Cloudflare origin ulaşılamıyor (origin down)" };
      if ([520, 525, 526].includes(kod)) return { durum: "belirsiz", httpKod: kod, ipucu: "Cloudflare origin hatası (durum belirsiz)" };
      if (RE_ENGEL.test(govde)) return { durum: "kapali-engelli", httpKod: kod, ipucu: "erişim engeli / BTK notice sayfası" };
      if (RE_BAHIS.test(govde)) return { durum: "acik", httpKod: kod, ipucu: "bahis içeriği yayında" };           // gerçek içerik ÖNCE
      if (RE_CFWALL.test(govde)) return { durum: "acik-botduvar", httpKod: kod, ipucu: "bot-duvarı arkasında CANLI (challenge)" };
      if (RE_PARK.test(govde)) return { durum: "park", httpKod: kod, ipucu: "park / satılık / boş şablon" };
      if (kod >= 200 && kod < 400 && govde.replace(/\s/g, "").length > 300) return { durum: "belirsiz", httpKod: kod, ipucu: "yanıt var ama içerik belirsiz" };
      return { durum: "belirsiz", httpKod: kod };
    } catch { /* diğer şemayı dene */ }
  }
  return { durum: "kapali-dead", ipucu: "bağlantı yok (kaldırılmış/erişilemez)" };
}

async function parcali<T, R>(l: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const o: R[] = [];
  for (let i = 0; i < l.length; i += n) o.push(...(await Promise.all(l.slice(i, i + n).map(f))));
  return o;
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const n = Math.min(50, Math.max(1, Number(u.searchParams.get("n")) || 24));
  const trOnly = u.searchParams.get("tr") !== "0"; // varsayılan: yalnız TR-hedefli

  const ham = await bahisAdaylariGetir(300).catch(() => []);
  const aday = ham
    .filter((b) => (!trOnly || b.trHedefli))
    .sort((a, b) => (b.guven || 0) - (a.guven || 0) || (b.zaman || 0) - (a.zaman || 0))
    .slice(0, n);

  const kontrol = await parcali(aday, 5, async (b) => {
    const [durum, usomda] = await Promise.all([
      siteDurumu(b.domain),
      usomBiliniyor(b.domain).catch(() => null), // yalnız EK bilgi
    ]);
    await bahisAdayKaydet({ ...b, usomda }).catch(() => {}); // taze usom bilgisini sakla
    return { domain: b.domain, guven: b.guven, marka: b.marka, trHedefli: b.trHedefli, zaman: b.zaman, usomda, ...durum };
  });

  // AÇIK = siteyi açtığımızda bahis içeriği geliyor (ya da bot-duvarı arkasında canlı).
  const acikDurum = new Set(["acik", "acik-botduvar"]);
  const acik = kontrol.filter((s) => acikDurum.has(s.durum)).sort((a, b) => (b.guven || 0) - (a.guven || 0));
  // USOM'un kapatmadığı AÇIKLAR (hem yayında hem USOM'da kayıtlı değil) — en değerli alt küme.
  const acikUsomdaYok = acik.filter((s) => s.usomda === false);

  return NextResponse.json(
    {
      ok: true,
      kontrolEdilen: kontrol.length,
      acik: acik.length,
      acikUsomdaYok: acikUsomdaYok.length,
      liste: acik,              // response'tan doğrulanmış AÇIK siteler (en değerlisi üstte)
      sadeceUsomdaYok: acikUsomdaYok.map((s) => s.domain),
      not: "Her site GERÇEKTEN açılıp HTTP response'una bakılarak sınıflandırıldı (USOM API'sine güvenilmedi). 'acik' = bahis içeriği yayında; 'acik-botduvar' = Cloudflare/DDoS-Guard arkasında canlı. DÜRÜST SINIR: görünüm bizim (TR-dışı) sunucumuzdan; BTK'nın TR-içi erişim engeli buradan görünmeyebilir.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
