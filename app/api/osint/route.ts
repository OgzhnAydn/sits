import { NextRequest, NextResponse } from "next/server";
import { geminiVarMi, geminiJson } from "@/lib/gemini";
import { normalize } from "@/lib/demoVeri";
import { domainOsint, telefonOsint, ibanOsint, typosquatDurustlukCap, kategoriKarti, kSeviye, domainDurumu, saldiriAsamasi, SALDIRI_ASAMALARI, altyapiDna, type OsintRapor } from "@/lib/osint";
import { kriptoOsint } from "@/lib/kripto";
import { itibarliMi } from "@/lib/itibarli";
import { gostergeSorgula, baglantilariGetir, analizKaydet, delilCikar, riskGecmisiEkle, riskGecmisiGetir, dnaEslesenler } from "@/lib/store";
import { cacheOku, cacheYaz } from "@/lib/osintCache";
import { seedKontrol } from "@/lib/seed";
import { ESIK, GOSTER_ESIK } from "@/lib/esik";
import { limitAsildi } from "@/lib/rateLimit";
import { insanYorum, type Anlati } from "@/lib/insanYorum";

export const runtime = "nodejs";

function seviye(risk: number): "Yüksek" | "Orta" | "Düşük" {
  if (risk >= 60) return "Yüksek";
  if (risk >= 30) return "Orta";
  return "Düşük";
}

// AI (Gemini ücretsiz) varsa daha zengin, insanca bir değerlendirme üretir.
// Akıllı gating: AI'ı SADECE anlamlı sinyal varken çağır (net-temizlerde kural
// tabanlı yeter → kota/masraf korunur). Çağrı başarısızsa insanYorum'a düşer.
// AI halüsinasyon guardrail'i: metin, hesaplanan risk seviyesiyle çelişiyor mu?
function aiTutarli(metin: string, riskSeviye: string): boolean {
  const t = metin.toLowerCase();
  const guvenVeren = /(güvenli|gönül rahatlığ|sorun yok|endişe etme|güvenle ziyaret|risk yok|zararlı değil|temiz bir site|güvenilir bir|rahatlıkla)/;
  const tehlikeVeren = /(dolandırıc|tehlikeli|sakın|kesinlikle girme|oltalama|zararlı|kimlik.*çal|para.*gönderme|kandır)/;
  if (riskSeviye === "Yüksek" && guvenVeren.test(t)) return false; // yüksek riskte güven veremez
  if (riskSeviye === "Düşük" && tehlikeVeren.test(t)) return false; // düşük riskte suçlayamaz
  return true;
}

