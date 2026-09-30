// SİTE DERİN SINIFLANDIRMA — domainden DEĞİL, İÇERİK + GÖRSEL'den karar verir. Farkımız bu:
// herkes domain adına bakar; biz siteyi bir VATANDAŞ gibi ziyaret edip (fetch) içeriğini okur,
// ekran görüntüsünü Gemini Vision ile "gözle" değerlendiririz.
//   iceriktenSinifla → HTML içeriğinden: dil (Türkçe mi), site tipi, alışveriş sinyali.
//   gorselSinifla    → urlscan ekran görüntüsü + Gemini Vision: "Türkçe alışveriş sitesi mi?"
import { geminiGorselJson, geminiVarMi } from "./gemini";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36", "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.6" };

// ── İÇERİK SINIFLANDIRMA (domainden bağımsız) ────────────────────────────────────
export type IcerikSinif = {
  ulasildi: boolean;
  turkce: boolean;          // içerik Türkçe mi (dil işaretlerinden)
  tip: string;              // e-ticaret | kurumsal | blog/haber | park/satılık | bilinmiyor
  alisveris: boolean;       // sepet/ürün/ödeme işareti
  baslik: string;
  isaretler: string[];
};

const TR_DIL = /(\b(ve|için|ile|bu|bir|olan|göre|sayfa|iletişim|hakkımızda|ürünler|sepet|kategori|giriş|üye ol|kargo|teslimat|iade|ödeme|taksit|indirim|kampanya|fiyat|adet|beden|renk|stok)\b)|[şğıçöü]|lang=["']tr/i;
const ALISVERIS = /sepete ekle|sepetim|sepete at|satın al|hemen al|ürün(ü|ler)?|favorilere|stok kodu|beden se[çc]|renk se[çc]|kap[ıi]da [öo]deme|[üu]cretsiz kargo|taksit|add.to.cart|product|checkout|shopify|woocommerce|ticimax|ideasoft/i;
const KURUMSAL = /hakkımızda|kurumsal|referanslar|hizmetlerimiz|iletişim|about us|our services|corporate/i;
const PARK = /domain (for sale|is for sale|park)|bu alan adı satılık|sahibinden satılık alan|parkingcrew|sedoparking|buy this domain|godaddy.*lander/i;
const BLOG = /yorum yap|kategori:.*(makale|haber|blog)|okuma süresi|yazar:|posted (on|by)|read more/i;

export async function iceriktenSinifla(domain: string): Promise<IcerikSinif> {
  const bos = (t: string, m: string): IcerikSinif => ({ ulasildi: false, turkce: false, tip: t, alisveris: false, baslik: "", isaretler: [m] });
  let html = "";
  try {
    for (const url of [`https://${domain}/`, `http://${domain}/`]) {
      try {
        const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(7000) });
        html = (await r.text()).slice(0, 120_000);
        if (html) break;
      } catch { /* diğer şemayı dene */ }
    }
  } catch { /* */ }
  if (!html) return bos("bilinmiyor", "İçeriğe ulaşılamadı (zaman aşımı / erişim yok).");

  const baslik = (html.match(/<title[^>]*>([^<]{0,160})/i)?.[1] || "").trim();
  const turkce = TR_DIL.test(html);
  const isaret: string[] = [];
  let tip = "bilinmiyor", alisveris = false;
  if (PARK.test(html)) { tip = "park/satılık"; isaret.push("Park/satılık sayfası"); }
  else if (ALISVERIS.test(html)) { tip = "e-ticaret"; alisveris = true; isaret.push("Alışveriş içeriği (sepet/ürün/ödeme)"); }
  else if (BLOG.test(html)) { tip = "blog/haber"; isaret.push("Blog/haber içeriği"); }
  else if (KURUMSAL.test(html)) { tip = "kurumsal"; isaret.push("Kurumsal tanıtım içeriği"); }
  if (turkce) isaret.push("İçerik Türkçe");
  return { ulasildi: true, turkce, tip, alisveris, baslik: baslik.slice(0, 120), isaretler: isaret };
}

// ── GÖRSEL SINIFLANDIRMA (ekran görüntüsü + Gemini Vision) ────────────────────────
export type GorselSinif = {
  yapildi: boolean;
  alisveris: boolean | null;   // görüntüde bir alışveriş/e-ticaret sitesi mi
  turkce: boolean | null;      // görüntüdeki metin Türkçe mi
  kategori: string;            // giyim | elektronik | kozmetik | gıda | mobilya | genel | -
  satilan: string;             // kısa: "kadın giyim", "cep telefonu aksesuar" vb.
  guven: number;               // 0-100 görsel güven
  not: string;                 // tek cümle özet
  ekranUrl?: string;
  hata?: string;
};

