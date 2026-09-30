// ÜRETİCİ — CT loglarından ham sertifikaları çeker ve Redpanda 'certificates' topic'ine yazar.
// Tek kaynak: buradan sonra ClickHouse ve Neo4j tüketicileri AYNI akıştan besleniyor.
import { Kafka, Partitioners } from "kafkajs";
import { loglariSec, logTuru } from "./ct.js";

const BROKER = process.env.KAFKA_BROKER || "localhost:19092";
const TOPIC = process.env.KAFKA_TOPIC || "certificates";
const PENCERE = Number(process.env.CT_PENCERE || 256);
const TUR_MS = Number(process.env.CT_TUR_MS || 4000);

const kafka = new Kafka({ clientId: "sits-ct-producer", brokers: [BROKER] });
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner, allowAutoTopicCreation: true });

let loglar = [];
let sayac = 0;

async function tur() {
  if (!loglar.length) loglar = await loglariSec(6);
  const mesajlar = [];
  await Promise.all(loglar.map(async (log) => {
    for await (const rec of logTuru(log, PENCERE)) {
      // domain'e göre partition → aynı domainin kayıtları sıralı işlenir
      mesajlar.push({ key: rec.domain, value: JSON.stringify(rec) });
    }
  }));
  if (mesajlar.length) {
    // Büyük turları parçala (tek istek çok büyük olmasın)
    for (let i = 0; i < mesajlar.length; i += 500) {
      await producer.send({ topic: TOPIC, messages: mesajlar.slice(i, i + 500) });
    }
    sayac += mesajlar.length;
    console.log(`[producer] +${mesajlar.length} sertifika yayınlandı (toplam ${sayac})`);
  }
}

async function main() {
  await producer.connect();
  console.log(`[producer] Redpanda'ya bağlandı: ${BROKER} → topic '${TOPIC}'`);
  // sürekli döngü
  for (;;) {
    try { await tur(); } catch (e) { console.error("[producer] tur hatası:", e.message); }
    await new Promise((r) => setTimeout(r, TUR_MS));
  }
}
process.on("SIGTERM", async () => { try { await producer.disconnect(); } catch {} process.exit(0); });
main().catch((e) => { console.error("[producer] ölümcül:", e); process.exit(1); });
