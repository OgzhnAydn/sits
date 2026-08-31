import { describe, it, expect } from "vitest";
import { ozelIp } from "../lib/osint";
import { gostergeCikar, siniflandir } from "../lib/analyze";
import { kriptoTur } from "../lib/kripto";
import { itibarliMi } from "../lib/itibarli";
import { markaTaklitBul } from "../lib/markaTaklit";
import { imzaCikar } from "../lib/kampanyaImza";

// Bu set, oturumda yaşadığımız GERÇEK regresyonları kalıcı yakalar:
// SSRF, haberturk/github/google yanlış-pozitifi, USOM substring, marka taklidi.

describe("SSRF — ozelIp iç/özel adresleri engeller", () => {
  const engelli = ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:10.0.0.1", "224.0.0.1"];
  const guvenli = ["8.8.8.8", "1.1.1.1", "45.79.222.138", "185.67.35.10"];
  it.each(engelli)("engeller: %s", (ip) => expect(ozelIp(ip)).toBe(true));
  it.each(guvenli)("izin verir: %s", (ip) => expect(ozelIp(ip)).toBe(false));
});

describe("gostergeCikar — varlık çıkarımı", () => {
  it("URL/IBAN/telefon/kripto ayıklar", () => {
    const g = gostergeCikar("Site https://kotu-site.com IBAN TR120001000000000000000001 ara 0532 123 45 67 kripto 0xdAC17F958D2ee523a2206206994597C13D831ec7");
    expect(g.url.some((u) => u.includes("kotu-site.com"))).toBe(true);
    expect(g.iban).toContain("TR120001000000000000000001");
    expect(g.telefon.length).toBe(1);
    expect(g.kripto).toContain("0xdAC17F958D2ee523a2206206994597C13D831ec7");
  });
  it("sabit hat + 0900 numarasını yakalar", () => {
    expect(gostergeCikar("0212 701 02 13").telefon).toContain("02127010213");
    expect(gostergeCikar("0900 123 45 67").telefon).toContain("09001234567");
  });
});

describe("kriptoTur — zincir tespiti", () => {
  it("doğru zinciri döndürür", () => {
    expect(kriptoTur("0xdAC17F958D2ee523a2206206994597C13D831ec7")).toBe("eth");
    expect(kriptoTur("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe("btc");
    expect(kriptoTur("merhaba")).toBe(null);
  });
});

describe("itibarliMi — meşru siteler korunur (yanlış-pozitif önleme)", () => {
  const itibarli = ["google.com", "github.com", "haberturk.com", "ziraatbank.com.tr", "akbank.com", "turkiye.gov.tr", "sub.metu.edu.tr"];
  const degil = ["ziraatbank-onlinesbi.ph", "akbank-dogrulama.com", "rastgele-tuzak-123.xyz"];
  it.each(itibarli)("itibarlı: %s", (d) => expect(itibarliMi(d)).toBe(true));
  it.each(degil)("itibarlı DEĞİL: %s", (d) => expect(itibarliMi(d)).toBe(false));
});

describe("markaTaklitBul — banka/kurum taklidi", () => {
  it("sahte banka domainini yakalar", () => {
    const r = markaTaklitBul("Akbank hesabiniz", ["https://akbank-dogrulama.com/giris"]);
    expect(r?.marka).toContain("Akbank");
  });
  it("resmî bankada yanlış alarm vermez", () => {
    expect(markaTaklitBul("Akbank", ["https://www.akbank.com"])).toBe(null);
  });
});

describe("imzaCikar — kampanya imzası domainden bağımsız", () => {
  it("farklı domain, aynı kalıp → aynı imza", () => {
    const a = imzaCikar("ISI PAYI OLCER daire son odeme", ["https://bayi.isipayolcer.com.tr/Bulut/G?x=VKRS"]);
    const b = imzaCikar("ISI PAYI OLCER daire son odeme", ["https://isipay-tahsilat.com/Bulut/G?x=QWER"]);
    expect(a.imza).not.toBeNull();
    expect(a.imza).toBe(b.imza);
  });
  it("temiz mesaj → imza yok", () => {
    expect(imzaCikar("merhaba nasilsin toplanti yarin", ["https://github.com/foo"]).imza).toBeNull();
  });
});

describe("siniflandir — kategori", () => {
  it("dolandırıcılık mesajını tanır", () => {
    const m = "Kargonuz gümrükte, ödeme yapın: https://kargo-takip.xyz linke tıklayın acil";
    const { kategori } = siniflandir(m, gostergeCikar(m));
    expect(kategori).toBe("dolandiricilik");
  });
});
