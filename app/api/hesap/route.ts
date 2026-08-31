import { NextRequest, NextResponse } from "next/server";
import { gostergeSorgula, baglantilariGetir } from "@/lib/store";
import { seedKontrol } from "@/lib/seed";
import { ESIK, GOSTER_ESIK } from "@/lib/esik";
import { geminiVarMi, geminiJson } from "@/lib/gemini";
import { normalize } from "@/lib/demoVeri";
import { domainOsint, type Alan, type OsintRapor } from "@/lib/osint";
import { cacheOku, cacheYaz } from "@/lib/osintCache";
import { itibarliMi } from "@/lib/itibarli";
import { limitAsildi } from "@/lib/rateLimit";
import { GrafKurucu, alanBul } from "@/lib/graf";
import { sosyalBaglar } from "@/lib/sosyalProvider";
import { profilZengin } from "@/lib/profilZengin";

export const runtime = "nodejs";

// ── Bu uç, "sahte hesap analizi" boru hattıdır (identity-graph diyagramının
// SAVUNULABİLİR biçimi): halka açık uygulamada KİŞİYİ gerçek kimliğine bağlamayız
// (isim/telefon/e-posta deşifresi YOK). İki gerçek sinyale bakarız:
//   1) ACCOUNT — handle marka taklidi ediyor mu, bot/sahte deseni var mı, bildirilmiş mi
//   2) INFRA   — hesabın İTTİĞİ link (bio/yönlendirme) hangi altyapıda; onu OSINT
//                motoruna sokarız (domain/IP/ASN/tehdit listeleri). Para orada toplanır.
// Platform içi veri (takipçi, hesap yaşı, DM) login ister; sunucudan erişemeyiz.

const PLATFORM: Record<string, string> = {
  instagram: "Instagram", twitter: "X (Twitter)", x: "X (Twitter)", facebook: "Facebook",
  fb: "Facebook", tiktok: "TikTok", "t.me": "Telegram", telegram: "Telegram",
  youtube: "YouTube", "youtu.be": "YouTube", linkedin: "LinkedIn", whatsapp: "WhatsApp", "wa.me": "WhatsApp",
};

// Platform host'ları — INFRA kolunda "ittiği link" ararken bunları hariç tut.
const PLATFORM_HOST = new Set([
  "instagram.com", "twitter.com", "x.com", "facebook.com", "fb.com", "fb.me",
  "tiktok.com", "t.me", "telegram.org", "telegram.me", "youtube.com", "youtu.be",
  "linkedin.com", "wa.me", "whatsapp.com", "threads.net",
]);

// Sık taklit edilen Türk marka/kurumları
const MARKA = ["garanti", "akbank", "ziraat", "isbank", "yapikredi", "vakif", "halkbank", "denizbank",
  "papara", "trendyol", "hepsiburada", "sahibinden", "turkcell", "vodafone", "turktelekom",
  "edevlet", "ptt", "aras", "yurtici", "migros", "getir", "enpara", "btk", "turkiye", "gov"];
// Sahte "resmi hesap" eklerine sık rastlanan kelimeler
const SUPHE_EK = ["destek", "cekilis", "hediye", "kampanya", "resmi", "official", "yardim", "musteri",
  "iletisim", "kazan", "bonus", "promosyon", "cekilisi", "hediyeler", "canli", "2024", "2025", "2026"];

