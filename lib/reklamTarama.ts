// REKLAM İZLEME — markayı taklit eden REKLAM kampanyaları (edinim kanalı).
// Meta (Facebook/Instagram) Ad Library resmî API'si: graph.facebook.com/ads_archive.
// META_AD_TOKEN gerektirir (ücretsiz FB Ad Library erişim token'ı). Token yoksa
// dürüstçe "yapılandırılmadı" döner — uydurma reklam ÜRETMEYİZ.
//
// DÜRÜST NOT: Meta'nın API'si AB dışında çoğunlukla siyasi/toplumsal reklamları
// kapsar; TR ticari reklam kapsamı sınırlı olabilir. Token eklendiğinde gerçek
// sonuçla test edilip kapsam netleşir.
import { AVCI_MARKALAR } from "./korunanMarkalar";

export type Reklam = { reklamveren: string; baslik?: string; metin?: string; hedefAlan?: string; snapshot?: string; baslangic?: string; platformlar?: string[]; supheli: boolean };
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
    const resmiKok = (m?.resmi || []).map((d) => d.split(".").slice(-2).join("."));
    const alanlar = "id,page_name,ad_creative_link_captions,ad_creative_link_titles,ad_creative_bodies,ad_snapshot_url,ad_delivery_start_time,publisher_platforms";
    const url = `https://graph.facebook.com/v21.0/ads_archive?search_terms=${encodeURIComponent(anahtar)}&ad_reached_countries=%5B%22TR%22%5D&ad_active_status=ALL&fields=${alanlar}&limit=40&access_token=${encodeURIComponent(token)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const j = (await r.json()) as { data?: Record<string, unknown>[]; error?: { message?: string } };
    if (j.error) return bos("Meta API hatası: " + (j.error.message || "yetki/kapsam"), true);

    const reklamlar: Reklam[] = [];
    for (const a of j.data || []) {
      const reklamveren = String(a.page_name || "");
      const cap = ((a.ad_creative_link_captions as string[]) || [])[0] || "";
      const hedefAlan = cap ? kok(cap) : undefined;
      // RESMÎ mi: hedef alan markanın resmî domaini VEYA reklamveren adı markayı içeriyor.
      const resmiMi = (!!hedefAlan && resmiKok.some((k) => hedefAlan.endsWith(k))) || reklamveren.toLowerCase().includes(anahtar);
      reklamlar.push({
        reklamveren,
        baslik: ((a.ad_creative_link_titles as string[]) || [])[0],
        metin: ((a.ad_creative_bodies as string[]) || [])[0]?.slice(0, 160),
        hedefAlan,
        snapshot: a.ad_snapshot_url as string | undefined,
        baslangic: a.ad_delivery_start_time as string | undefined,
        platformlar: a.publisher_platforms as string[] | undefined,
        supheli: !resmiMi,
      });
    }
    // Şüpheli (resmî olmayan reklamveren/hedef) önce.
    reklamlar.sort((a, b) => (a.supheli === b.supheli ? 0 : a.supheli ? -1 : 1));
    return {
      marka: anahtar, markaAdi, yapilandirildi: true, reklamlar,
      supheli: reklamlar.filter((r) => r.supheli).length,
      not: reklamlar.length ? "Meta reklam kütüphanesi canlı tarandı." : "Bu marka için Meta reklam kütüphanesinde kayıt bulunmadı (veya API bu bölgede ticari reklamları döndürmüyor).",
    };
  } catch {
    return bos("Meta reklam kütüphanesine ulaşılamadı (ağ/zaman aşımı).", true);
  }
}
