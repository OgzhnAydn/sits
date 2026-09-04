// YENİDEN TARAMA — aktif adayları periyodik yeniden analiz eder ve risk YÖRÜNGESİNE
// yeni nokta ekler. Böylece bir domainin park→web→logo→login→kimlik-toplama
// olgunlaşmasını ZAMAN İÇİNDE yakalarız (kokpitteki "risk gelişimi" gerçek olur).
import { markaAdaylariGetir, riskGecmisiEkle, adayDurumGuncelle, type Yukselme } from "./store";
import { domainOsint, saldiriAsamasi, altyapiDna, domainDurumu, takipIdBirincil } from "./osint";
import { gercekTaklit } from "./korunanMarkalar";

// Bir sonraki tarama, aday önceki duruma göre EYLEME mi geçti? Cevabı bu üretir.
// "Zayıf" = henüz tehlikeye dönüşmemiş (park / yayında değil). Bir zayıf durumdan
// çıkış, aktif-tuzağa dönüş veya ciddi risk sıçraması → yükselme olayı.
const ZAYIF = new Set(["park", "yayinda-degil"]);
function yukselmeCikar(a: { skor?: number; durum?: string }, yeniRisk: number, yeniDurum: string): Yukselme | undefined {
  const oncekiRisk = Math.round(a.skor ?? 0);
  const sebep: string[] = [];
  if (ZAYIF.has(a.durum || "") && !ZAYIF.has(yeniDurum)) sebep.push(`${a.durum} → ${yeniDurum}: yayına/tuzağa geçti`);
  if (yeniDurum === "aktif-tuzak" && a.durum !== "aktif-tuzak") sebep.push("aktif kimlik-avına dönüştü");
  if (Math.round(yeniRisk) - oncekiRisk >= 20) sebep.push(`risk ${oncekiRisk} → ${Math.round(yeniRisk)}`);
  if (!sebep.length) return undefined;
  return { t: Date.now(), sebep, oncekiRisk, simdikiRisk: Math.round(yeniRisk), oncekiDurum: a.durum, simdikiDurum: yeniDurum };
}

export async function yenidenTaraBatch(n = 8, offset?: number): Promise<{ taranan: number; kaydedilen: number; aktif: number; yukselen: number }> {
  const ham = await markaAdaylariGetir(200);
  const aktif = ham.filter((a) => gercekTaklit(a.domain, a.marka));
  if (!aktif.length) return { taranan: 0, kaydedilen: 0, aktif: 0, yukselen: 0 };
  // gün-bazlı rotasyon: her gün farklı batch → tüm adaylar sırayla yeniden taranır
  const off = offset ?? Math.floor(Date.now() / 86_400_000);
  const start = ((off * n) % aktif.length + aktif.length) % aktif.length;
  const batch = aktif.slice(start, start + n);
  let kaydedilen = 0, taranan = 0, yukselen = 0;
  const bitis = Date.now() + 45_000; // Vercel 60s limitinden önce güvenle dur
  for (const a of batch) {
    if (Date.now() > bitis) break; // süre bütçesi doldu → timeout'a girme
    taranan++;
    try {
      const r = await domainOsint(a.domain, a.domain);
      await riskGecmisiEkle(a.domain, r.risk, saldiriAsamasi(r), altyapiDna(r)?.imza, takipIdBirincil(r));
      // ── GEÇİŞ TESPİTİ: önceki duruma göre eyleme geçtiyse ayrı olay + durumu tazele ──
      const yeniDurum = domainDurumu(r).durum;
      const yukselme = yukselmeCikar(a, r.risk, yeniDurum);
      await adayDurumGuncelle(a.domain, yeniDurum, r.risk, yukselme);
      if (yukselme) yukselen++;
      kaydedilen++;
    } catch { /* tek domain başarısız → diğerlerini etkileme */ }
  }
  return { taranan, kaydedilen, aktif: aktif.length, yukselen };
}
