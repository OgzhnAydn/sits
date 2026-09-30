# SİTS / MirLeon — Veri Platformu

Certificate Transparency firehose'unu **yut · sakla · ilişkilendir**. Şu anki hafif yapı (Vercel +
Firestore + CT örnekleme) *örnekler*; bu platform **her sertifikayı** işlemek içindir.

## Mimari

```
        CT logları (firehose)
                │
                ▼
        ┌───────────────┐   ham akış   ┌──────────────┐  analitik/işleme
        │   Redpanda    │─────────────▶│  ClickHouse  │  (30 gün TTL ham log)
        │ (Kafka kuyruk)│              └──────────────┘
        └───────┬───────┘   türetilmiş  ┌──────────────┐  "neyle bağlantılı"
                └──────────────────────▶│    Neo4j     │  (altyapı grafiği, kalıcı)
                                        └──────────────┘
```

- **Redpanda** — Kafka-uyumlu kuyruk. Worker'lar CT'den okuyup buraya `certificates` topic'ine yazar; tüketiciler buradan okur (ölçeklenir, tampon görevi görür).
- **ClickHouse** — sütun-tabanlı depo. Ham sertifikaların tamamı `sits.raw_certificates` (30 gün TTL). "Bugün kaç .tr sertifikası" gibi analitik saniyeler içinde.
- **Neo4j** — grafik. `(:Domain)-[:ISSUED_BY]->(:CertificateAuthority)`, IP/ASN/NS ilişkileri. "Bu sahte site hangi altyapıyı, kardeş domainleri paylaşıyor" sorusu buraya.

## Çalıştırma

```bash
cd veri-platformu
cp .env.example .env          # parolaları değiştir
docker compose --env-file .env up -d
docker compose ps             # hepsi "healthy" olmalı (~30-60 sn)
```

Arayüzler:
- ClickHouse HTTP: http://localhost:8123  ·  Redpanda Console: http://localhost:8085  ·  Neo4j Browser: http://localhost:7474

## Doğrulama

```bash
# ClickHouse — tablo + TTL kuruldu mu
docker exec sits-clickhouse clickhouse-client -q "SHOW CREATE TABLE sits.raw_certificates" --user sits --password "$CLICKHOUSE_PASSWORD"

# Neo4j — kısıtlar uygulandı mı
docker exec sits-neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "SHOW CONSTRAINTS"

# Redpanda — kümede sağlık + certificates topic'i oluştur
docker exec sits-redpanda rpk cluster health
docker exec sits-redpanda rpk topic create certificates -p 6 -r 1
```

## Faz durumu

- [x] **1.1** Docker Compose ortamı — Redpanda + ClickHouse + Neo4j
- [x] **1.2** Şemalar — ClickHouse `raw_certificates` (+30 gün TTL, MV, TR görünümü) · Neo4j düğüm/ilişki kısıtları
- [ ] **2.x** Ingest — CertStream worker → Redpanda `certificates` topic
- [ ] **2.x** Tüketiciler — Redpanda → ClickHouse (ham) + Neo4j (grafik) yazıcılar
- [ ] **3.x** Zenginleştirme — içerik + görsel sınıflandırma (`lib/siteSinifla.ts`) sonuçlarını grafiğe bağla

## Notlar

- **Sunucu gerektirir** — bu stack Vercel'de çalışmaz; bir VPS/sunucuda 24/7 durur. Dev için tek-düğüm; üretimde `--smp`, bellek ve replikasyonu artır.
- **Ham log 30 günde silinir** (TTL) — kalıcı değer türetilmiş tablolarda (`daily_tld_stats`) + Neo4j grafiğinde tutulur.
- `.env` git'e girmez.
