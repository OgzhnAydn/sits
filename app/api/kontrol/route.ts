import { NextRequest, NextResponse } from "next/server";
import { gostergeCikar, siniflandir, mesajYorumla, bahisMesaji, KATEGORI_ADI } from "@/lib/analyze";
import { gostergeSorgula, sorguKaydet, kampanyaSorgula, kampanyaKaydet } from "@/lib/store";
import { seedKontrol } from "@/lib/seed";
import { DEMO_KAYITLAR, normalize } from "@/lib/demoVeri";
import { ESIK, GOSTER_ESIK } from "@/lib/esik";
import { limitAsildi } from "@/lib/rateLimit";
import { domainOsint, telefonOsint, ibanOsint } from "@/lib/osint";
import { kriptoOsint } from "@/lib/kripto";
import { imzaCikar } from "@/lib/kampanyaImza";
import { markaTaklitBul } from "@/lib/markaTaklit";
import { itibarliMi } from "@/lib/itibarli";

export const runtime = "nodejs";

// Bir MESAJIN tamamını al → içindeki tüm göstergeleri bul, her birini kontrol et,
// sınıflandır, ve tek bir GENEL karar ver.
export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "kontrol", 40);
  if (limit) return limit;

  const { metin, cihazId } = await req.json();
  if (!metin || typeof metin !== "string" || metin.trim().length < 3) {
    return NextResponse.json({ hata: "Bir mesaj veya değer yapıştır." }, { status: 400 });
  }
  const soranId = typeof cihazId === "string" && cihazId ? cihazId : "anon";

  const g = gostergeCikar(metin);
  let { kategori } = siniflandir(metin, g); // kategori adı için (kural)

  const kayitlar = [
    ...g.url.map((v) => ({ tip: "url", deger: v })),
    ...g.iban.map((v) => ({ tip: "iban", deger: v })),
    ...g.telefon.map((v) => ({ tip: "telefon", deger: v })),
    ...g.kripto.map((v) => ({ tip: "kripto", deger: v })),
  ];

  // AI MESAJ YORUMU (akılcı taktik analizi) — göstergeleri kontrolle PARALEL çalışsın.
  const [sonuclar, mesajYorum] = await Promise.all([
    Promise.all(
    kayitlar.map(async (k) => {
      let durum = "temiz";
      let benzersiz = 0;
      // İtibarlı/resmî adresi (siberguvenlik.gov.tr, banka…) crowd gürültüsü ya da
      // hatalı bildirim işaretlemesin — hem rozet hem karar tutarlı kalsın.
      const host = k.deger.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      if (k.tip === "url" && itibarliMi(host)) {
        return { tip: k.tip, deger: k.deger, durum, benzersiz };
      }
      const crowd = await gostergeSorgula(k.deger, k.tip);
      // TEK bildirim (benzersiz=1) yok sayılır (iftira/gürültü) → demo/seed'e düş.
      if (crowd?.bulundu && crowd.benzersiz >= GOSTER_ESIK) {
        benzersiz = crowd.benzersiz;
        durum = crowd.benzersiz >= ESIK ? "dogrulandi" : "az";
      } else {
        const demo = DEMO_KAYITLAR.find(
          (d) => d.tip === k.tip && d.deger.toLowerCase() === k.deger.toLowerCase()
        );
        if (demo) { durum = "dogrulandi"; benzersiz = demo.bildirimSayisi; }
        else if (seedKontrol(k.deger, k.tip)) durum = "liste";
      }
      return { tip: k.tip, deger: k.deger, durum, benzersiz };
    })
    ),
    mesajYorumla(metin, g),
  ]);

  // MEŞRU KOD BİLDİRİMİ: "dolandırıcılık" etiketini kaldır (yanlış-pozitif).
  if (mesajYorum.mesru) kategori = "diger";
  // YASA DIŞI BAHİS: doğru etiket (dolandırıcılık kelime-eşleşmesi değil).
  if (bahisMesaji(metin)) kategori = "yasa_disi";

  let tehlike =
    sonuclar.some((s) => s.durum === "dogrulandi" || s.durum === "liste") ||
    mesajYorum.risk === "yuksek";
  let dikkat =
    sonuclar.some((s) => s.durum === "az") || mesajYorum.risk === "orta";

  // GENEL karar OSINT'e dayansın: birincil site için domain incelemesi yap
  // (VirusTotal, yeni-domain, taklit, geçersiz SSL…). Böylece "bilinmeyen ama
  // şüpheli" bir link asla "temiz" görünmez.
  let birincilUrlRisk: number | null = null;
  if (g.url[0]) {
    try {
      const { deger, tip } = normalize(g.url[0]);
      if (tip === "url") {
        const rap = await domainOsint(deger);
        birincilUrlRisk = rap.risk;
        if (rap.risk >= 55) tehlike = true;
        else if (rap.risk >= 22) dikkat = true;
      }
    } catch {
      // OSINT başarısızsa mevcut karar geçerli
    }
  } else if (g.telefon[0]) {
    // Site yoksa ama telefon varsa: 0900/tanınmayan alan kodu gibi riskleri kullan.
    const rap = await telefonOsint(g.telefon[0]);
    if (rap.risk >= 30) tehlike = true;
    else if (rap.risk >= 12) dikkat = true;
  } else if (g.iban[0]) {
    // Geçersiz IBAN (checksum tutmuyor) → en azından dikkat.
    const rap = ibanOsint(g.iban[0]);
    if (rap.alanlar.some((a) => a.deger.includes("Geçersiz"))) dikkat = true;
  } else if (g.kripto[0]) {
    // Sadece kripto adresi varsa: cüzdan geçmişi risk sinyali versin.
    // Kripto ödeme talebi zaten yüksek riskli → en az "dikkat".
    try {
      const rap = await kriptoOsint(g.kripto[0]);
      if (rap.risk >= 15) tehlike = true;
      else dikkat = true;
    } catch {
      dikkat = true;
    }
  }

  // MARKA TAKLİDİ: link banka/kurum adını taklit ediyor ama resmi değil mi?
  // (ziraatbank-onlinesbi.ph gibi) — en sık ve en tehlikeli Türk dolandırıcılığı.
  const marka = markaTaklitBul(metin, g.url);
  if (marka) tehlike = true;

  // KAMPANYA KALIBI: domain değişse bile aynı tuzağı yakala. Bu mesajın
  // parmak izi daha önce görülmüş mü? (bildirim ya da motor tarafından öğrenilmiş)
  let kampanya: { benzersiz: number; ilkDefaGorulmedi: boolean } | null = null;
  const { imza, yol } = imzaCikar(metin, g.url);
  if (imza) {
    const es = await kampanyaSorgula(imza);
    if (es && es.sayi > 0) {
      kampanya = { benzersiz: es.benzersiz, ilkDefaGorulmedi: true };
      // Bilinen kampanya = adres yeni olsa bile tuzak. Kaynak çoksa kesin tehlike.
      if (es.benzersiz >= 2) tehlike = true;
      else dikkat = true;
    }
  }

  // YANLIŞ ALARM KORUMASI: link RESMİ/itibarlı bir siteye gidiyorsa (akbank.com,
  // turkiye.gov.tr…) ve somut bir tehlike sinyali yoksa, yalnızca sınıflandırıcı
  // kelimeleri yüzünden "tehlikeli" deme. Somut sinyaller korunur:
  // kara liste (durum=liste/dogrulandi), marka taklidi, kampanya, yüksek OSINT.
  // BAŞLIK–DETAY TUTARLILIĞI (kritik UX): insan üstteki kırmızı başlığı görünce
  // aşağıyı okumaz. Bu yüzden başlık, birincil sitenin OSINT sonucuyla ÇELİŞEMEZ.
  // Kural: birincil URL için SOMUT tehlike (kara liste, marka taklidi, kampanya,
  // yüksek OSINT) yoksa VE OSINT riski DÜŞÜK ise (<22), tek bir doğrulanmamış
  // "az bildirim" ya da sınıflandırıcı kelimesi başlığı ASLA kırmızı yapmaz.
  if (g.url[0] && !marka) {
    try {
      const { deger, tip } = normalize(g.url[0]);
      const host = deger.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      const somut =
        sonuclar.some((s) => s.durum === "dogrulandi" || s.durum === "liste") || !!kampanya;
      const osintTemiz = birincilUrlRisk !== null && birincilUrlRisk < 22;
      // YANLIŞ-ALARM yalnızca link İTİBARLI bir siteye (akbank.com, gov.tr) gidiyorsa
      // bastırılır. Çözülmeyen/tanınmayan sahte domain (google-guvenlik.xyz) "osintTemiz"
      // olsa bile GÜVENLİ değildir → bastırma. Ayrıca AI mesajı "yüksek risk" diyorsa
      // (aciliyet/otorite taklidi) asla temize çekme.
      const guvenliUrl = itibarliMi(host);
      if (tip === "url" && guvenliUrl && !somut && osintTemiz && mesajYorum.risk !== "yuksek") {
        tehlike = false;
        dikkat = false;
      }
    } catch {}
  }

  let genel = tehlike ? "tehlikeli" : dikkat ? "dikkat" : "temiz";

  // ÖZ-ÖĞRENME: motor bunu tehlikeli bulduysa imzasını kaydet ki dolandırıcı
  // yarın domaini değiştirdiğinde ilk saniyeden yakalayalım.
  if (imza && genel === "tehlikeli") {
    await kampanyaKaydet(imza, metin, yol, soranId);
  }

  // Derin OSINT için birincil gösterge (varsa site, yoksa ilk gösterge)
  const birincil = g.url[0] || g.iban[0] || g.telefon[0] || g.kripto[0] || null;

  // SOSYAL KANIT: bu göstergeyi senden önce kaç kişi sordu / kaç kişi bildirdi?
  let sosyal: { oncekiSoran: number; benzersizBildiren: number } | null = null;
  if (birincil) {
    const bTip = kayitlar.find((k) => k.deger === birincil)?.tip || "url";
    sosyal = await sorguKaydet(birincil, bTip, soranId);
  }

  // Geriye-dönük "güven" alanı artık AI yorumundan türer (eski kelime-skoruna değil).
  const guven = mesajYorum.risk === "yuksek" ? "yüksek" : mesajYorum.risk === "orta" ? "orta" : "düşük";

  return NextResponse.json({
    genel,
    kategori,
    kategoriAdi: KATEGORI_ADI[kategori],
    guven,
    mesajYorum, // AI akılcı yorum: risk + gerekçe + taktikler
    sonuclar,
    birincil,
    sosyal,
    kampanya,
    marka,
  });
}
