import path from "path";
import fs from "fs";

// ── Yasa Dışı Bahis · Tespit Listesi (MirLeon/NAZAR) ──────────────────────────────
// Yalnız GERÇEK yakalanan, TR-hedefli, yüksek-güvenli kayıtlar. Her domain tıklanabilir link.
//
// NOT (neden @react-pdf/renderer DEĞİL): React renderer'ın yoga-layout motoru on binlerce
// satırda karesel yavaşlar (5.000 satır ≈ 106sn, ~1.7GB). Bu liste ~22.000 satır olabildiğinden
// düşük seviyeli @react-pdf/pdfkit writer'ı ile İMPERATİF çiziyoruz (22.000 satır ≈ 18sn, ~0.7GB).
// Böylece TESPİT EDİLEN TÜM adresler tek dosyaya yazılabiliyor — hiçbirini eksik bırakmadan.

export type BahisSatir = { domain: string; marka?: string | null; guven: number; usomda?: boolean | null; engelli?: boolean | null; zaman: number };
export type BahisListeVeri = { tarih: string; refNo: string; guvenEsik: number; toplam: number; bizOnce: number; liste: BahisSatir[] };

const KOYU = "#0e2038", LACIVERT = "#1d2f49", TEAL = "#159aa1", ALTIN = "#c6a24a", TBAS = "#2b3f59", GRI = "#6a7583", CIZGI = "#e3e8ef", ACIK = "#f5f8fa", KIRMIZI = "#c62a1f", YESIL = "#2e7d55";

