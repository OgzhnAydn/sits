import { NextRequest, NextResponse } from "next/server";
import { permutasyonlar } from "@/lib/permutasyon";
import { domainOsint, pref22, typosquatDurustlukCap, domainDurumu, type DomainDurum } from "@/lib/osint";
import { alanBul } from "@/lib/graf";
import { limitAsildi } from "@/lib/rateLimit";
import { analizKaydet, markaAdayKaydet, markaGunlukArtir } from "@/lib/store";
import { KORUNAN_MARKALAR, anahtarKok } from "@/lib/korunanMarkalar";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Bu markanın ŞU AN var olan sahtelerini bul" — retrospektif tarama.
// 1) domainden varyasyon üret  2) hangileri CANLI (DNS)  3) canlıları analiz et.
function seviye(s: number) {
  return s >= 60 ? "Yüksek" : s >= 30 ? "Orta" : "Düşük";
}

// TAKLİT ÖNCELİĞİ — hangi canlı varyasyonu ÖNCE analiz edelim? Marka adını AYNEN
// taşıyanlar (tusas.xyz / tusas.co / tusas-giris.com) en tehlikelisidir; harf düşmüş
// ve markayı taşımayanlar (usas / tsas) düşük öncelik. Analiz kotasını buna göre harca.
const ONCELIK_RISKLI_TLD = ["xyz", "top", "tk", "buzz", "icu", "cyou", "online", "site", "live", "click", "shop", "vip", "monster", "rest", "fun", "space", "website", "info", "biz", "club", "co", "com.tr", "tr", "net", "org"];
function taklitOnceligi(aday: string, kokLabel: string): number {
  const parcalar = aday.split(".");
  const label = parcalar[0];
  const tld = parcalar.slice(1).join(".");
  let s = 0;
  if (label === kokLabel) s += 100;          // yalnız uzantı farklı — birebir marka adı, en tehlikeli
  else if (label.includes(kokLabel)) s += 70; // combosquat (tusas-giris) — marka adı tam içinde
  else if (kokLabel.includes(label)) s += 18; // harf düşmüş ama hâlâ markanın parçası
  if (ONCELIK_RISKLI_TLD.includes(tld)) s += 12;
  if (/-(giris|guvenlik|destek|login|hesap|mobil|guvenli|resmi|app|online|tr)/.test(label)) s += 15;
  return s;
}

// Bir domainin TÜM A kayıtlarını (IP) döndür.
async function ipCoz(domain: string): Promise<string[]> {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, {
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    return Array.isArray(j?.Answer)
      ? j.Answer.filter((a: { type: number; data?: string }) => a.type === 1 && a.data).map((a: { data: string }) => a.data)
      : [];
  } catch {
    return [];
  }
}

async function cozuluyorMu(domain: string): Promise<boolean> {
  return (await ipCoz(domain)).length > 0;
}

