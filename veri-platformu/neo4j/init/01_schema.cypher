// SİTS / MirLeon — Neo4j ŞEMASI (Faz 1.2)
// Altyapı GRAFİĞİ: sertifikalardan türeyen varlıklar ve aralarındaki ilişkiler. ClickHouse "ne kadar
// çok" (hacim/analitik) sorusuna, Neo4j "neyle bağlantılı" (kampanya/altyapı/ortak-operatör) sorusuna
// yanıt verir. Bu dosya kısıt + index kurar (ingest'in hızlı MERGE'ü için ŞART).
// Uygula:  cypher-shell -a bolt://localhost:7687 -u neo4j -p <parola> -f 01_schema.cypher
// (docker compose'daki neo4j-init servisi bunu otomatik çalıştırır.)

// ── DÜĞÜM BENZERSİZLİK KISITLARI ─────────────────────────────────────────────
// MERGE'in hızlı olması ve mükerrer düğüm oluşmaması için her düğüm-türünün anahtarı tekil olmalı.
CREATE CONSTRAINT domain_ad     IF NOT EXISTS FOR (d:Domain)               REQUIRE d.name    IS UNIQUE;
CREATE CONSTRAINT ca_ad         IF NOT EXISTS FOR (c:CertificateAuthority) REQUIRE c.name    IS UNIQUE;
CREATE CONSTRAINT ip_adr        IF NOT EXISTS FOR (i:IPAddress)            REQUIRE i.address IS UNIQUE;
CREATE CONSTRAINT asn_no        IF NOT EXISTS FOR (a:ASN)                  REQUIRE a.number  IS UNIQUE;
CREATE CONSTRAINT ns_host       IF NOT EXISTS FOR (n:Nameserver)           REQUIRE n.host    IS UNIQUE;
-- Not: varlık (IS NOT NULL) kısıtları yalnız Neo4j Enterprise'da; Community'de benzersizlik yeterli.

// ── ARAMA İNDEKSLERİ ─────────────────────────────────────────────────────────
CREATE INDEX domain_tld    IF NOT EXISTS FOR (d:Domain)    ON (d.tld);
CREATE INDEX domain_gorulme IF NOT EXISTS FOR (d:Domain)   ON (d.first_seen);
CREATE INDEX ip_asn        IF NOT EXISTS FOR (i:IPAddress) ON (i.asn);

// ── İLİŞKİ MODELİ (referans) ─────────────────────────────────────────────────
// Aşağıdaki desenleri INGEST katmanı MERGE eder (bu dosya yalnız şemayı kurar):
//
//   (:Domain {name, tld, first_seen, is_wildcard})
//     -[:ISSUED_BY {not_before, not_after, log_source}]->   (:CertificateAuthority {name})
//     -[:RESOLVES_TO {last_seen}]->                          (:IPAddress {address, asn, country})
//     -[:USES_NS]->                                          (:Nameserver {host})
//     -[:SIBLING_OF {reason}]->                              (:Domain)          // aynı altyapı/kampanya
//   (:IPAddress) -[:IN_ASN]-> (:ASN {number, org})
//
// Örnek ingest (parametreli — sürücü tarafında $ ile beslenir):
//   MERGE (d:Domain {name:$domain})
//     ON CREATE SET d.tld=$tld, d.first_seen=datetime($seen), d.is_wildcard=$wild
//   MERGE (c:CertificateAuthority {name:$ca})
//   MERGE (d)-[r:ISSUED_BY]->(c)
//     ON CREATE SET r.not_before=datetime($nb), r.not_after=datetime($na), r.log_source=$log;

// Şema doğrulama (uygulandığında kısıtları listeler):
SHOW CONSTRAINTS;