const PW = 595.28, PH = 841.89, L = 34, R = 561;
const zmn = (t: number) => (t ? new Date(t).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const trSayi = (n: number) => n.toLocaleString("tr-TR");
const fontYol = (p: string) => path.join(process.cwd(), "assets/fonts", p);

// Sütun düzeni (tablo) — govde içi, tıklanabilir alan adı en geniş sütun.
const COL = {
  no: { x: 40, w: 26, hiza: "left" as const },
  dom: { x: 68, w: 232, hiza: "left" as const },
  mar: { x: 302, w: 86, hiza: "left" as const },
  guv: { x: 390, w: 40, hiza: "center" as const },
  usom: { x: 432, w: 78, hiza: "left" as const },
  zam: { x: 512, w: 45, hiza: "right" as const },
};

type Doc = {
  addPage: (o?: Record<string, unknown>) => Doc; registerFont: (n: string, b: Buffer) => Doc;
  font: (n: string) => Doc; fontSize: (n: number) => Doc; fillColor: (c: string, o?: number) => Doc;
  strokeColor: (c: string) => Doc; lineWidth: (n: number) => Doc;
  text: (t: string, x?: number, y?: number, o?: Record<string, unknown>) => Doc;
  rect: (x: number, y: number, w: number, h: number) => Doc; circle: (x: number, y: number, r: number) => Doc;
  path: (d: string) => Doc; moveTo: (x: number, y: number) => Doc; lineTo: (x: number, y: number) => Doc;
  fill: (c?: string) => Doc; stroke: (c?: string) => Doc; save: () => Doc; restore: () => Doc; translate: (x: number, y: number) => Doc; scale: (n: number) => Doc;
  switchToPage: (i: number) => void; bufferedPageRange: () => { start: number; count: number };
  on: (e: string, cb: (c?: Buffer) => void) => void; end: () => void; widthOfString: (s: string) => number;
};
type YazOpt = { w?: number; hiza?: "left" | "center" | "right"; link?: string; renk?: string; font?: string; boy?: number };
type YazFn = (t: string, x: number, y: number, o?: YazOpt) => void;

export async function bahisListePdf(v: BahisListeVeri): Promise<Buffer> {
  const mod = await import("@react-pdf/pdfkit");
  const PDFDocument = (mod as { default: new (o?: Record<string, unknown>) => Doc }).default || (mod as unknown as new (o?: Record<string, unknown>) => Doc);
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, autoFirstPage: false });

  const parcalar: Buffer[] = [];
  doc.on("data", (c) => c && parcalar.push(c));
  const bitti = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(parcalar))));

  doc.registerFont("T", fs.readFileSync(fontYol("Tinos-Regular.ttf")));
  doc.registerFont("TB", fs.readFileSync(fontYol("Tinos-Bold.ttf")));
  doc.registerFont("TI", fs.readFileSync(fontYol("Tinos-Italic.ttf")));

  // Durum takibi: aynı font/boy/renk'i tekrar tekrar set etme (22k×6 hücrede büyük kazanç).
  let sonFont = "", sonBoy = 0, sonRenk = "";
  const yaz: YazFn = (t, x, y, o = {}) => {
    if (o.font && o.font !== sonFont) { doc.font(o.font); sonFont = o.font; }
    if (o.boy && o.boy !== sonBoy) { doc.fontSize(o.boy); sonBoy = o.boy; }
    if (o.renk && o.renk !== sonRenk) { doc.fillColor(o.renk); sonRenk = o.renk; }
    const opts: Record<string, unknown> = { lineBreak: false };
    if (o.w) { opts.width = o.w; opts.align = o.hiza || "left"; }
    if (o.link) { opts.link = o.link; opts.underline = false; }
    doc.text(t, x, y, opts);
  };
  // addPage grafik durumunu (font/renk) sıfırlar, rect().fill() de fillColor'ı bozar →
  // izleyen yaz çağrıları font/boy/renk'i YENİDEN set etsin diye takipçiyi sıfırla.
  const durumSifirla = () => { sonFont = ""; sonBoy = 0; sonRenk = ""; };

  // ── KAPAK ─────────────────────────────────────────────────────────────────────
  doc.addPage({ size: "A4", margin: 0 });
  durumSifirla();
  doc.rect(0, 0, PW, PH).fill(KOYU);
  [210, 330, 460, 600].forEach((d, i) => { doc.lineWidth(1).strokeColor(i < 2 ? "#22456b" : "#1a3350").circle(PW - 70, 250, d / 2).stroke(); });
  yaz("MİRLEON", 44, 46, { font: "TB", boy: 17, renk: "#ffffff" });
  yaz("NAZAR", 44 + doc.widthOfString("MİRLEON") + 12, 46, { font: "TB", boy: 17, renk: "#cfe0ef" });
  yaz("YASA DIŞI BAHİS RADARI", 44, 70, { font: "T", boy: 8, renk: "#7d93b3" });
  // GİZLİ rozet (sağ üst)
  doc.lineWidth(1).strokeColor(ALTIN).rect(PW - 44 - 96, 42, 96, 20).stroke();
  yaz("GİZLİ · KURUM İÇİ", PW - 44 - 96, 48, { w: 96, hiza: "center", font: "TB", boy: 8.5, renk: ALTIN });
  // Kalkan amblem (SVG path, 140px @ x~ sağ)
  doc.save(); doc.translate(PW - 44 - 140, 96); doc.scale(1.4);
  doc.lineWidth(3).strokeColor("#ffffff").path("M50 8 L82 20 L82 46 C82 68 68 84 50 92 C32 84 18 68 18 46 L18 20 Z").stroke();
  doc.lineWidth(3.4).strokeColor("#e0553f").path("M35 42 L50 58 L65 42 M50 58 L50 72").stroke();
  doc.fillColor("#e0553f").circle(50, 34, 4).fill();
  doc.restore();
  // Başlık bloğu
  yaz("TÜRKİYE HEDEFLİ · CANLI YAKALANAN", 44, 300, { font: "T", boy: 9.5, renk: ALTIN });
  yaz("Yasa Dışı Bahis", 44, 316, { font: "TB", boy: 30, renk: "#ffffff" });
  yaz("Tespit Listesi", 44, 352, { font: "TI", boy: 30, renk: "#ffffff" });
  yaz(`${trSayi(v.toplam)} adres · güven ≥ %${v.guvenEsik}`, 44, 398, { font: "T", boy: 12, renk: "#9fb4d8" });
  // Alt referans şeridi
  doc.lineWidth(1).strokeColor("#26456a").moveTo(44, PH - 90).lineTo(PW - 44, PH - 90).stroke();
  yaz("REFERANS", 44, PH - 78, { font: "T", boy: 7.5, renk: "#7d93b3" });
  yaz(v.refNo, 44, PH - 64, { font: "TB", boy: 11, renk: "#ffffff" });
  doc.rect(PW / 2 - 20, PH - 80, 1, 26).fill("#26456a");
  yaz("DOĞRULAMA TARİHİ", PW / 2 + 10, PH - 78, { font: "T", boy: 7.5, renk: "#7d93b3" });
  yaz(v.tarih, PW / 2 + 10, PH - 64, { font: "TB", boy: 11, renk: "#ffffff" });
  doc.rect(0, PH - 6, PW, 6).fill(TEAL);

  // ── ÖZET + YÖNTEM ───────────────────────────────────────────────────────────────
  doc.addPage({ size: "A4", margin: 0 });
  durumSifirla();
  antet(doc, yaz);
  let y = 66;
  yaz("Kapsam ve Yöntem", L, y, { font: "TB", boy: 14, renk: LACIVERT }); y += 20;
  doc.rect(L, y, 60, 2).fill(TEAL); durumSifirla(); y += 12;
  y = paragraf(doc, `Bu liste, Certificate Transparency akışından canlı yakalanan, Türkiye kullanıcısını hedefleyen ve güven skoru %${v.guvenEsik} ve üzeri olan yasa dışı bahis/kumar adreslerini içerir. Türkiye'de bahis/kumar devlet tekelindedir; listedeki adresler bu tekelin dışındadır.`, L, y, R - L, 10, 1.5, "#26324a");
  durumSifirla(); y += 8;
  // 3 KPI kutusu
  const kpiW = (R - L - 20) / 3;
  const kpi = (i: number, buyuk: string, kucuk: string, renk: string) => {
    const x = L + i * (kpiW + 10);
    doc.lineWidth(1).strokeColor(CIZGI).rect(x, y, kpiW, 52).stroke();
    durumSifirla();
    yaz(buyuk, x + 10, y + 10, { font: "TB", boy: 20, renk });
    yaz(kucuk, x + 10, y + 36, { font: "T", boy: 8, renk: GRI, w: kpiW - 20 });
  };
  kpi(0, trSayi(v.toplam), "Türkiye hedefli adres", KIRMIZI);
  kpi(1, trSayi(v.bizOnce), "USOM'da yok · biz-önce", YESIL);
  kpi(2, `≥%${v.guvenEsik}`, "güven eşiği", TEAL);
  y += 62;
  // Dürüst çerçeve kutusu
  doc.fillColor("#fff8f0").rect(L, y, R - L, 96).fill();
  doc.rect(L, y, 3, 96).fill(ALTIN);
  durumSifirla();
  let yy = y + 10;
  yaz("Durum sütunları hakkında — dürüst çerçeve", L + 12, yy, { font: "TB", boy: 9.5, renk: LACIVERT }); yy += 15;
  yy = paragraf(doc, "USOM: \"biz-önce\" = adres USOM resmî listesinde yok, bu sistem önce yakaladı — USOM'a bildirilebilecek yeni tespit. \"USOM'da\" = zaten kayıtlı.", L + 12, yy, R - L - 24, 8.6, 1.45, "#33405c") + 3;
  yy = paragraf(doc, "BTK engeli bu listede gösterilmez: sistem yurtdışı sunucularda çalışır; Türkiye'nin BTK/ISP-DNS engelleri yurtdışından güvenilir görülemez. Bir adresin Türkiye'de engelli olup olmadığı ancak Türkiye içinden sorgu ile kesinleşir.", L + 12, yy, R - L - 24, 8.6, 1.45, "#33405c");
  durumSifirla(); y += 106;
  paragraf(doc, `Güven skoru otomatik ön-değerlendirmedir; %${v.guvenEsik}+ eşiği yanlış pozitifi asgariye indirir ama her satır resmî işlem öncesi teyit edilmelidir. Her alan adı tıklanabilir bağlantıdır (yalnız güvenli ortamda açın).`, L, y, R - L, 8.4, 1.45, GRI);
  durumSifirla();

  // ── LİSTE (bulk) ─────────────────────────────────────────────────────────────────
  const satirH = 12.6, altSinir = PH - 42;
  let ilkTablo = true;
  const tabloBaslik = () => {
    doc.addPage({ size: "A4", margin: 0 });
    durumSifirla();
    antet(doc, yaz);
    let ty = 52;
    if (ilkTablo) {
      yaz(`Tespit Edilen Adresler (${trSayi(v.liste.length)})`, L, 50, { font: "TB", boy: 14, renk: LACIVERT });
      ty = 74; ilkTablo = false;
    }
    doc.fillColor(TBAS).rect(L, ty, R - L, 14).fill();
    durumSifirla();
    yaz("#", COL.no.x, ty + 4, { font: "TB", boy: 7.4, renk: "#dbe6f0" });
    yaz("Alan adı (bağlantı)", COL.dom.x, ty + 4, { font: "TB", boy: 7.4, renk: "#dbe6f0" });
    yaz("Marka", COL.mar.x, ty + 4, { font: "TB", boy: 7.4, renk: "#dbe6f0" });
    yaz("Güven", COL.guv.x, ty + 4, { font: "TB", boy: 7.4, renk: "#dbe6f0", w: COL.guv.w, hiza: "center" });
    yaz("USOM", COL.usom.x, ty + 4, { font: "TB", boy: 7.4, renk: "#dbe6f0" });
    yaz("İlk görülme", COL.zam.x, ty + 4, { font: "TB", boy: 7.4, renk: "#dbe6f0", w: COL.zam.w, hiza: "right" });
    return ty + 18;
  };
  let ry = tabloBaslik();
  for (let i = 0; i < v.liste.length; i++) {
    if (ry + satirH > altSinir) ry = tabloBaslik();
    const s = v.liste[i];
    if (i % 2) { doc.fillColor(ACIK).rect(L, ry - 2, R - L, satirH).fill(); durumSifirla(); }
    yaz(String(i + 1), COL.no.x, ry, { font: "T", boy: 7.6, renk: GRI });
    yaz(s.domain, COL.dom.x, ry, { font: "T", boy: 7.6, renk: "#1a5fb4", w: COL.dom.w, link: `https://${s.domain}` });
    yaz(s.marka || "—", COL.mar.x, ry, { font: "T", boy: 7.6, renk: "#26324a", w: COL.mar.w });
    yaz(`%${s.guven}`, COL.guv.x, ry, { font: "TB", boy: 7.6, renk: KIRMIZI, w: COL.guv.w, hiza: "center" });
    const uMetin = s.usomda === false ? "yok · biz-önce" : s.usomda === true ? "kayıtlı" : "bilinmiyor";
    const uRenk = s.usomda === false ? YESIL : s.usomda === true ? GRI : "#8a97a5";
    yaz(uMetin, COL.usom.x, ry, { font: "T", boy: 7.2, renk: uRenk, w: COL.usom.w });
    yaz(zmn(s.zaman), COL.zam.x, ry, { font: "T", boy: 7.6, renk: GRI, w: COL.zam.w, hiza: "right" });
    ry += satirH;
  }
  if (ry + 20 < altSinir) yaz(`Liste sonu — ${trSayi(v.liste.length)} adres. Bulgular doğrulama anına (${v.tarih}) aittir; adres durumu zamanla değişebilir.`, L, ry + 8, { font: "TI", boy: 8, renk: GRI });

  // ── Footer'ları buffered sayfalara stampla (kapak hariç) ────────────────────────
  const aralik = doc.bufferedPageRange();
  for (let p = aralik.start; p < aralik.start + aralik.count; p++) {
    if (p === 0) continue; // kapak
    doc.switchToPage(p);
    durumSifirla();
    doc.lineWidth(1).strokeColor(CIZGI).moveTo(L, PH - 24).lineTo(R, PH - 24).stroke();
    yaz(`MirLeon AI · Yasa Dışı Bahis · ${v.refNo} · Gizli`, L, PH - 20, { font: "TI", boy: 7, renk: GRI });
    yaz(`Sayfa ${p + 1}`, R - 60, PH - 20, { font: "TI", boy: 7, renk: GRI, w: 60, hiza: "right" });
  }

  doc.end();
  return bitti;
}