function hostAyikla(u: string): string | null {
  const m = u.trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "")
    .split(/[/\s?#]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(m) ? m : null;
}

// Kullanıcı adı DEĞİL, platformun genel yol segmentleri (profil değil).
const JENERIK = new Set([
  "feed", "home", "mynetwork", "jobs", "messaging", "notifications", "login", "signup",
  "about", "help", "explore", "search", "settings", "profile", "user", "account", "admin",
  "index", "main", "p", "reel", "reels", "watch", "story", "stories", "share", "hashtag",
  "dir", "pub", "posts", "activity", "in", "company", "school", "groups", "events",
  "learning", "tv", "channel", "c", "status", "i", "intent", "share-offsite", "shareArticle",
]);

function parseHesap(giris: string): { platform: string | null; kullanici: string; url: string | null } {
  const s = giris.trim();
  const low = s.toLowerCase();
  const url = /^https?:\/\//i.test(s) ? s : /[a-z0-9-]+\.[a-z]{2,}/i.test(s) ? `https://${s}` : null;

  // LinkedIn: profil /in/ , /company/ , /school/ altındadır. /feed gibi yollar PROFİL DEĞİL.
  if (/linkedin\.com/i.test(low)) {
    const m = low.match(/linkedin\.com\/(?:in|company|school|pub)\/([a-z0-9._-]+)/);
    return { platform: "LinkedIn", kullanici: m ? m[1] : "", url };
  }

  const m = s.match(/(instagram|twitter|x|facebook|fb|tiktok|t\.me|telegram|youtube|youtu\.be|whatsapp)\.(?:com|me|be|org|net)?\/?(@?[A-Za-z0-9._-]+)?/i);
  if (m && m[2]) {
    const kul = m[2].replace(/^@/, "");
    return { platform: PLATFORM[m[1].toLowerCase()] || m[1], kullanici: JENERIK.has(kul.toLowerCase()) ? "" : kul, url };
  }
  const bare = s.replace(/^@/, "").split(/[/\s?]/)[0];
  return { platform: null, kullanici: JENERIK.has(bare.toLowerCase()) ? "" : bare, url: null };
}

// Girişte VEYA ayrı alanda geçen "ittiği link"i bul: profil host'u ve platform
// host'ları HARİÇ, ilk gerçek dış bağlantı. INFRA kolunun girdisi budur.
function ittigiLinkBul(metin: string, profilHost: string | null): string | null {
  const re = /(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/[^\s]*)?/gi;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(metin)) !== null) {
    const host = mm[1].toLowerCase();
    if (PLATFORM_HOST.has(host)) continue;
    if (profilHost && host === profilHost) continue;
    if (!/\.[a-z]{2,}$/.test(host)) continue;
    return mm[0].startsWith("http") ? mm[0] : `https://${mm[0]}`;
  }
  return null;
}

function seviye(risk: number) {
  return risk >= 60 ? "Yüksek" : risk >= 30 ? "Orta" : "Düşük";
}

