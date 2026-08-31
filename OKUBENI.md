# Siber Bildir — Web Motoru (Sorgula + Bildir)

Hacim toplayan, SEO'lu web motoru. Next.js + Firebase (opsiyonel) + Claude (opsiyonel).
**Anahtarsız da çalışır** (demo modu); anahtar girilince gerçeğe geçer.

## Çalıştır
```bash
cd C:\Users\cc\Desktop\siber-bildir-web
npm run dev
# http://localhost:3000
```

## Sayfalar
- `/`         → iki kapı: Sorgula / Bildir
- `/sorgula`  → numara/IBAN/site daha önce bildirilmiş mi? (SEO'nun büyüme motoru)
- `/bildir`   → olayı anlat → AI kategori + gösterge çıkarır + referans no + kişisel adımlar

## API
- `POST /api/sorgula` → { giris } → bildirim kaydı var mı
- `POST /api/analyze` → { metin } → kategori, göstergeler (URL/IBAN/telefon), rehber adımları

## AI'ı aç (kişisel rehber akıllansın)
`.env.local` oluştur (`.env.local.example`'dan kopyala) ve gir:
```
ANTHROPIC_API_KEY=...   # Claude — analiz + rehber (yoksa kural tabanlı yedek çalışır)
```
Model: `claude-sonnet-5` (rehber). İleride yüksek hacimli sınıflandırma için `claude-haiku-4-5`.

## Gerçek veri (Firebase)
Şimdilik sorgu `lib/demoVeri.ts` içindeki örneklerle çalışıyor. Firebase bağlanınca
`app/api/sorgula` ve `app/api/analyze` Firestore'a okuma/yazmaya geçecek (sonraki adım).

## Yayın (SEO için kritik)
Vercel'e deploy → `/sorgula` sayfaları Google'da indekslenir. Büyüme buradan gelir.

## Durum
- [x] İki kapı (Sorgula/Bildir) + honest disclaimer
- [x] Gösterge çıkarımı (regex) + AI analiz (Claude, opsiyonel)
- [x] Kişisel adım rehberi + referans no
- [x] Demo sorgu
- [ ] Firebase kalıcı veri (sonraki)
- [ ] Bildirilen göstergeleri sorgu veritabanına yazma (döngüyü kapatır)
- [ ] Vercel deploy + SEO sayfaları