// Üst antet (içerik sayfaları)
function antet(doc: Doc, yaz: YazFn) {
  yaz("MİRLEON", L, 20, { font: "TB", boy: 11, renk: LACIVERT });
  yaz("· Yasa Dışı Bahis Radarı", L + 58, 22.5, { font: "T", boy: 7.5, renk: GRI });
  yaz("TESPİT LİSTESİ · GİZLİ", R - 130, 22, { font: "TB", boy: 8, renk: KIRMIZI, w: 130, hiza: "right" });
  doc.lineWidth(1.2).strokeColor(LACIVERT).moveTo(L, 36).lineTo(R, 36).stroke();
}

// Basit sarma-metin (genişliğe göre satırlara böler) → alt y döner.
function paragraf(doc: Doc, metin: string, x: number, y: number, w: number, boy: number, satirAralik: number, renk: string): number {
  doc.font("T").fontSize(boy).fillColor(renk);
  const kelimeler = metin.split(" ");
  let satir = "", yy = y; const lh = boy * satirAralik;
  for (const k of kelimeler) {
    const dene = satir ? satir + " " + k : k;
    if (doc.widthOfString(dene) > w && satir) { doc.text(satir, x, yy, { lineBreak: false, width: w }); satir = k; yy += lh; }
    else satir = dene;
  }
  if (satir) { doc.text(satir, x, yy, { lineBreak: false, width: w }); yy += lh; }
  return yy;
}
