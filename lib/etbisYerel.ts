// ETBİS YEREL BEYAZ-LİSTE — indirilen tam sicilden (scripts/etbis-indir.mjs →
// scripts/etbis-beyazliste.mjs → lib/etbisData.json) üretilen domain kümesi. Uygulama
// bunu ANINDA sorgular (canlı fetch YOK) → her analizde hızlı + devlet-sunucusuna yük yok.
//
// DÜRÜST SINIR: Liste, herkese açık grid'in bir anlık dökümüdür ve ~%100 tam OLMAYABİLİR
// (sayfalama kayması/dedup). Bu yüzden:
//   • "kayıtlı" (listede VAR) → GÜVENİLİR pozitif sinyal.
//   • "kayıtsız" (listede YOK) → TEK BAŞINA kesin değil; ceza vermeden önce canlı teyit
//     istenir (bkz. lib/osint.ts). Listenin eksikliği yanlış-pozitife yol açmasın.

import data from "./etbisData.json";

// NOT: ham listede birkaç kayıtta baştaki/sondaki boşluk var → trim (yoksa o domainler "kayıtsız" görünür).
const KAYITLI = new Set<string>((data.domainler as string[]).map((s) => s.trim()).filter(Boolean));
const DOGRULANMIS = new Set<string>((data.dogrulanmisDomainler as string[]).map((s) => s.trim()).filter(Boolean));

export const etbisGuncelleme = data.guncelleme as string;
export const etbisToplam = data.benzersizDomain as number;

const IKI_SEVIYE = new Set(["com.tr", "net.tr", "org.tr", "gov.tr", "edu.tr", "bel.tr", "pol.tr", "k12.tr", "av.tr", "web.tr", "gen.tr", "biz.tr", "info.tr", "tv.tr", "co.uk", "org.uk", "com.co"]);
function normalize(hostRaw: string): string {
  return String(hostRaw || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
}
function registrable(host: string): string {
  const p = host.split(".").filter(Boolean);
  if (p.length <= 2) return host;
  const son2 = p.slice(-2).join(".");
  return IKI_SEVIYE.has(son2) ? p.slice(-3).join(".") : son2;
}

export type EtbisYerelSonuc = { kayitliMi: boolean; dogrulanmisMi: boolean };

// Domain (veya host/URL) yerel ETBİS listesinde mi? Tam host VEYA registrable (eTLD+1)
// eşleşmesi kabul edilir (magaza.x.com kayıtlıysa x.com da meşrudur).
export function etbisYerel(domain: string): EtbisYerelSonuc {
  const host = normalize(domain);
  if (!host || !host.includes(".")) return { kayitliMi: false, dogrulanmisMi: false };
  const reg = registrable(host);
  const kayitliMi = KAYITLI.has(host) || KAYITLI.has(reg);
  const dogrulanmisMi = DOGRULANMIS.has(host) || DOGRULANMIS.has(reg);
  return { kayitliMi, dogrulanmisMi };
}
