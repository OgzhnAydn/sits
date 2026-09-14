// YASA DIŞI BAHİS İMZASI — bir alan adının yasa dışı bahis/kumar sitesi olma olasılığını
// domain adından (imzadan) ölçer. Türkiye'de bahis/kumar devlet tekelidir (İddaa/Spor Toto/
// Milli Piyango); bunların DIŞINDA bahis sunan site yasa dışıdır. Bu siteler güçlü imza taşır
// (marka + "giriş/güncel adres" ayna deseni + riskli TLD) → ucuz ve etkili yakalanır.
// DÜRÜST: bu bir ÖN-FİLTREdir (isimden). Kesin karar için domainOsint (içerik/USOM/TLD) gerekir.

const RISKLI_TLD = ["click", "xyz", "top", "online", "site", "live", "vip", "bet", "casino", "app", "fun", "icu", "cyou", "sbs", "lol", "cfd", "shop"];

// Bilinen bahis marka aileleri (Türkiye'de yaygın yasa dışı bahis siteleri).
// Özellikle GENEL kurallarla (bet-son-eki / casino / bahis) yakalanamayan UYDURMA/coined
// adlar burada olmalı (slotio, casibom, wonodds…) — reklamlarda görülenler eklenir.
const BET_MARKA = /(bet(turkey|boo|nano|park|tilt|win|ist|gram|matik|orspar|ada|line|per|cio|sat|zula|puan|order|moon|kanyon|baba)|sahabet|tipobet|jojobet|holiganbet|mars?bahis|sekabet|pinbahis|bahsegel|s[üu]perbahis|casino ?maxi|casinometropol|mobilbahis|matadorbet|restbet|dinamobet|elexbet|betmatik|discount ?casino|nakitbahis|kral ?bet|imajbet|onwin|xslot|pusulabet|betwoon|maltcasino|artemisbet|grand ?pasha|pashagaming|betgaranti|betwinner|1xbet|mostbet|melbet|pin ?up|jetbahis|hovarda|betpas|milanobet|piabella|bettilt|slotio|casibom|casino ?bom|wonodds|red ?win|favori(sen|bahis)?|bahisnow|asyabahis|tarafbet|extrabet|gorabet|galabet|ligobet|tulipbet|corlobet|betwild|starzbet|zbahis|betciko|paribahis|bets10|youwin|betbaba|casino ?fast|bycasino|betnis|casinolevant)/i;

// Genel bahis/kumar terimleri.
// NOT: bare "slot" ELENDI (slot-manager, sim-slot, time-slot gibi meşru altyapı domainleri
// yanlış-pozitif üretiyordu). Yalnız bahis-özgü biçimler: "slots", "slotlar", "casinoslot".
const BAHIS_TERIM = /bahis|casino|kumar|iddaa|rulet|slotlar|\bslots\b|casino ?slot|jackpot|freespin|free ?spin|sportsbook|betting|deneme ?bonus|bonus ?veren|canl[ıi] ?bahis|canl[ıi] ?casino/i;

// "...bet" ekli üretilmiş adlar (betturkey, superbet123) — ama meşru İngilizce kelimeleri hariç.
const BET_SONEK = /^[a-z]{3,}bet\d{0,4}$/;
const MESRU_BET = /^(alphabet|sherbet|tibet|beta|abet|corbet|colbert|cabinet|sunbet|nisbet)$/;

// Ayna/güncel-adres deseni: bahis siteleri engellenince "giriş / güncel adres" ekli
// rotasyon domainleri açar (betturkey-giris47, sahabet-guncel).
const AYNA = /(giris|giriş|guncel|güncel|yeni ?adres|adres\d|mobil|tr\d)/i;

