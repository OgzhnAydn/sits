# SİTS / Siber Bildir — Proje Özeti

## Tek cümlede
Türkiye için, **kalabalıktan beslenen bir siber-dolandırıcılık sorgu ve bildirim aracı**:
"Bu link / telefon / IBAN dolandırıcı mı?" sorusunu anında yanıtlar, kullanıcı bir olay
paylaştığında **profesyonel bir OSINT raporu + yol haritası** sunar — hepsi sıcak,
karikatür maskotlu bir arayüzle.

---

## Hangi sorunu çözüyor?

Siber dolandırıcılık Türkiye'de çok yaygın ama vatandaş üç noktada tıkanıyor:

1. **"Bu güvenli mi?"** — Ödeme yapmadan/tıklamadan önce bir şeyin sahte olup olmadığını
   bilmenin kolay yolu yok.
2. **"Nereye bildireceğim?"** — Bankaya mı, ihbarweb'e mi, CİMER'e mi, BTK'ya mı? Kafa
   karışıklığından çoğu kişi hiç bildirmiyor.
3. **"Ne yapmalıyım?"** — Dolandırıldıktan sonra atılacak adımları bilmiyor.

SİTS bu üçünü de tek yerde çözer: **sorgula → öğren → bildir → yol al.** Her bildirim,
başkalarının aynı tuzağa düşmesini engelleyen ortak bir erken-uyarı kalkanı oluşturur.

---

## Özellikler

### 1. Paylaş (mobil) — sürtünmesiz bildirim
- React Native/Expo uygulaması. **Herhangi bir uygulamada** (Instagram, WhatsApp, tarayıcı,
  X, YouTube…) şüpheli içeriği **Paylaş → Siber Bildir** ile gönderirsin.
- Gelen link/metin/görsel otomatik yakalanır, kategori seçilir, canlı kara listeye işlenir.

### 2. Sorgula
- Telefon / IBAN / web sitesi gir → daha önce bildirilmiş mi, anında gör.
- **Dürüst 4 seviyeli sonuç:**
  - **Doğrulandı** — en az 3 farklı kişi bildirmiş (kesin sinyal)
  - **Az bildirim** — 1-2 bildirim (temkinli ol, kesin değil)
  - **Bilinen zararlı site** — açık tehdit listesinde
  - **Bulunamadı**
- Ardından otomatik **OSINT raporu** çıkar.

### 3. Bildir
- Olayı kendi cümlelerinle anlat → sistem **göstergeleri otomatik çıkarır** (URL/IBAN/telefon),
  kategoriye ayırır, **referans numarası** üretir, **kişiye özel adımlar** + **OSINT raporu** verir.
- Bildirim kara listeye işlenir (döngüyü besler).

### 4. OSINT Raporu (ürünün asıl farkı)
Paylaşılan değer hakkında **ücretsiz açık kaynaklardan** gerçek istihbarat:
- **Site:** kayıt tarihi, **domain yaşı**, kayıt firması, IP, barındırma, ülke, riskli uzantı
- **Telefon:** operatör (Turkcell/Vodafone/TT), geçerlilik
- **IBAN:** hangi banka, checksum geçerlilik
- Bunları **topluluk bildirimleri + tehdit listesi** ile birleştirip **0-100 risk skoru**
  (Yüksek/Orta/Düşük) + maskot yorumu + "ne yapmalısın" adımları üretir.
- (Anthropic anahtarıyla yorumlar yapay zekayla zenginleşir.)

### 5. Günün Uyarısı (bilinçlendirme)
- Maskotun ağzından, her gün değişen, karikatür/sıcak dilli dolandırıcılık uyarısı.
  (AI ile taze üretilebilir; anahtarsız da elle yazılı uyarılar döner.)

### 6. Rehber
- Yaygın durumlar için hızlı "ne yapmalısın" + hangi kuruma başvurulacağı.

### 7. Güvenlik Puanın + Son Etkinliklerin
- Kullanıcının kendi sorgularına dayanan kişisel puan (geri gelme kancası) ve son işlem listesi.

---

## Güven ve hukuk

- **İftira koruması:** Bir IBAN/telefon, **en az 3 farklı cihazdan** bildirilmeden "dolandırıcı"
  damgası yemez. Tek kişi (defalarca bildirse bile) masum birini kara listeye düşüremez.
- **KVKK:** Gizlilik politikası + kullanım koşulları + ilk açılışta rıza onayı.
- **Resmi değiliz** uyarısı; acil/ağır durumlarda 155 / ihbarweb'e yönlendirme.
- **Kişisel veri satılmaz.**

## Soğuk başlangıç çözümü
- Veritabanı gün sıfırında boş kalmasın diye **1500 gerçek zararlı domain** açık tehdit
  listesinden tohumlandı.

## Tasarım
- Sıcak "SİTS" dili (Material 3, amber + adaçayı yeşili, Quicksand/Inter, cam kartlar),
  dost "siber koruyucu hayalet" maskotu, akıcı animasyonlar.

## Teknik
- **Web:** Next.js · **Mobil:** React Native/Expo · **Veri:** Firebase Firestore (canlı)
- **AI:** Claude (opsiyonel, yorum/uyarı) · **OSINT:** RDAP + DNS + ip-api (ücretsiz/anahtarsız)

---

## İş modeli
- **Bireyler ücretsiz** kullanır ve veriyi besler.
- **Gelir işletmelerden:** bankalar / pazar yerleri / fintech, dolandırıcılık verisini
  **API ile sorgular** (dolandırıcılığı önlemek onlara pahalıya mal olur).
- Satılan mağdurun kişisel verisi değil; **anonim suç-altyapısı istihbaratı** + rızalı yönlendirme.

## Durum
Çalışan MVP: paylaş + sorgula + bildir + canlı kara liste + OSINT + iftira koruması + KVKK.
Yayına (deploy) çıkmaya hazır; kalanlar: güvenlik kurallarını yayınlamak, KVKK alanlarını
doldurmak, (opsiyonel) Anthropic kredisi, ve deploy.