async function urlscanEkran(domain: string, tetikle = false): Promise<string | null> {
  const key = process.env.URLSCAN_KEY;
  // 1) Mevcut tarama var mı? — anında ekran görüntüsü.
  try {
    const s = (await (await fetch(`https://urlscan.io/api/v1/search/?q=page.domain:%22${encodeURIComponent(domain)}%22&size=1`, { headers: key ? { "API-Key": key } : UA, signal: AbortSignal.timeout(8000) })).json()) as { results?: { screenshot?: string; _id?: string }[] };
    const r = s.results?.[0];
    if (r?.screenshot) return r.screenshot;
    if (r?._id) return `https://urlscan.io/screenshots/${r._id}.png`;
  } catch { /* */ }
  // 2) Yoksa ve tetikle=true ise: TAZE tarama başlat (siteyi VATANDAŞ gibi ziyaret et) → sonucu bekle.
  if (!tetikle || !key) return null;
  try {
    const r = await fetch("https://urlscan.io/api/v1/scan/", {
      method: "POST", headers: { "API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ url: `http://${domain}`, visibility: "unlisted" }),
      signal: AbortSignal.timeout(9000),
    });
    const j = (await r.json()) as { uuid?: string };
    if (!j.uuid) return null;
    // Sonucu poll et (~24sn bütçe). Tarama tamamlanınca screenshot hazır olur.
    for (let i = 0; i < 8; i++) {
      await new Promise((z) => setTimeout(z, 3000));
      try {
        const res = await fetch(`https://urlscan.io/api/v1/result/${j.uuid}/`, { headers: { "API-Key": key }, signal: AbortSignal.timeout(7000) });
        if (res.status === 404) continue; // henüz hazır değil
        const rj = (await res.json()) as { task?: { screenshotURL?: string } };
        if (rj.task?.screenshotURL) return rj.task.screenshotURL;
      } catch { /* devam */ }
    }
  } catch { /* tetikleme başarısız */ }
  return null;
}

const VIZYON_SYS =
  "Sen bir e-ticaret denetim asistanısın. Sana bir web sitesinin EKRAN GÖRÜNTÜSÜ verilir. " +
  "Yalnız GÖRÜNTÜDE gördüklerine dayan (tahmin/uydurma yok). JSON döndür: " +
  "{alisveris:boolean, turkce:boolean, kategori:string, satilan:string, guven:number, not:string}. " +
  "alisveris = sayfa bir ONLINE ALIŞVERİŞ/E-TİCARET sitesi mi (ürün vitrini, fiyat, sepet, 'satın al'). " +
  "turkce = görünen metin Türkçe mi. kategori = giyim/elektronik/kozmetik/gıda/mobilya/ayakkabı/aksesuar/genel/yok. " +
  "satilan = ne sattığı (en çok 4 kelime, Türkçe). guven = 0-100. not = tek cümle Türkçe özet. Türkçe yaz.";

export async function gorselSinifla(domain: string, tetikle = false): Promise<GorselSinif> {
  const bos = (h: string): GorselSinif => ({ yapildi: false, alisveris: null, turkce: null, kategori: "-", satilan: "", guven: 0, not: h, hata: h });
  if (!geminiVarMi) return bos("Görsel analiz için Gemini anahtarı tanımlı değil.");
  const ekranUrl = await urlscanEkran(domain, tetikle);
  if (!ekranUrl) return bos("Ekran görüntüsü alınamadı (tarama tetiklenemedi / zaman aşımı).");
  let b64 = "";
  try {
    const img = await fetch(ekranUrl, { signal: AbortSignal.timeout(9000) });
    if (!img.ok) return bos("Ekran görüntüsü indirilemedi.");
    b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
  } catch { return bos("Ekran görüntüsü indirilemedi (zaman aşımı)."); }

  const j = await geminiGorselJson<{ alisveris?: boolean; turkce?: boolean; kategori?: string; satilan?: string; guven?: number; not?: string }>(
    VIZYON_SYS, `Bu ${domain} adresinin ekran görüntüsüdür. Görüntüye bakarak sınıflandır.`, b64, "image/png",
  );
  if (!j) return bos("Görsel model yanıt vermedi.");
  return {
    yapildi: true,
    alisveris: j.alisveris ?? null,
    turkce: j.turkce ?? null,
    kategori: (j.kategori || "-").slice(0, 24),
    satilan: (j.satilan || "").slice(0, 48),
    guven: Math.max(0, Math.min(100, Math.round(Number(j.guven) || 0))),
    not: (j.not || "").slice(0, 160),
    ekranUrl,
  };
}