// Diziyi eşzamanlılık sınırıyla işле (DNS'i boğmamak için).
async function parcali<T, R>(liste: T[], boyut: number, isle: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < liste.length; i += boyut) {
    out.push(...(await Promise.all(liste.slice(i, i + boyut).map(isle))));
  }
  return out;
}

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "sahtebul", 8);
  if (limit) return limit;

  let body: { domain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }
  const domain = String(body.domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ hata: "Geçerli bir domain gir (ör. garanti.com.tr)." }, { status: 400 });
  }

  const adaylar = permutasyonlar(domain);
  if (!adaylar.length) return NextResponse.json({ taranan: 0, canli: 0, sonuclar: [] });

  // RESMÎ marka IP bloğu: markanın kendi domaininin /24'ünde çözülen adaylar,
  // markanın KENDİ savunma domaini'dir (ör. vakifbank.tr, bankanın IP'sinde) →
  // "sahte" DEĞİL. Yanlış-pozitifin (vakifbank.tr %100) kökü buydu.
  const resmiIpler = await ipCoz(domain);
  const resmiBloklar = new Set(resmiIpler.map(pref22).filter(Boolean) as string[]);

  // 1) Hangi varyasyonlar CANLI (DNS'te çözülüyor) → asıl tehlike bunlar.
  const canliBayrak = await parcali(adaylar, 25, cozuluyorMu);
  const canliHam = adaylar.filter((_, i) => canliBayrak[i]);

  // Analiz kotasını EN TEHLİKELİYE harca: marka adını aynen taşıyanlar önce
  // (tusas.xyz/.co/.com.tr), harf düşmüş alakasızlar (usas/tsas) sona.
  const kokLabel = domain.split(".")[0];
  const canli = [...canliHam].sort((a, b) => taklitOnceligi(b, kokLabel) - taklitOnceligi(a, kokLabel));

  // 2) Canlı olanları analiz et (motor + favicon karşılaştırması). Paralel → ilk 10.
  const analizEdilecek = canli.slice(0, 10);
  const raporlar = await Promise.all(
    analizEdilecek.map(async (d) => {
      try {
        const r = await domainOsint(d);
        // Kontrol et ile AYNI dürüstlük geçidi → aynı domain her yerde aynı skor
        // (turkcell.online: kontrol'de 55, marka-taramada da 55 — 100 değil).
        typosquatDurustlukCap(r);
        const dIp = alanBul(r.alanlar, "ip adresi");
        const dBlok = dIp ? pref22(dIp) : null;
        // TEYİTLİ-KÖTÜ sinyali (USOM/kara liste/urlscan-zararlı/VT çoklu) var mı?
        // Varsa "markanın kendi IP'si" olsa BİLE override etme — resmi otoriteyi gizleme
        // (ör. vakifbank.tr bankanın ASN'inde AMA USOM listesinde → 0 gösterme!).
        const vtDeger = r.alanlar.find((a) => a.ad === "VirusTotal")?.deger || "";
        const teyitliKotu =
          r.bulgular.some((b) => /usom|zararlı liste|tehdit liste|oltalama|kara liste/i.test(b)) ||
          r.alanlar.some((a) => a.ad === "Kara liste") ||
          /([3-9]|\d\d)\s*\/\s*\d+\s*firma/.test(vtDeger);
        // Markanın KENDİ IP bloğunda + teyitli-kötü DEĞİL → savunma domaini, sahte değil.
        if (dBlok && resmiBloklar.has(dBlok) && !teyitliKotu) {
          return {
            domain: d,
            skor: 0,
            seviye: "Düşük",
            markaninKendi: true,
            sinyaller: ["Markanın kendi IP bloğunda (resmi altyapı) — savunma domaini, sahte değil."],
            durum: "canli" as DomainDurum,
          };
        }
        return { domain: d, skor: Math.min(100, r.risk), seviye: seviye(r.risk), markaninKendi: false, sinyaller: r.bulgular.slice(0, 4), durum: domainDurumu(r).durum };
      } catch {
        return { domain: d, skor: 0, seviye: "Düşük", markaninKendi: false, sinyaller: [] as string[], durum: "canli" as DomainDurum };
      }
    })
  );
  raporlar.sort((a, b) => b.skor - a.skor);

  // Taranan markayı çöz (resmî domainden) — kuyruğa/sayaca yazmak için.
  const markaObj = KORUNAN_MARKALAR.find((m) => m.resmi.some((rr) => domain === rr || domain.endsWith("." + rr)));
  const markaAnahtar = markaObj?.anahtar || anahtarKok(domain);
  const markaAdi = markaObj?.ad || markaAnahtar;
  const tarih = new Date().toISOString().slice(0, 10);
  let kaydedilen = 0;

  for (const r of raporlar) {
    if (r.markaninKendi) continue;
    // KANIT DEPOSU: her analizi kalıcı sakla.
    analizKaydet({ domain: r.domain, risk: r.skor, seviye: r.seviye, bulgular: r.sinyaller, kaynak: "sahte-bul", zaman: Date.now() }).catch(() => {});
    // GERÇEK sahte (skor ≥30) → İNCELEME KUYRUĞUNA yaz + TESPİT SAYACINA ekle.
    // Böylece on-demand tarama da canlı worker gibi kalıcı kaydedilir ve sayılır.
    if (r.skor >= 30) {
      kaydedilen++;
      markaGunlukArtir(markaAnahtar, tarih, true).catch(() => {});
      markaAdayKaydet({
        domain: r.domain,
        marka: markaAnahtar,
        markaAdi,
        skor: r.skor,
        seviye: r.seviye,
        sinyaller: r.sinyaller.length ? r.sinyaller : ["Marka domaininden türetilen, canlı taklit varyasyonu."],
        kaynak: "sahte-bul",
        durum: r.durum,
        zaman: Date.now(),
      }).catch(() => {});
    }
  }

  // Analiz edilmeyen canlıları da "canlı ama incelenmedi" olarak bildir (düşük öncelikliler).
  const digerCanli = canli.slice(10);

  return NextResponse.json({
    domain,
    taranan: adaylar.length,
    canli: canli.length,
    kaydedilen, // kuyruğa + sayaca yazılan gerçek sahte sayısı
    sonuclar: raporlar,
    digerCanli,
  });
}