// Türkiye-hedefli işaretler: TR bahis marka aileleri, Türkçe ayna deseni (…-tr-giris,
// guncel-adres), .tr uzantısı, Türkçe terimler. "Türkiye'den giriş yapılan" bahisi ayırır.
const TR_MARKA = /bet(turkey|boo|nano|park|tilt|ist|gram|matik|orspar|cio|sat|zula|puan|order|moon|kanyon|baba)|sahabet|tipobet|jojobet|holiganbet|mars?bahis|sekabet|pinbahis|bahsegel|s[üu]perbahis|casino ?maxi|mobilbahis|matadorbet|restbet|dinamobet|betmatik|nakitbahis|imajbet|onwin|pusulabet|betwoon|artemisbet|grand ?pasha|pashagaming|betgaranti|jetbahis|hovarda|betpas|milanobet|piabella|bettilt|slotio|casibom|wonodds|red ?win|favori(sen|bahis)?|bahisnow|asyabahis|tarafbet|extrabet|gorabet|galabet|ligobet|tulipbet|corlobet|betwild|starzbet|paribahis|bets10|youwin|bycasino|casinolevant/i;
const TR_AYNA = /(-tr-|tr-giris|trgiris|guncel|güncel|guncelgiris|hizli|hızlı|giris\d|tr\d{1,3}(\b|[-.]))/i;
const TR_TERIM = /bahis|iddaa|canl[ıi]bahis|deneme ?bonus|guncel ?adres|güncel ?adres/i;

export type BahisImza = { bahisMi: boolean; guven: number; isaretler: string[]; trHedefli: boolean; marka: string | null };

export function bahisImzasi(domain: string): BahisImza {
  const d = String(domain || "").toLowerCase().replace(/^www\./, "").trim();
  if (!d || !d.includes(".")) return { bahisMi: false, guven: 0, isaretler: [], trHedefli: false, marka: null };
  const etiket = d.split(".")[0];
  const tld = d.split(".").pop() || "";
  const isaretler: string[] = [];
  let guven = 0;
  let marka: string | null = null;

  const markaM = d.match(BET_MARKA);
  if (markaM) { guven = Math.max(guven, 90); marka = markaM[0].replace(/\s+/g, ""); isaretler.push(`bilinen bahis markası: ${markaM[0]}`); }

  if (BAHIS_TERIM.test(d)) { guven = Math.max(guven, 72); isaretler.push("bahis/kumar terimi (bahis/casino/slot…)"); }

  if (BET_SONEK.test(etiket) && !MESRU_BET.test(etiket)) { guven = Math.max(guven, 62); isaretler.push(`"...bet" ekli üretilmiş ad: ${etiket}`); }

  // İmza zaten varsa: ayna deseni + riskli TLD güveni pekiştirir (tek başına bahis işareti değil).
  if (guven > 0) {
    if (AYNA.test(d)) { guven = Math.min(98, guven + 6); isaretler.push("ayna/güncel-adres deseni (rotasyon)"); }
    if (RISKLI_TLD.includes(tld)) { guven = Math.min(98, guven + 5); isaretler.push(`riskli uzantı .${tld}`); }
  }

  // Türkiye-hedefli mi? (yalnız bahis imzası varken anlamlı)
  let trHedefli = false;
  if (guven > 0) {
    if (TR_MARKA.test(d)) { trHedefli = true; isaretler.push("Türkiye'ye özgü bahis markası"); }
    else if (tld === "tr" || d.endsWith(".com.tr")) { trHedefli = true; isaretler.push(".tr uzantısı"); }
    else if (TR_AYNA.test(d)) { trHedefli = true; isaretler.push("Türkçe ayna/güncel-giriş deseni"); }
    else if (TR_TERIM.test(d)) { trHedefli = true; isaretler.push("Türkçe bahis terimi"); }
    if (trHedefli) guven = Math.min(98, guven + 4);
  }

  return { bahisMi: guven >= 60, guven, isaretler, trHedefli, marka };
}

// Ucuz ön-filtre (CT akışı için) — pahalı imza hesabından önce hızlı eleme.
export function bahisOnFiltre(domain: string): boolean {
  return /bet|bahis|casino|kumar|slot|rulet|iddaa|poker|jackpot|spin/i.test(domain);
}
