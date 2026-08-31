// YENİDEN TARAMA — aktif adayları periyodik yeniden analiz eder ve risk YÖRÜNGESİNE
// yeni nokta ekler. Böylece bir domainin park→web→logo→login→kimlik-toplama
// olgunlaşmasını ZAMAN İÇİNDE yakalarız (kokpitteki "risk gelişimi" gerçek olur).
import { markaAdaylariGetir, riskGecmisiEkle } from "./store";
import { domainOsint, saldiriAsamasi, altyapiDna } from "./osint";
import { gercekTaklit } from "./korunanMarkalar";

export async function yenidenTaraBatch(n = 8, offset?: number): Promise<{ taranan: number; kaydedilen: number; aktif: number }> {
  const ham = await markaAdaylariGetir(200);
  const aktif = ham.filter((a) => gercekTaklit(a.domain, a.marka));
  if (!aktif.length) return { taranan: 0, kaydedilen: 0, aktif: 0 };
  // gün-bazlı rotasyon: her gün farklı batch → tüm adaylar sırayla yeniden taranır
  const off = offset ?? Math.floor(Date.now() / 86_400_000);
  const start = ((off * n) % aktif.length + aktif.length) % aktif.length;
  const batch = aktif.slice(start, start + n);
  let kaydedilen = 0, taranan = 0;
  const bitis = Date.now() + 45_000; // Vercel 60s limitinden önce güvenle dur
  for (const a of batch) {
    if (Date.now() > bitis) break; // süre bütçesi doldu → timeout'a girme
    taranan++;
    try {
      const r = await domainOsint(a.domain, a.domain);
      await riskGecmisiEkle(a.domain, r.risk, saldiriAsamasi(r), altyapiDna(r)?.imza);
      kaydedilen++;
    } catch { /* tek domain başarısız → diğerlerini etkileme */ }
  }
  return { taranan, kaydedilen, aktif: aktif.length };
}
