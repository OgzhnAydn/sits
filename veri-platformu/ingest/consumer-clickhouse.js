// TÜKETİCİ (ClickHouse) — Redpanda 'certificates' akışını okur, ham sertifikaları sits.raw_certificates'e
// TOPLU yazar (batch insert = yüksek verim). ClickHouse tek-tek insert'i sevmez; ~1000'lik gruplar halinde.
import { Kafka } from "kafkajs";
import { createClient } from "@clickhouse/client";

const BROKER = process.env.KAFKA_BROKER || "localhost:19092";
const TOPIC = process.env.KAFKA_TOPIC || "certificates";
const CH_URL = process.env.CLICKHOUSE_URL || "http://localhost:8123";
const CH_USER = process.env.CLICKHOUSE_USER || "sits";
const CH_PASS = process.env.CLICKHOUSE_PASSWORD || "";
const YIGIN = Number(process.env.YIGIN || 1000);
const YIGIN_MS = Number(process.env.YIGIN_MS || 3000);

const ch = createClient({ url: CH_URL, username: CH_USER, password: CH_PASS, database: "sits" });
const kafka = new Kafka({ clientId: "sits-ch-consumer", brokers: [BROKER] });
const consumer = kafka.consumer({ groupId: "clickhouse-writer" });

let tampon = [];
let sonYazma = Date.now();

function satir(rec) {
  return {
    seen_at: Math.floor(Date.now() / 1000),
    domain: String(rec.domain || "").slice(0, 255),
    all_domains: (rec.all_domains || []).map((d) => String(d).slice(0, 255)),
    tld: String(rec.tld || ""),
    is_wildcard: rec.is_wildcard ? 1 : 0,
    not_before: Math.floor(new Date(rec.not_before || Date.now()).getTime() / 1000),
    not_after: Math.floor(new Date(rec.not_after || Date.now()).getTime() / 1000),
    issuer_ca: String(rec.issuer_ca || "bilinmiyor").slice(0, 255),
    serial: String(rec.serial || ""),
    log_source: String(rec.log_source || ""),
    cert_index: Number(rec.cert_index || 0),
    leaf_hash: String(rec.leaf_hash || ""),
  };
}

async function bosalt() {
  if (!tampon.length) return;
  const grup = tampon; tampon = []; sonYazma = Date.now();
  try {
    await ch.insert({ table: "raw_certificates", values: grup, format: "JSONEachRow" });
    console.log(`[ch] +${grup.length} satır yazıldı (raw_certificates)`);
  } catch (e) {
    console.error("[ch] insert hatası:", e.message);
  }
}

async function main() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`[ch] Redpanda '${TOPIC}' dinleniyor → ClickHouse ${CH_URL}`);
  // periyodik boşaltma (yığın dolmasa da zamanla yaz)
  setInterval(() => { if (tampon.length && Date.now() - sonYazma > YIGIN_MS) bosalt(); }, 1000);
  await consumer.run({
    eachMessage: async ({ message }) => {
      try { tampon.push(satir(JSON.parse(message.value.toString()))); } catch { /* bozuk mesaj */ }
      if (tampon.length >= YIGIN) await bosalt();
    },
  });
}
process.on("SIGTERM", async () => { await bosalt().catch(() => {}); try { await consumer.disconnect(); } catch {} process.exit(0); });
main().catch((e) => { console.error("[ch] ölümcül:", e); process.exit(1); });