async function aiAnlati(rapor: OsintRapor, riskSeviye: string): Promise<Anlati> {
  const yedek = insanYorum(rapor, riskSeviye);
  // AI'ı çağır: risk/bulgu varsa VEYA anlatılacak sayfa içeriği varsa (haber
  // sitesi gibi meşru linkte bile "bu ne, ne hakkında" değeri katar).
  const anlamli =
    rapor.risk >= 15 || rapor.bulgular.length > 0 || Boolean(rapor.sayfa?.baslik);
  if (!geminiVarMi || !anlamli) return yedek;

  const sinyaller =
    rapor.alanlar.map((a) => `${a.ad}: ${a.deger}`).join("; ") +
    (rapor.bulgular.length ? " | Gözlemler: " + rapor.bulgular.join(" ") : "");

  // Sayfa içeriği bağlamı — AI "bu ne sitesi, ne hakkında" diyebilsin.
  // Yalnızca GÜVENİLİR meta (başlık/açıklama/site/görünür metin) verilir;
  // türü AI'ın kendisi belirler (kırılgan regex türü GÖNDERİLMEZ).
  const s = rapor.sayfa;
  const icerik = s
    ? `\nSAYFA İÇERİĞİ → ${s.siteAdi ? `Site: ${s.siteAdi}; ` : ""}${s.baslik ? `Başlık: ${s.baslik}; ` : ""}${s.aciklama ? `Açıklama: ${s.aciklama}; ` : ""}${s.ozetMetin ? `Metin örneği: ${s.ozetMetin.slice(0, 450)}` : ""}`
    : "";

  const system =
    `Sen SİTS'in kıdemli siber güvenlik analistisin. Karşındaki teknik bilgisi OLMAYAN bir vatandaş. ` +
    `Görevin İKİ yönlü: (1) bu adres/sayfa NE — hangi tür site, ne hakkında; (2) güvenlik değerlendirmesi. ` +
    `SICAK, SEMPATİK, güven veren ve arkadaşça bir dille konuş — sanki kullanıcının yanında duran, onu sakinleştiren bir dost gibi ("merak etme", "birlikte bakalım", "yanındayım", "rahat ol" tonunda). Yine de NET ol; korkutma, abartma, garanti verme. Teknik terim (RDAP, TLD, DNS) kullanma. ` +
    `SAYFA İÇERİĞİ verildiyse "yorum" alanında ÖNCE sitenin ne olduğunu ve ne hakkında olduğunu 1-2 cümleyle anlat, SONRA güvenliğini değerlendir. ` +
    `"icerikTuru": içeriğe bakarak KISA bir tür etiketi ver (ör. "Haber sitesi", "Devlet portalı", "E-ticaret", "Banka giriş sayfası", "Bahis sitesi", "Kişisel blog"); içerik yoksa boş bırak. ` +
    `Hesaplanan risk seviyesiyle ÇELİŞME. SADECE şu JSON'u döndür: ` +
    `{"icerikTuru":"kısa tür etiketi","ozet":"1 net cümle sonuç","yorum":"ne olduğu + güvenlik, 3-5 cümle","neden":["tek cümle sade gerekçe"],"adimlar":["somut adım"]}. ` +
    `neden 3-6 madde, adimlar 2-4 madde. Türkçe.`;
  const user = `Değer: ${rapor.deger} (tür: ${rapor.tip}). Risk: ${riskSeviye} (${rapor.risk}/100). Ham sinyaller: ${sinyaller}${icerik}`;

  const j = await geminiJson<{ icerikTuru?: string; ozet?: string; yorum?: string; neden?: string[]; adimlar?: string[] }>(system, user);
  if (!j) return yedek;
  const aiMetin = `${j.ozet || ""} ${j.yorum || ""}`;
  // GUARDRAIL 1: AI çıktısı hesaplanan riskle ÇELİŞİRSE (yüksek riskte güven verir
  // ya da düşük riskte suçlar) → halüsinasyon; kural-tabanlı metne düş.
  if (!aiTutarli(aiMetin, riskSeviye)) return yedek;
  // GUARDRAIL 2: AI, İTİBARLI OLMAYAN bir domaini "resmi/official site" diye İLAN
  // EDEMEZ. (akbnk.com'u "Akbank'ın resmi ve güvenli sitesidir" sandı — tehlikeli.)
  const resmiIddia = /(resm[iî]|official)[^.!?]{0,40}(site|adres|sayfa|web|banka)/i;
  if (resmiIddia.test(aiMetin) && !itibarliMi(rapor.deger)) return yedek;
  // GUARDRAIL 3: Sayfa içeriği YÜKLENEMEDİYSE (r.sayfa yok), AI sayfada ne olduğunu
  // UYDURAMAZ. turkcell.online'ı hiç açamadan "sahte giriş sayfası görünümünde" dedi
  // — halüsinasyon. İçerik doğrulanmadan giriş/form/ödeme/şifre iddiası → yedek.
  const icerikDogrulanmadi = !rapor.sayfa?.baslik;
  const sayfaIddia = /(giriş sayfas|oturum aç|login|şifre (alan|gir)|parola gir|kullanıcı adı.*şifre|ödeme sayfas|kart bilgi.*gir|form.*doldur)/i;
  if (icerikDogrulanmadi && sayfaIddia.test(aiMetin)) return yedek;
  return {
    ozet: j.ozet || yedek.ozet,
    yorum: j.yorum || yedek.yorum,
    neden: Array.isArray(j.neden) && j.neden.length ? j.neden : yedek.neden,
    adimlar: Array.isArray(j.adimlar) && j.adimlar.length ? j.adimlar : yedek.adimlar,
    icerikTuru: j.icerikTuru || undefined,
    ai: true,
  };
}