// INFRA raporunu (domainOsint) önbellekli getir — /api/osint ile aynı kota koruması.
async function infraRapor(domain: string, tamUrl: string): Promise<OsintRapor> {
  let r = (await cacheOku("url", domain)) as OsintRapor | null;
  if (!r) {
    r = await domainOsint(domain, tamUrl);
    await cacheYaz("url", domain, r);
  }
  return r;
}

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "hesap", 20);
  if (limit) return limit;

  let giris = "";
  let link = "";
  try {
    const b = await req.json();
    giris = typeof b?.giris === "string" ? b.giris : "";
    link = typeof b?.link === "string" ? b.link : ""; // opsiyonel: hesabın bio/yönlendirme linki
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }
  if (!giris || giris.trim().length < 2) {
    return NextResponse.json({ hata: "Profil linki veya kullanıcı adı gir." }, { status: 400 });
  }

  const { platform, kullanici, url } = parseHesap(giris);

  // Girilen adres bir PROFİL değil (ör. linkedin.com/feed, instagram.com/explore) →
  // kullanıcı adı çıkmadı. Gürültülü "aynı ad" listesi üretmek yerine net yönlendir.
  if (!kullanici || kullanici.length < 2) {
    const ornek = platform === "LinkedIn" ? "linkedin.com/in/kullaniciadi" : "instagram.com/kullaniciadi ya da @kullaniciadi";
    return NextResponse.json({
      platform,
      kullanici: "",
      profilUrl: url,
      risk: 0,
      seviye: "Düşük",
      ozet: platform
        ? `Bu ${platform} adresi bir kullanıcı profili değil (ana sayfa / feed gibi genel bir sayfa). Kişinin profil adresini gir.`
        : "Geçerli bir kullanıcı adı ya da profil linki gir.",
      neden: [`Girilen adreste bir kullanıcı adı bulunmuyor — örnek: ${ornek}`],
      adimlar: [`Kontrol etmek istediğin kişinin profilini gir (ör. ${ornek}).`],
      infra: null,
      baglantilar: [],
      graf: null,
      yetersiz: false,
      ai: false,
    });
  }
  const uad = kullanici.toLowerCase();
  const profilHost = url ? hostAyikla(url) : null;
  let risk = 0;
  const bulgular: string[] = [];

  // ── ACCOUNT kolu ────────────────────────────────────────────────
  // Marka taklidi
  const marka = MARKA.find((m) => uad.includes(m));
  const supheEk = SUPHE_EK.find((e) => uad.includes(e));
  if (marka && supheEk) {
    risk += 55;
    bulgular.push(`Kullanıcı adı bir markayı ("${marka}") "${supheEk}" gibi bir ekle taklit ediyor — sahte "resmi hesap" işareti.`);
  } else if (marka) {
    risk += 25;
    bulgular.push(`Kullanıcı adında tanınmış bir marka adı ("${marka}") geçiyor — gerçek resmi hesap olduğundan emin ol (mavi tik, takipçi sayısı).`);
  }
  // Handle deseni (bot/sahte)
  const rakam = (uad.match(/\d/g) || []).length;
  if (rakam >= 4) { risk += 15; bulgular.push("Kullanıcı adında çok sayıda rakam var — otomatik/sahte hesaplarda sık görülür."); }
  if ((uad.match(/[._]/g) || []).length >= 3) { risk += 8; bulgular.push("Kullanıcı adında çok sayıda nokta/alt tire var."); }

  // Topluluk + tehdit listesi (profil linki verildiyse)
  let bildirimVar = false;
  if (url) {
    const crowd = await gostergeSorgula(url, "url");
    if (crowd?.bulundu) {
      if (crowd.benzersiz >= ESIK) { risk += 45; bildirimVar = true; bulgular.push(`${crowd.benzersiz} farklı kişi bu hesabı dolandırıcı olarak bildirmiş (doğrulandı).`); }
      else if (crowd.benzersiz >= GOSTER_ESIK) { risk += 6; bildirimVar = true; bulgular.push(`${crowd.benzersiz} kişi bu hesabı bildirmiş (henüz doğrulanmadı).`); }
    }
    if (seedKontrol(url, "url")) { risk += 40; bildirimVar = true; bulgular.push("Profil bağlantısı açık tehdit listesinde kayıtlı."); }
  }

  // ── INFRA kolu ──────────────────────────────────────────────────
  // Hesabın İTTİĞİ link (bio/yönlendirme). Para orada toplanır → gerçek tehlike.
  const ham = `${giris} ${link}`.trim();
  const ittigi = link.trim() ? (link.trim().startsWith("http") ? link.trim() : `https://${link.trim()}`) : ittigiLinkBul(ham, profilHost);
  let infraAlanlar: Alan[] = [];
  let infraDomain: string | null = null;
  let infraRisk = 0;
  let infraSeviye: string | null = null;
  let infraEkran: string | undefined;
  let infraSayfa: OsintRapor["sayfa"];

  if (ittigi) {
    const { deger: dom } = normalize(ittigi);
    infraDomain = dom;
    const ir = await infraRapor(dom, ittigi);
    infraEkran = ir.ekranGoruntusu;
    infraSayfa = ir.sayfa;

    // Altyapının kendi topluluk/tehdit sinyalleri
    let infraCrowd = 0;
    if (!itibarliMi(dom)) {
      const c = await gostergeSorgula(dom, "url");
      if (c?.bulundu && c.benzersiz >= ESIK) { infraCrowd += 45; ir.bulgular.push(`${c.benzersiz} kişi bu linki dolandırıcı olarak bildirmiş.`); }
      else if (c?.bulundu && c.benzersiz >= GOSTER_ESIK) { infraCrowd += 6; }
      if (seedKontrol(dom, "url")) { infraCrowd += 40; ir.bulgular.push("Bu link açık tehdit listesinde kayıtlı."); }
    }
    infraRisk = Math.min(100, ir.risk + infraCrowd);
    infraSeviye = seviye(infraRisk);
    infraAlanlar = ir.alanlar;

    // Hesabın ittiği altyapı tehlikeliyse, hesabın kendisi tehlikelidir → tam ağırlık.
    risk += Math.round(infraRisk * 0.9);
    if (infraRisk >= 30) {
      bulgular.push(`Hesabın yönlendirdiği link (${dom}) OSINT taramasında ${infraSeviye!.toLowerCase()} riskli — asıl tehlike burada.`);
    }
    for (const b of ir.bulgular) if (!bulgular.includes(b)) bulgular.push(b);
  }

  // ── CORRELATION (yalnız ACCOUNT + INFRA; PERSON YOK) ────────────
  const korelHedef = infraDomain || url;
  let baglantilar: { deger: string; tip: string; sayi: number }[] = [];
  if (korelHedef) {
    baglantilar = await baglantilariGetir(infraDomain || url!, "url");
    if (baglantilar.length) {
      risk += 10;
      bulgular.push(`Bu hesap/link, ${baglantilar.length} başka göstergeyle (telefon/IBAN/site) birlikte bildirildi — organize bir dolandırıcılık ağı işareti olabilir.`);
    }
  }

  // ── IDENTITY GRAPH (entite/altyapı; PERSON kolu YOK) ────────────
  // Sosyal bağ sağlayıcıları + ücretsiz profil zenginleştirme (paralel).
  const [saglayici, zengin] = await Promise.all([
    sosyalBaglar(kullanici, platform),
    profilZengin(kullanici),
  ]);

  const G = new GrafKurucu();
  const kokId = G.dugum({
    id: `acc:${(platform || "?")}:${uad}`,
    tur: "account",
    etiket: `@${kullanici}`,
    alt: platform || "Sosyal hesap",
    url: url || undefined,
    risk,
    kok: true,
  });

  // account → website → domain → {ip, asn, cert}
  if (infraDomain) {
    const dId = G.dugum({ id: `dom:${infraDomain}`, tur: "domain", etiket: infraDomain, risk: infraRisk, url: `https://${infraDomain}` });
    G.kenar(kokId, dId, "website");
    const ip = alanBul(infraAlanlar, "ip adresi", "ip adres");
    if (ip) { const i = G.dugum({ id: `ip:${ip}`, tur: "ip", etiket: ip, alt: alanBul(infraAlanlar, "sunucu ülkesi", "ülke") || undefined }); G.kenar(dId, i, "resolves"); }
    const asn = alanBul(infraAlanlar, "ağ (asn)", "asn");
    if (asn) { const a = G.dugum({ id: `asn:${asn}`, tur: "asn", etiket: asn, alt: alanBul(infraAlanlar, "barındırma") || undefined }); G.kenar(dId, a, "asn"); }
    const cert = alanBul(infraAlanlar, "ssl veren", "sertifika");
    if (cert) { const c = G.dugum({ id: `cert:${infraDomain}`, tur: "cert", etiket: cert, alt: "SSL sertifikası" }); G.kenar(dId, c, "cert"); }
  }

  // Ücretsiz profil zenginleştirme (GitHub/Reddit): hesap yaşı + beyan edilen site.
  // Önce çalışır ki WhatsMyName dedup'ında zengin alt/website korunsun.
  for (const z of zengin) {
    const accId = G.dugum({
      id: `acc:${z.platform}:${uad}`,
      tur: "account",
      etiket: `@${kullanici}`,
      alt: z.olusturma ? `${z.platform} · ${z.olusturma}'ten beri` : z.platform,
      url: z.url,
    });
    G.kenar(kokId, accId, "linked");
    if (z.website) {
      const dId = G.dugum({ id: `dom:${z.website}`, tur: "domain", etiket: z.website, url: `https://${z.website}` });
      G.kenar(accId, dId, "website");
    }
  }

  // account → bağlı hesaplar / sağlayıcı domainleri (sosyal providerlar)
  for (const s of saglayici) {
    for (const h of s.hesaplar) {
      const key = (h.url && hostAyikla(h.url)) || h.platform;
      const hId = G.dugum({ id: `acc:${h.platform}:${h.kullanici || key}`, tur: "account", etiket: h.kullanici ? `@${h.kullanici}` : h.platform, alt: h.platform, url: h.url });
      G.kenar(kokId, hId, "linked");
    }
    for (const dm of s.domainler) {
      const dId = G.dugum({ id: `dom:${dm}`, tur: "domain", etiket: dm, url: `https://${dm}` });
      G.kenar(kokId, dId, "website");
    }
  }

  // account → birlikte-bildirilen göstergeler (IOC/korelasyon)
  for (const b of baglantilar) {
    const t = b.tip === "telefon" ? "ioc" : b.tip === "iban" ? "ioc" : b.tip === "url" ? "domain" : "ioc";
    const nId = G.dugum({ id: `${b.tip}:${b.deger}`, tur: t as "domain" | "ioc", etiket: b.deger, alt: `${b.sayi}× birlikte bildirildi` });
    G.kenar(kokId, nId, "co-reported");
  }

  const graf = G.bos ? null : G.sonuc();

  risk = Math.min(100, risk);
  const sev = seviye(risk);

  // Hesap hakkında ANLAMLI risk sinyali var mı? Yoksa "yeterli veri yok" —
  // yeşil "temiz" göstermek yanıltıcı olur (temiz ≠ gerçek). Foto/bio linki iste.
  const dotSayisi = (uad.match(/[._]/g) || []).length;
  const sinyalVar = Boolean(marka) || rakam >= 4 || dotSayisi >= 3 || bildirimVar || Boolean(infraDomain) || baglantilar.length > 0;
  const yetersiz = !sinyalVar && risk < 15;

  // ── Gemini raporu (ücretsiz) — yoksa kural-tabanlı ──────────────
  const sinyalOzet = bulgular.join(" ") || "belirgin işaret yok";
  const infraBaglam = infraDomain
    ? `\nİTTİĞİ ALTYAPI → ${infraDomain} (risk ${infraSeviye}). ${infraAlanlar.map((a) => `${a.ad}: ${a.deger}`).join("; ")}${infraSayfa?.baslik ? `; Sayfa: ${infraSayfa.baslik}` : ""}`
    : "";

  const ai = geminiVarMi
    ? await geminiJson<{ ozet: string; neden: string[]; adimlar: string[] }>(
        "Sen SİTS'in sosyal medya güvenlik analistisin. Karşındaki teknik bilgisi OLMAYAN bir vatandaş. " +
          "Platform içi veriye (takipçi, hesap yaşı) erişimin YOK; kesin 'sahtedir' deme, olasılık/işaret dilinde konuş. " +
          "Bir hesabın ittiği link (altyapı) riskliyse ASIL tehlikenin orada olduğunu vurgula. " +
          "Hesaplanan risk seviyesiyle ÇELİŞME. SICAK, net, kısa. Teknik terim kullanma. " +
          'SADECE JSON: {"ozet":"1 cümle sonuç","neden":["sade gerekçeler"],"adimlar":["somut adım"]}. neden 2-5, adimlar 2-4. Türkçe.',
        `Platform: ${platform || "belirsiz"}. Kullanıcı: @${kullanici}. Risk: ${sev} (${risk}/100). Sinyaller: ${sinyalOzet}.${infraBaglam}`
      )
    : null;

  const adimlarYedek = [
    "Profil fotoğrafını aşağıdan yükleyip kontrol et (çalıntı/yapay olabilir).",
    infraDomain ? `Hesabın verdiği ${infraDomain} linkine tıklamadan önce iki kez düşün; kart/şifre isterse girme.` : "Hesabın bio'sundaki linke tıklamadan adresini kontrol et.",
    "Hesap 'resmi' olduğunu iddia ediyorsa mavi tik + takipçi sayısına bak; şüpheliyse platforma şikayet et.",
    "Para/hediye/kod isteyen özel mesajlara asla cevap verme.",
  ];
  const nedenYedek = bulgular.length ? bulgular : ["Kullanıcı adında ve verdiği linkte belirgin bir taklit/tehdit işareti bulunamadı; yine de profil fotosu ve davranışa dikkat et."];

  return NextResponse.json({
    platform,
    kullanici,
    profilUrl: url,
    risk,
    seviye: sev,
    ozet: ai?.ozet || (sev === "Yüksek" ? "Bu hesap büyük olasılıkla sahte/taklit — dikkatli ol." : sev === "Orta" ? "Bazı şüpheli işaretler var, temkinli ol." : "Belirgin bir sahtelik işareti bulunamadı."),
    neden: ai?.neden?.length ? ai.neden : nedenYedek,
    adimlar: ai?.adimlar?.length ? ai.adimlar : adimlarYedek,
    // INFRA kolu — hesabın ittiği altyapının delil kartı
    infra: infraDomain
      ? { domain: infraDomain, risk: infraRisk, seviye: infraSeviye, alanlar: infraAlanlar, ekranGoruntusu: infraEkran, sayfa: infraSayfa }
      : null,
    baglantilar,
    graf,
    yetersiz,
    ai: Boolean(ai),
  });
}
