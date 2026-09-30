-- SİTS / MirLeon — ClickHouse ŞEMASI (Faz 1.2)
-- Certificate Transparency akışından yutulan HAM sertifikaların tamamı. Sütun-tabanlı depo:
-- milyarlarca satırda saniyeler içinde analitik. Ham loglar 30 GÜN sonra TTL ile otomatik silinir
-- (kalıcı değer Neo4j grafiğinde + türetilmiş tablolarda tutulur; ham log yalnız kısa-vadeli işleme için).
-- Bu dosya konteynerin İLK açılışında otomatik çalışır (/docker-entrypoint-initdb.d).

CREATE DATABASE IF NOT EXISTS sits;

-- ── HAM SERTİFİKALAR ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sits.raw_certificates
(
    seen_at       DateTime            DEFAULT now(),   -- akıştan YUTULDUĞU an (ingest zamanı)
    domain        String,                              -- birincil SAN (kök alan adı, küçük harf)
    all_domains   Array(String),                       -- sertifikadaki TÜM SAN'lar (çoklu-domain sertifikalar)
    tld           LowCardinality(String),              -- uzantı: com, com.tr, xyz, shop…
    is_wildcard   UInt8               DEFAULT 0,        -- *.example.com joker sertifikası mı
    not_before    DateTime,                            -- sertifika geçerlilik BAŞLANGICI (≈ domainin doğuşu)
    not_after     DateTime,                            -- geçerlilik BİTİŞİ
    issuer_ca     LowCardinality(String),              -- veren makam: Let's Encrypt, Google Trust Services…
    serial        String              DEFAULT '',       -- sertifika seri numarası
    log_source    LowCardinality(String),              -- hangi CT logundan geldi (argon/xenon/nimbus…)
    cert_index    UInt64              DEFAULT 0,        -- CT log içindeki sıra indeksi
    leaf_hash     String              DEFAULT '',       -- yaprak (leaf) hash — tekilleştirme için

    -- Arama hızlandırıcı: domain üzerinde bloom filter (nokta-arama O(1)'e yakın)
    INDEX idx_domain domain TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_tld    tld    TYPE set(0)              GRANULARITY 4
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(seen_at)                          -- aylık parçalar → TTL silme ucuz (parça-düşür)
ORDER BY (domain, seen_at)                              -- domain-bazlı sorgu + zaman sıralaması
TTL seen_at + INTERVAL 30 DAY DELETE                    -- HAM LOG 30 GÜN SONRA OTOMATİK SİLİNİR
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;

-- ── GÜNLÜK TLD ÖZETİ (materialized view) ─────────────────────────────────────
-- Ham log TTL ile silinse de gün/uzantı bazlı hacim KALICI kalsın (trend/istatistik için).
CREATE TABLE IF NOT EXISTS sits.daily_tld_stats
(
    gun         Date,
    tld         LowCardinality(String),
    adet        UInt64
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(gun)
ORDER BY (gun, tld);

CREATE MATERIALIZED VIEW IF NOT EXISTS sits.mv_daily_tld
TO sits.daily_tld_stats
AS SELECT toDate(seen_at) AS gun, tld, count() AS adet
   FROM sits.raw_certificates
   GROUP BY gun, tld;

-- ── TÜRKİYE-ADAY GÖRÜNÜMÜ (kolay filtre) ─────────────────────────────────────
-- .tr uzantılı VEYA son 24 saatte yutulan yeni sertifikalar — tüketicilerin işleme alacağı dilim.
CREATE VIEW IF NOT EXISTS sits.v_tr_candidates AS
SELECT domain, tld, not_before, issuer_ca, seen_at
FROM sits.raw_certificates
WHERE (tld LIKE '%.tr' OR tld = 'tr' OR endsWith(domain, '.tr'))
  AND seen_at > now() - INTERVAL 1 DAY;