// ── AI DEDEKTİF (Silah 1): toplanan tüm sinyalleri bir dolandırıcılık uzmanı gibi okuyup
// GEREKÇELİ, yapılandırılmış hüküm üretir. Vatandaş anlatısından AYRI — profesyonel/operatör görünümü.
export type DedektifHukmu = { tur: string; hedef: string; paraYontemi: string; operasyon: string; gerekce: string[]; guven: "Yüksek" | "Orta" | "Düşük"; ai: boolean };
// AI Dedektif'in "tur" hükmünü kategori kartındaki bir kategoriye eşle (tutarlılık için).
function dedektifTurKategori(tur: string): string | null {
  const t = (tur || "").toLowerCase();
  if (/kimlik.?av|oltalama/.test(t)) return "Kimlik Avı"; // Türkçe kesin kimlik-avı terimi
  if (/bahis|kumar|casino|iddaa/.test(t)) return "Yasadışı Bahis";
  if (/zararl[ıi]|malware|truva|trojan/.test(t)) return "Zararlı Yazılım";
  if (/marka takl|kurum takl/.test(t)) return "Marka Taklidi"; // "marka/kurum taklidi phishing" → marka
  if (/phishing/.test(t)) return "Kimlik Avı"; // marka değil, genel phishing
  if (/yat[ıi]r[ıi]m|kripto|dolandır|e-ticaret|sahte e-tic/.test(t)) return "Dolandırıcılık";
  return null;
}

async function dedektifHukmu(
  rapor: OsintRapor,
  riskSeviye: string,
  kategoriler: { ad: string; seviye: string }[] | undefined,
): Promise<DedektifHukmu | undefined> {
  if (!geminiVarMi || rapor.risk < 20) return undefined; // yalnız anlamlı şüphede
  const sinyaller = rapor.alanlar.map((a) => `${a.ad}: ${a.deger}`).join("; ") + (rapor.bulgular.length ? " | Bulgular: " + rapor.bulgular.join(" ") : "");
  const kat = (kategoriler || []).filter((k) => k.seviye !== "Yok").map((k) => `${k.ad}=${k.seviye}`).join(", ");
  const s = rapor.sayfa;
  const icerik = s ? ` | Sayfa: ${s.baslik || ""} ${(s.ozetMetin || "").slice(0, 300)}` : "";
  const system =
    `Sen SİTS'in kıdemli dolandırıcılık istihbarat analistisin — bir insan dedektif gibi düşün. ` +
    `Sana bir adres hakkında toplanan HAM SİNYALLER veriliyor; sen bunlardan MANTIK YÜRÜTEREK bir hüküm çıkaracaksın. UYDURMA — yalnız verilen sinyallere dayan. ` +
    `Hesaplanan risk (${riskSeviye}) ile çelişme. SADECE şu JSON'u döndür: ` +
    `{"tur":"dolandırıcılık türü (ör. Kamu kurumu taklidi kimlik-avı | Sahte yatırım/kripto | Marka taklidi phishing | Yasadışı bahis | Sahte e-ticaret | Zararlı yazılım | Belirsiz/temiz)",` +
    `"hedef":"kimi hedefliyor (ör. banka müşterileri, öğrenciler, genel halk) — sinyalden çıkmazsa 'genel'",` +
    `"paraYontemi":"parayı nasıl topluyor (IBAN, kart, kripto, ödeme sayfası) — sinyalde yoksa 'tespit edilmedi'",` +
    `"operasyon":"tek site mi yoksa organize operasyonun parçası mı (kardeş domain/ortak IP sinyaline bak) — 1 cümle",` +
    `"gerekce":["kanıt→sonuç mantığı, her madde tek cümle, sinyale dayalı"],` +
    `"guven":"Yüksek|Orta|Düşük (kanıt gücüne göre)"}. gerekce 3-5 madde. Türkçe, teknik-terim yok.`;
  const user = `Adres: ${rapor.deger}. Risk: ${riskSeviye} (${rapor.risk}/100). Kategoriler: ${kat || "yok"}. Ham sinyaller: ${sinyaller}${icerik}`;
  const j = await geminiJson<Partial<DedektifHukmu>>(system, user);
  if (!j || !j.tur) return undefined;
  // Guardrail: yüksek riskte "temiz" diyemez, düşük riskte "kesin dolandırıcı" diyemez.
  const metin = `${j.tur} ${(j.gerekce || []).join(" ")}`.toLowerCase();
  if (riskSeviye === "Yüksek" && /\btemiz\b|meşru|güvenli/.test(j.tur.toLowerCase())) return undefined;
  if (riskSeviye === "Düşük" && /kesin dolandırıc|kesinlikle sahte/.test(metin)) return undefined;
  return {
    tur: j.tur,
    hedef: j.hedef || "genel",
    paraYontemi: j.paraYontemi || "tespit edilmedi",
    operasyon: j.operasyon || "tek site",
    gerekce: Array.isArray(j.gerekce) && j.gerekce.length ? j.gerekce.slice(0, 5) : [],
    guven: j.guven === "Yüksek" || j.guven === "Düşük" ? j.guven : "Orta",
    ai: true,
  } as DedektifHukmu;
}

