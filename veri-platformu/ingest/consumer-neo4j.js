// TÜKETİCİ (Neo4j) — Redpanda 'certificates' akışını okur, altyapı GRAFİĞİNİ kurar:
//   (:Domain)-[:ISSUED_BY {not_before,not_after,log_source}]->(:CertificateAuthority)
// UNWIND ile toplu MERGE (tek-tek MERGE yavaş; ~500'lük gruplar). IP/ASN/NS zenginleştirmesi Faz 3.
import { Kafka } from "kafkajs";
import neo4j from "neo4j-driver";

const BROKER = process.env.KAFKA_BROKER || "localhost:19092";
const TOPIC = process.env.KAFKA_TOPIC || "certificates";
const NEO_URL = process.env.NEO4J_URL || "bolt://localhost:7687";
const NEO_USER = process.env.NEO4J_USER || "neo4j";
const NEO_PASS = process.env.NEO4J_PASSWORD || "";
const YIGIN = Number(process.env.YIGIN || 500);
const YIGIN_MS = Number(process.env.YIGIN_MS || 3000);

const driver = neo4j.driver(NEO_URL, neo4j.auth.basic(NEO_USER, NEO_PASS), { maxConnectionPoolSize: 10 });
const kafka = new Kafka({ clientId: "sits-neo4j-consumer", brokers: [BROKER] });
const consumer = kafka.consumer({ groupId: "neo4j-writer" });

const CYPHER = `
UNWIND $kayitlar AS k
MERGE (d:Domain {name: k.domain})
  ON CREATE SET d.tld = k.tld, d.first_seen = datetime(k.not_before), d.is_wildcard = k.is_wildcard
MERGE (c:CertificateAuthority {name: k.issuer_ca})
MERGE (d)-[r:ISSUED_BY]->(c)
  ON CREATE SET r.not_before = datetime(k.not_before), r.not_after = datetime(k.not_after), r.log_source = k.log_source
`;

let tampon = [];
let sonYazma = Date.now();

async function bosalt() {
  if (!tampon.length) return;
  const grup = tampon; tampon = []; sonYazma = Date.now();
  const session = driver.session();
  try {
    await session.run(CYPHER, { kayitlar: grup });
    console.log(`[neo4j] +${grup.length} domain→CA ilişkisi işlendi`);
  } catch (e) {
    console.error("[neo4j] yazma hatası:", e.message);
  } finally { await session.close(); }
}

async function main() {
  // Sürücü doğrula
  await driver.verifyConnectivity();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`[neo4j] Redpanda '${TOPIC}' dinleniyor → Neo4j ${NEO_URL}`);
  setInterval(() => { if (tampon.length && Date.now() - sonYazma > YIGIN_MS) bosalt(); }, 1000);
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const k = JSON.parse(message.value.toString());
        tampon.push({ domain: k.domain, tld: k.tld || "", is_wildcard: k.is_wildcard ? 1 : 0, issuer_ca: k.issuer_ca || "bilinmiyor", not_before: k.not_before, not_after: k.not_after, log_source: k.log_source || "" });
      } catch { /* bozuk mesaj */ }
      if (tampon.length >= YIGIN) await bosalt();
    },
  });
}
process.on("SIGTERM", async () => { await bosalt().catch(() => {}); try { await consumer.disconnect(); await driver.close(); } catch {} process.exit(0); });
main().catch((e) => { console.error("[neo4j] ölümcül:", e); process.exit(1); });
