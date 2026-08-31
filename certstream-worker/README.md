# SİTS — Canlı CT Dinleyici (Marka Taklit Avcısı)

Sertifika Şeffaflığı (CT) loglarını **doğrudan** okuyan, hep-açık bir arka plan işi.
Ölü/aracı bir CertStream sunucusuna **bağımlı DEĞİLDİR** — Google'ın resmî log
listesinden kullanılabilir logları bulur, her birini güncel uçtan (STH) **ileriye**
takip eder, yeni yayınlanan sertifikaların domainlerini korunan markalarla karşılaştırır.

- Marka adını taşıyan resmî-olmayan domain → `/api/marka-aday` (ADAY kuyruğu).
- Marka adı yok ama phishing-temalı (login/banka/ödeme…) → `/api/favicon-tara` (favicon eşleşmesi).
- Resmî domainler (allowlist) asla aday yapılmaz.

Vercel serverless kalıcı bağlantı tutamadığı için bu servis AYRI çalışır (Fly.io / Railway / Raspberry Pi).

## Ortam değişkenleri
| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `SITS_URL` | – | SİTS taban adresi (vars. `https://siber-bildir-web.vercel.app`) |
| `MARKA_ADAY_SECRET` | **evet** | `/api/marka-aday` ile paylaşılan sır. **Aynısı Vercel'de de tanımlı olmalı.** |
| `CT_MAX_LOG` | – | Takip edilecek en yüksek-hacimli log sayısı (vars. `4`) |

## Fly.io kurulumu (tek makine, ~$2/ay)
```bash
cd certstream-worker
fly launch --no-deploy            # uygulamayı oluştur (fly.toml zaten hazır)
fly secrets set MARKA_ADAY_SECRET=<uzun-rastgele-sır>
fly deploy
fly logs                          # canlı: [özet] entry=… domain=… aday=…
```
**Not:** Aynı `MARKA_ADAY_SECRET` Vercel'de de tanımlı olmalı
(Vercel → Project → Settings → Environment Variables), yoksa `/api/marka-aday`
`503` (secret yok) ya da `401` (uyuşmuyor) döner.

## Yerel test
```bash
MARKA_ADAY_SECRET=test SITS_URL=http://localhost:3000 CT_MAX_LOG=2 npm start
```
~1 dakikada `[özet]` satırında binlerce `entry`/`domain` görürsün (gerçek akış).
`aday` çoğu dakikada 0'dır — Türk markası taklidi nadir geçer; yakalanınca 🎯 loglanır.

## Kapasite / dürüstlük notu
256–512 MB'lik bir makine büyük logları **near-real-time** takip eder. Ani bir
patlamada bir log çok geride kalırsa kod uca yakın **resync** yapar (bazı entry'ler
atlanabilir) — yani "örnekleyici", %100 tam-akış denetleyici değil. Daha fazla kapsam
için `CT_MAX_LOG`'u artır ya da makineyi büyüt.