export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "osint", 20);
  if (limit) return limit;

  try {
  const { giris } = await req.json();
  if (!giris || typeof giris !== "string" || giris.trim().length < 3) {
    return NextResponse.json({ hata: "Geçerli bir değer girin." }, { status: 400 });
  }
  const { deger, tip } = normalize(giris);

  // Pahalı enricher çıktısını önbellekten oku (dış API kotasını korur).
  // Topluluk/seed/bağlantı sinyalleri cache SONRASI eklenir — hep taze kalır.
  let rapor = (await cacheOku(tip, deger)) as OsintRapor | null;
  if (!rapor) {
    // Tam URL'yi (yol dahil) içerik analizi için geçir — paylaşılan belirli
    // sayfayı (haber makalesi gibi) tanımlayabilelim.
    if (tip === "url") rapor = await domainOsint(deger, giris.trim());
    else if (tip === "telefon") rapor = await telefonOsint(deger);
    else if (tip === "kripto") rapor = await kriptoOsint(deger);
    else rapor = ibanOsint(deger);
    await cacheYaz(tip, deger, rapor);
  }

  // İtibarlı/resmî site (banka, .gov.tr, büyük haber sitesi…) crowd/seed
  // gürültüsüyle risk almasın — üstteki başlıkla tutarlı, düşük risk kalsın.
  const itibarliSite = tip === "url" && itibarliMi(deger);

  // Topluluk sinyali
  const crowd = itibarliSite ? null : await gostergeSorgula(deger, tip);
  if (crowd?.bulundu && crowd.benzersiz >= ESIK) {
    rapor.risk += 45;
    rapor.bulgular.push(`${crowd.benzersiz} farklı kişi dolandırıcı olarak bildirdi.`);
    rapor.alanlar.push({ ad: "Topluluk bildirimi", deger: `${crowd.benzersiz} kişi (doğrulandı)` });
  } else if (crowd?.bulundu && crowd.benzersiz >= GOSTER_ESIK) {
    // 2+ farklı bildiren: zayıf ama gösterilir. TEK bildirim (benzersiz=1) hiç
    // gösterilmez ve risk eklemez — iftira/gürültü koruması.
    rapor.risk += 6;
    rapor.alanlar.push({ ad: "Topluluk bildirimi", deger: `${crowd.benzersiz} kişi (doğrulanmadı)` });
  }
  // Açık tehdit listesi
  if (!itibarliSite && seedKontrol(deger, tip)) {
    rapor.risk += 50;
    rapor.bulgular.push("Açık tehdit listesinde (oltalama/zararlı) kayıtlı.");
    rapor.alanlar.push({ ad: "Tehdit listesi", deger: "Kayıtlı" });
  }

  // Kampanya bağı: birlikte bildirilen diğer göstergeler
  const baglantilar = await baglantilariGetir(deger, tip);
  if (baglantilar.length) {
    rapor.risk += 10;
    rapor.bulgular.push(
      `Bu değer, ${baglantilar.length} başka göstergeyle (telefon/IBAN/site) birlikte bildirildi — organize bir dolandırıcılık işareti olabilir.`
    );
  }

  rapor.risk = Math.min(100, rapor.risk);

  // DÜRÜST BELİRSİZLİK GEÇİDİ (paylaşımlı — sahte-bul da aynısını kullanır → tutarlı skor).
  typosquatDurustlukCap(rapor);

  // Kategori skor kartı + canlı durum — yalnız URL/domain analizinde.
  const kategoriler = tip === "url" ? kategoriKarti(rapor) : undefined;
  const durum = tip === "url" ? domainDurumu(rapor) : undefined;

  // ── TUTARLILIK C: kanıtlanmış kurum/marka taklidi → Marka Taklidi + rozet hizası ──
  // (logo/kurum/taklit-uyarısı kanıtı var VE fnss-tarzı meşru yönlendirme yoksa) DEDEKTİF'TEN ÖNCE
  // çalışır ki dedektif düzeltilmiş riski görsün.
  if (kategoriler) {
    const taklitKanit = rapor.alanlar.some((a) => a.ad === "İçerikte kurum taklidi" || a.ad === "Logo taklidi (görsel)" || a.ad === "Taklit uyarısı");
    const mesruYon = rapor.alanlar.some((a) => a.ad === "Not" && /meşru birleştirme/.test(a.deger));
    if (taklitKanit && !mesruYon) {
      const mk = kategoriler.find((k) => k.ad === "Marka Taklidi");
      if (mk && mk.skor < 60) { mk.skor = 60; mk.seviye = kSeviye(60); }
      if (rapor.risk < 60) rapor.risk = 60;
    }
  }

  let riskSeviye = seviye(rapor.risk);
  const analiz = await aiAnlati(rapor, riskSeviye);

  // AI Dedektif — gerekçeli uzman hükmü (yalnız URL + anlamlı şüphede).
  const dedektif = tip === "url" ? await dedektifHukmu(rapor, riskSeviye, kategoriler) : undefined;

  // ── TUTARLILIK A + B: kategori kartı ↔ Dedektif ↔ rozet çelişmesin ──
  if (kategoriler) {
    // A) Dedektif bir suç türü söylediyse o kategori "Yok" kalamaz (park site → kural
    //    formu göremez ama Dedektif bütünü görür: banka logosu + ramazan + park = oltalama).
    if (dedektif && dedektif.guven !== "Düşük") {
      const hedefKat = dedektifTurKategori(dedektif.tur);
      const taban = dedektif.guven === "Yüksek" ? 40 : 20; // Şüpheli : Belirsiz
      const k = hedefKat ? kategoriler.find((x) => x.ad === hedefKat) : undefined;
      if (k && k.skor < taban) { k.skor = taban; k.seviye = kSeviye(taban); }
    }
    // B) Herhangi bir kategori "Yüksek" ise üst rozet de en az Yüksek olmalı.
    if (kategoriler.some((k) => k.seviye === "Yüksek") && rapor.risk < 60) rapor.risk = 60;
  }
  riskSeviye = seviye(rapor.risk); // tutarlılık sonrası güncel rozet

  // KANIT DEPOSU: nihai verdict'ten SONRA sakla — bulduğumuz TÜM delili (teknik
  // istihbarat + kategoriler + Dedektif hükmü + öne çıkan somut deliller) kalıcı yaz.
  if (tip === "url") {
    analizKaydet({
      domain: deger,
      risk: rapor.risk,
      seviye: riskSeviye,
      bulgular: rapor.bulgular,
      ekranGoruntusu: rapor.ekranGoruntusu,
      baslik: rapor.alanlar.find((a) => a.ad === "Sayfa başlığı")?.deger,
      kaynak: "sorgu",
      zaman: Date.now(),
      alanlar: rapor.alanlar,
      kategoriler: kategoriler?.map((k) => ({ ad: k.ad, seviye: k.seviye })),
      dedektifTur: dedektif?.tur,
      dedektifGuven: dedektif?.guven,
      deliller: delilCikar(rapor.alanlar),
    }).catch(() => {});
  }

  // ── RİSK YÖRÜNGESİ + ALTYAPI DNA (gerçek, zamansal + ilişkisel) ──
  let asama = 0;
  let gecmis: { t: number; risk: number; asama: number }[] = [];
  let dna: { imza: string; parcalar: { k: string; v: string }[]; eslesenler: string[] } | undefined;
  if (tip === "url") {
    asama = saldiriAsamasi(rapor);
    const d = altyapiDna(rapor);
    await riskGecmisiEkle(deger, rapor.risk, asama, d?.imza).catch(() => {});
    gecmis = await riskGecmisiGetir(deger).catch(() => []);
    if (d) {
      const eslesenler = await dnaEslesenler(d.imza, deger).catch(() => []);
      dna = { ...d, eslesenler };
    }
  }

  return NextResponse.json({ ...rapor, riskSeviye, analiz, baglantilar, kategoriler, durum, dedektif,
    asama, asamalar: tip === "url" ? SALDIRI_ASAMALARI : undefined, gecmis, dna });
  } catch (e: unknown) {
    // Güvenlik ağı: tek bir enricher (site fetch, whois, VT…) beklenmedik hata verse bile
    // tüm analiz 500 ile çökmesin — temiz mesaj dön, ayrıntıyı sunucu loguna yaz.
    console.error("[OSINT hata]", (e as { stack?: string })?.stack || e);
    return NextResponse.json({ hata: "Analiz sırasında bir sorun oluştu, lütfen tekrar deneyin." }, { status: 500 });
  }
}
