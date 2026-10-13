// REKLAM İZLEME — markayı taklit eden REKLAM kampanyaları (edinim kanalı).
// Meta (Facebook/Instagram) Ad Library resmî API'si: graph.facebook.com/ads_archive.
// META_AD_TOKEN gerektirir (ücretsiz FB Ad Library erişim token'ı). Token yoksa
// dürüstçe "yapılandırılmadı" döner — uydurma reklam ÜRETMEYİZ.
//
// DÜRÜST NOT: Meta'nın API'si AB dışında çoğunlukla siyasi/toplumsal reklamları
// kapsar; TR ticari reklam kapsamı sınırlı olabilir. Token eklendiğinde gerçek
// sonuçla test edilip kapsam netleşir.
import { AVCI_MARKALAR } from "./korunanMarkalar";

export type Reklam = { reklamveren: string; baslik?: string; metin?: string; hedefAlan?: string; snapshot?: string; baslangic?: string; platformlar?: string[]; supheli: boolean; tur?: "resmi" | "supheli" | "incele" | "ilgisiz" };
export type ReklamSonuc = { marka: string; markaAdi: string; yapilandirildi: boolean; reklamlar: Reklam[]; supheli: number; not: string };

const kok = (h: string) => h.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").toLowerCase();

export async function reklamTara(marka: string): Promise<ReklamSonuc> {
  const m = AVCI_MARKALAR.find((x) => x.anahtar === marka.toLowerCase());
  const anahtar = (m?.anahtar || marka).toLowerCase();
  const markaAdi = m?.ad || marka;
  const bos = (not: string, yap = false): ReklamSonuc => ({ marka: anahtar, markaAdi, yapilandirildi: yap, reklamlar: [], supheli: 0, not });

  const token = process.env.META_AD_TOKEN;
  if (!token) return bos("Meta reklam izleme için META_AD_TOKEN gerekli (ücretsiz FB Ad Library erişim token'ı). Eklenince otomatik devreye girer.");

  try {
    // TAM resmî domain (çok-parçalı TLD-güvenli: "turkiye.gov.tr" → sadece turkiye.gov.tr ve alt-alanları;
    // slice(-2) "gov.tr" verip HER devlet sitesini resmî sanıyordu — o bug düzeltildi).
    const resmiTam = (m?.resmi || []).map((d) => d.toLowerCase().replace(/^www\./, "").replace(/\/.*$/, ""));
    // Türkçe-güvenli + tire/boşluk/noktalama-duyarsız normalize: "E-Devlet" ↔ "edevlet", "TOKİ" ↔ "toki".
    const norm = (s?: string) => (s || "").toLowerCase().replace(/[İı]/g, "i").replace(/̇/g, "").replace(/[^a-z0-9ğüşöç]/g, "");
    const nAnahtar = norm(anahtar);
    const nMarkaAdi = norm(markaAdi);
    const markaGecer = (...ss: (string | undefined)[]) => ss.some((s) => s && norm(s).includes(nAnahtar));
    // KAMU markası (.gov.tr vb.) reklam VERMEZ → markayı anan HER reklam taklittir (e-Devlet, TOKİ…).
    const kamu = (m?.resmi || []).some((d) => /\.(gov|bel|pol|tsk|k12|edu)\.tr$/i.test(d));
    const alanlar = "id,page_name,ad_creative_link_captions,ad_creative_link_titles,ad_creative_bodies,ad_snapshot_url,ad_delivery_start_time,publisher_platforms";
    const url = `https://graph.facebook.com/v21.0/ads_archive?search_terms=${encodeURIComponent(anahtar)}&ad_reached_countries=%5B%22TR%22%5D&ad_active_status=ALL&fields=${alanlar}&limit=40&access_token=${encodeURIComponent(token)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const j = (await r.json()) as { data?: Record<string, unknown>[]; error?: { message?: string } };
    if (j.error) return bos("Meta API hatası: " + (j.error.message || "yetki/kapsam"), true);

    const tumu: Reklam[] = [];
    for (const a of j.data || []) {
      const reklamveren = String(a.page_name || "");
      const cap = ((a.ad_creative_link_captions as string[]) || [])[0] || "";
      const hedefAlan = cap ? kok(cap) : undefined;
      const baslik = ((a.ad_creative_link_titles as string[]) || [])[0];
      const metin = ((a.ad_creative_bodies as string[]) || [])[0]?.slice(0, 160);
      // RESMÎ = YALNIZ hedef alan markanın RESMÎ domaini (taklit edilemez tek güçlü sinyal).
      const resmiMi = !!hedefAlan && resmiTam.some((d) => hedefAlan === d || hedefAlan.endsWith("." + d));
      // Reklam markayı anıyor mu (ad/başlık/metin/alan)? Anmıyorsa → İLGİSİZ gürültü ("toki" oyunu).
      const markaRef = markaGecer(reklamveren, baslik, metin, hedefAlan);
      // Meta bu reklamı KALDIRMIŞ / standart-ihlali → kesin şüpheli (isim eşleşse bile).
      const metaKapatti = /we later disabled|disabled for not following|advertising standards|without a required disclaimer|didn.?t include a disclaimer/i.test(`${baslik || ""} ${metin || ""}`);
      // Reklamveren adı markayla BİREBİR → muhtemelen resmî sayfa (yalnız TİCARİ marka için geçerli).
      const birebirIsim = norm(reklamveren) === nAnahtar || norm(reklamveren) === nMarkaAdi;
      // Katman: resmî(domain) → şüpheli(Meta-kaldırdı) → KAMU markası ise markayı anan HER reklam şüpheli
      // (e-Devlet reklam vermez) → ticari+birebir-isim incele → ticari+farklı-isimle marka = şüpheli.
      let tur: Reklam["tur"];
      if (!markaRef) tur = "ilgisiz";
      else if (resmiMi) tur = "resmi";
      else if (metaKapatti) tur = "supheli";
      else if (kamu) tur = "supheli";          // kamu markası → her marka-reklamı taklit
      else if (birebirIsim) tur = "incele";    // ticari resmî sayfa adı, teyitsiz → incele
      else tur = "supheli";                    // ticari, başka isimle marka kullanımı → şüpheli
      tumu.push({
        reklamveren, baslik, metin, hedefAlan,
        snapshot: a.ad_snapshot_url as string | undefined,
        baslangic: a.ad_delivery_start_time as string | undefined,
        platformlar: a.publisher_platforms as string[] | undefined,
        supheli: tur === "supheli", tur,
      });
    }
    // İLGİSİZ reklamları (markayı gerçekten anmayan gürültü) gösterme; sıra: şüpheli > incele > resmî.
    const sira = (r: Reklam) => (r.tur === "supheli" ? 0 : r.tur === "incele" ? 1 : 2);
    const reklamlar = tumu.filter((r) => r.tur !== "ilgisiz").sort((a, b) => sira(a) - sira(b));
    const supSay = reklamlar.filter((r) => r.tur === "supheli").length;
    const incSay = reklamlar.filter((r) => r.tur === "incele").length;
    const resSay = reklamlar.filter((r) => r.tur === "resmi").length;
    const ilgisiz = tumu.length - reklamlar.length;
    const parcalar = [supSay && `${supSay} şüpheli`, incSay && `${incSay} incele`, resSay && `${resSay} resmî`, ilgisiz && `${ilgisiz} ilgisiz elendi`].filter(Boolean).join(", ");
    return {
      marka: anahtar, markaAdi, yapilandirildi: true, reklamlar, supheli: supSay,
      not: reklamlar.length
        ? `Meta reklam kütüphanesi tarandı — ${parcalar}.`
        : (j.data || []).length
          ? "Bulunan reklamlar markayla ilgisiz çıktı (gürültü) — şüpheli taklit reklamı yok."
          : "Bu marka için Meta reklam kütüphanesinde kayıt bulunmadı (veya API bu bölgede ticari reklamları döndürmüyor).",
    };
  } catch {
    return bos("Meta reklam kütüphanesine ulaşılamadı (ağ/zaman aşımı).", true);
  }
}
