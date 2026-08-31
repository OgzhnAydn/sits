// Kripto cüzdan analizi — ücretsiz, anahtarsız blockchain gezginleri.
// Dolandırıcının "para topla-kaç" cüzdanı geçmişinden ele verir: yeni cüzdan,
// gelen fonların hızla boşaltılması, hiç işlem görmemiş adres vb.
import type { OsintRapor } from "./osint";

export type KriptoTur = "eth" | "btc" | "tron" | null;

// Adresten zinciri tespit et.
export function kriptoTur(adres: string): KriptoTur {
  const a = adres.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(a)) return "eth"; // ETH + tüm EVM (BNB, Polygon…)
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return "tron";
  if (/^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a)) return "btc";
  return null;
}

const TUR_ADI: Record<string, string> = { eth: "Ethereum / EVM", btc: "Bitcoin", tron: "Tron (TRC)" };

async function jget(url: string, ms = 8000): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", accept: "application/json" },
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function kriptoOsint(adres: string): Promise<OsintRapor> {
  const tur = kriptoTur(adres);
  const r: OsintRapor = { tip: "kripto", deger: adres, alanlar: [], bulgular: [], risk: 0 };
  if (!tur) {
    r.alanlar.push({ ad: "Biçim", deger: "Tanınmayan kripto adresi" });
    r.bulgular.push("Bu bir geçerli kripto cüzdan adresine benzemiyor.");
    return r;
  }
  r.alanlar.push({ ad: "Ağ", deger: TUR_ADI[tur] });

  // Kripto ödemesi geri alınamaz — en kritik vatandaş uyarısı.
  r.bulgular.push("Kripto ödemeleri GERİ ALINAMAZ. Gönderdikten sonra iade, itiraz veya banka desteği yoktur — bu yüzden dolandırıcıların favorisidir.");

  if (tur === "eth") {
    const [det, say] = await Promise.all([
      jget(`https://eth.blockscout.com/api/v2/addresses/${adres}`),
      jget(`https://eth.blockscout.com/api/v2/addresses/${adres}/counters`),
    ]);
    const kontrat = det?.is_contract === true;
    const isim = (det?.name as string) || null;
    const bakiyeWei = Number(det?.coin_balance || 0);
    const txSay = Number(say?.transactions_count || 0);
    const tokenSay = Number(say?.token_transfers_count || 0);

    if (kontrat) {
      r.alanlar.push({ ad: "Adres tipi", deger: isim ? `Token/kontrat: ${isim}` : "Akıllı kontrat (kişisel cüzdan değil)" });
    } else {
      r.alanlar.push({ ad: "Adres tipi", deger: "Kişisel cüzdan" });
    }
    r.alanlar.push({ ad: "İşlem sayısı", deger: String(txSay + tokenSay) });
    r.alanlar.push({ ad: "Bakiye", deger: `${(bakiyeWei / 1e18).toFixed(4)} ETH` });
    kriptoSinyal(r, txSay + tokenSay, null, null);
  } else if (tur === "btc") {
    const d = await jget(`https://blockchain.info/rawaddr/${adres}?limit=1`);
    if (d) {
      const nTx = Number(d.n_tx || 0);
      const alinan = Number(d.total_received || 0) / 1e8;
      const bakiye = Number(d.final_balance || 0) / 1e8;
      r.alanlar.push({ ad: "İşlem sayısı", deger: String(nTx) });
      r.alanlar.push({ ad: "Toplam alınan", deger: `${alinan.toFixed(4)} BTC` });
      r.alanlar.push({ ad: "Bakiye", deger: `${bakiye.toFixed(4)} BTC` });
      kriptoSinyal(r, nTx, alinan, bakiye);
    } else {
      r.bulgular.push("Blockchain kaydı okunamadı (adres yeni ya da servis geçici erişilemez olabilir).");
    }
  } else {
    // TRON: ücretsiz anahtarsız güvenilir uç sınırlı; şimdilik biçim + uyarı.
    r.alanlar.push({ ad: "Adres tipi", deger: "Tron cüzdanı (USDT-TRC sık kullanılır)" });
    r.bulgular.push("Tron/USDT adresleri dolandırıcılıkta çok yaygındır; gönderen kişiyi bağımsız doğrulamadan ödeme yapma.");
  }
  return r;
}

// İşlem geçmişinden risk sinyalleri (kanıt değil, örüntü).
function kriptoSinyal(r: OsintRapor, txSay: number, alinan: number | null, bakiye: number | null) {
  if (txSay === 0) {
    r.risk += 10;
    r.bulgular.push("Bu cüzdan hiç işlem görmemiş — yepyeni. Meşru bir satıcının cüzdanı genelde geçmişlidir.");
    return;
  }
  // BTC: çok fon almış ama bakiyesi neredeyse sıfır → 'topla ve taşı' örüntüsü.
  if (alinan !== null && bakiye !== null && alinan > 0) {
    const kalanOran = bakiye / alinan;
    if (alinan >= 0.01 && kalanOran < 0.03 && txSay >= 4) {
      r.risk += 18;
      r.bulgular.push("Cüzdana gelen paralar neredeyse anında başka adreslere aktarılmış — dolandırıcı 'toplama cüzdanlarında' tipik bir örüntü.");
    }
  }
}
