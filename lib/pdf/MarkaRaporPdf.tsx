import path from "path";
import React from "react";
import { Document, Page, Text, View, Image, Font, StyleSheet, Svg, Circle, Line, Path, Text as SvgText } from "@react-pdf/renderer";

const fontYol = (p: string) => path.join(process.cwd(), "assets/fonts", p);
// Times New Roman metrik-eşdeğeri (Tinos) — Türkçe tam destekli, ücretsiz gömülebilir.
Font.register({
  family: "Tinos",
  fonts: [
    { src: fontYol("Tinos-Regular.ttf") },
    { src: fontYol("Tinos-Bold.ttf"), fontWeight: "bold" },
    { src: fontYol("Tinos-Italic.ttf"), fontStyle: "italic" },
    { src: fontYol("Tinos-BoldItalic.ttf"), fontWeight: "bold", fontStyle: "italic" },
  ],
});
Font.registerHyphenationCallback((w) => [w]);

// ── Marka Koruma Bülteni — PREMIUM (NAZAR/Turkcell referans tasarımına sadık) ──────────
// Yalnız DEPOLANMIŞ/DOĞRULANMIŞ gerçek veri. Her cümle veriye dayanır (uydurma YOK).
export type RaporTespit = { domain: string; skor: number; durum?: string; seviye?: string; zaman: number; sinyaller?: string[]; screenshot?: string | null; usomda?: boolean | null; engelli?: boolean | null; etbis?: boolean | null; alanlar?: { ad: string; deger: string }[];
  // Hafif teknik envanter (canlilikProbe + ip-api) — tam liste tablosu için
  ip?: string; asn?: string; ulke?: string; ca?: string; altyapi?: string; canliDurum?: string };
export type MarkaRaporVeri = {
  markaAd: string;
  markaResmi?: string;         // resmî unvan/domain (kapak alt satırı)
  logoDataUri?: string | null;
  aralikEtiket: string;
  tarih: string;
  refNo: string;
  ozet: { toplam: number; aktif: number; park: number; canli: number; inceleme: number };
  erkenlik: { toplam: number; bizOnce: number; usomdaYok: number };
  oneCikan: RaporTespit[];
  digerleri: RaporTespit[];
};

// ── Renk paleti (referans) ──
const KOYU = "#0e2038";        // kapak lacivert
const LACIVERT = "#1d2f49";    // metin/başlık
const TEAL = "#159aa1";        // vurgu, bölüm başlığı, çizgi
const ALTIN = "#c6a24a";       // gizli rozet / resmî unvan
const TBAS = "#2b3f59";        // tablo başlık satırı
const GRI = "#6a7583";
const CIZGI = "#e3e8ef";
const ACIK = "#f5f8fa";
const KIRMIZI = "#c62a1f";
const TURUNCU = "#b25e09";
const YESIL = "#2e7d55";

const SEV = (d?: string): string =>
  d === "aktif-tuzak" ? KIRMIZI : d === "canli" ? TURUNCU : d === "park" ? "#5b7290" : d === "yayinda-degil" ? "#8a97a5" : "#6b7280";

// 7 kategorili sınıflandırma (referans lejant) — gerçek USOM/BTK + canlılık + küme verisinden.
const KATEGORILER: { ad: string; renk: string }[] = [
  { ad: "Şüpheli · izlemede", renk: "#c62a1f" },     // 0 aktif tuzak / canlı şüpheli
  { ad: "Kayıtlı · tehdit değil", renk: "#b25e09" }, // 1 park / düşük
  { ad: "Erişilemez", renk: "#a9b4c0" },             // 2 dead
  { ad: "Kara listede · pasif", renk: "#8a1c14" },   // 3 USOM/BTK
  { ad: "Meşru · doğrulandı", renk: "#2e7d55" },     // 4 resmî/itibarlı
  { ad: "Ayrı altyapı · küme", renk: "#5b7290" },    // 5 toplu-kayıt kümesi
  { ad: "Resmî altyapı", renk: "#274b73" },          // 6 marka kendi altyapısı
];
function tKategori(t: RaporTespit, kumeTld: string): number {
  if (t.usomda === true || t.engelli === true) return 3;
  if (t.canliDurum === "dead" || t.durum === "yayinda-degil") return 2;
  if (t.durum === "aktif-tuzak") return 0;
  if (kumeTld && t.domain.endsWith("." + kumeTld)) return 5;
  if (t.durum === "park" || t.canliDurum === "parked") return 1;
  if (t.durum === "canli") return 0;
  return 1;
}
const DURUM_AD: Record<string, string> = { "aktif-tuzak": "Aktif tuzak", "canli": "Canlı", "park": "Park · izlemede", "yayinda-degil": "Yayında değil" };
const zmn = (t: number) => (t ? new Date(t).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const alan = (t: RaporTespit, adBas: string) => (t.alanlar || []).find((f) => f.ad.startsWith(adBas))?.deger || "";
const canliDurumAd = (d?: string) => d === "live" ? "Canlı · içerik var" : d === "dead" ? "Erişilemez" : d === "parked" ? "Park sayfası" : d === "redirect" ? "Yönlendiriyor" : "—";

// Risk düzeyi (0-100) — gerçek dağılımdan: aktif tuzak ağır, canlı orta, park hafif.
function riskPuan(v: MarkaRaporVeri): number {
  const o = v.ozet;
  if (o.toplam === 0) return 6;
  const p = o.aktif * 34 + o.canli * 10 + o.park * 1.5;
  return Math.max(6, Math.min(96, Math.round(p / Math.max(1, o.toplam) * 6 + o.aktif * 12)));
}
function riskEtiket(p: number): string {
  return p < 20 ? "DÜŞÜK" : p < 40 ? "DÜŞÜK–ORTA" : p < 60 ? "ORTA" : p < 80 ? "ORTA–YÜKSEK" : "YÜKSEK";
}

const st = StyleSheet.create({
  page: { paddingBottom: 46, paddingTop: 54, fontFamily: "Tinos", fontSize: 10.5, color: LACIVERT, lineHeight: 1.4 },
  govde: { paddingHorizontal: 40 },
  // Antet / footer
  antet: { position: "absolute", top: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomColor: LACIVERT, borderBottomWidth: 1.4, paddingBottom: 6 },
  antetSol: { flexDirection: "row", alignItems: "center", gap: 5 },
  antetLogo: { fontSize: 12, fontWeight: "bold", color: LACIVERT, letterSpacing: 1 },
  antetAlt: { fontSize: 8, color: GRI },
  antetSag: { fontSize: 8.5, fontWeight: "bold", color: LACIVERT, letterSpacing: 1 },
  footer: { position: "absolute", bottom: 18, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopColor: CIZGI, borderTopWidth: 1, paddingTop: 5 },
  fMini: { fontSize: 7.6, color: GRI, fontStyle: "italic" },
  // Bölüm başlığı
  bolum: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 18, marginBottom: 4 },
  bolumIkon: { width: 15, height: 15, borderRadius: 3, backgroundColor: TEAL, alignItems: "center", justifyContent: "center" },
  bolumBaslik: { fontSize: 14, fontWeight: "bold", color: LACIVERT },
  bolumCizgi: { height: 2, backgroundColor: TEAL, marginBottom: 10, marginTop: 2 },
  p: { fontSize: 10.5, lineHeight: 1.5, color: "#26324a", marginBottom: 5 },
  madde: { flexDirection: "row", gap: 6, marginBottom: 4, paddingRight: 6 },
  maddeIsaret: { fontSize: 10.5, color: TEAL },
  maddeMetin: { fontSize: 10.5, lineHeight: 1.45, color: "#26324a", flex: 1 },
  guclu: { fontWeight: "bold", color: LACIVERT },
  sekilAlt: { fontSize: 8.5, color: GRI, fontStyle: "italic", textAlign: "center", marginTop: 3 },
  // Tablo
  tHead: { flexDirection: "row", backgroundColor: TBAS, paddingVertical: 5, paddingHorizontal: 7 },
  tRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 7, borderBottomColor: CIZGI, borderBottomWidth: 1, alignItems: "flex-start" },
  tRowAlt: { backgroundColor: ACIK },
  th: { fontSize: 8, fontWeight: "bold", color: "#dbe6f0" },
  td: { fontSize: 8.4, color: "#26324a" },
  rozet: { fontSize: 7.4, color: "#fff", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, alignSelf: "flex-start", fontWeight: "medium" },
  cip: { fontSize: 8, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, alignSelf: "flex-start" },
  cipSira: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, marginBottom: 3 },
  // Öne çıkan kart
  kart: { borderColor: CIZGI, borderWidth: 1, borderRadius: 6, marginBottom: 11, overflow: "hidden" },
  kartUst: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 11, paddingVertical: 7, backgroundColor: ACIK, borderBottomColor: CIZGI, borderBottomWidth: 1 },
  kartDom: { fontSize: 10.5, fontWeight: "bold", color: LACIVERT },
  kartGovde: { flexDirection: "row", gap: 11, padding: 11 },
  ss: { width: 190, height: 118, objectFit: "cover", objectPosition: "top", borderRadius: 4, border: `1 solid ${CIZGI}` },
  ssYok: { width: 190, height: 118, borderRadius: 4, border: `1 solid ${CIZGI}`, backgroundColor: "#f2f4f8", alignItems: "center", justifyContent: "center" },
  det: { flex: 1 },
  detEt: { fontSize: 7.2, color: GRI, marginTop: 5, letterSpacing: 0.4 },
  detDeg: { fontSize: 9, color: "#33405c", marginTop: 1.5, lineHeight: 1.4 },
  teknik: { borderTopColor: CIZGI, borderTopWidth: 1, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "#fbfcfe" },
  tGrid: { flexDirection: "row", flexWrap: "wrap" },
  tHucre: { width: "50%", flexDirection: "row", marginBottom: 2.5, paddingRight: 8 },
  tAd: { fontSize: 7.6, color: GRI, width: "42%" },
  tDeg: { fontSize: 7.6, color: "#26324a", width: "58%" },
});

// ── Yarım-daire tehdit göstergesi (gauge) — klasik speedometer, üstten düzgün 180° yay ──
function Gauge({ puan }: { puan: number }) {
  const W = 200, H = 122, cx = W / 2, cy = 108, R = 80;
  const rad = (a: number) => (Math.PI * a) / 180;
  const pt = (a: number, r = R): [number, number] => [+(cx + r * Math.cos(rad(a))).toFixed(2), +(cy - r * Math.sin(rad(a))).toFixed(2)];
  // Açı büyük→küçük (180=sol → 0=sağ), üstten geçer. y-aşağı sistemde bu yön saat yönü = SWEEP 1.
  const yay = (a1: number, a2: number) => { const [x1, y1] = pt(a1); const [x2, y2] = pt(a2); return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`; };
  const ibreAci = 180 - (Math.max(0, Math.min(100, puan)) / 100) * 180;
  const [ix, iy] = pt(ibreAci, R - 15);
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Path d={yay(180, 122)} stroke="#3fa66a" strokeWidth={11} fill="none" />
      <Path d={yay(120, 60)} stroke="#e0b93b" strokeWidth={11} fill="none" />
      <Path d={yay(58, 0)} stroke="#d0553f" strokeWidth={11} fill="none" />
      <Line x1={cx} y1={cy} x2={ix} y2={iy} stroke={LACIVERT} strokeWidth={2.6} strokeLinecap="round" />
      <Circle cx={cx} cy={cy} r={5} fill={LACIVERT} />
      <Circle cx={cx} cy={cy} r={2} fill="#fff" />
      <SvgText x={pt(180, R + 11)[0]} y={cy + 2} style={{ fontSize: 7 }} fill={GRI} textAnchor="start">Güvenli</SvgText>
      <SvgText x={pt(0, R + 11)[0]} y={cy + 2} style={{ fontSize: 7 }} fill={GRI} textAnchor="end">Yüksek</SvgText>
    </Svg>
  );
}

// ── Tehdit haritası (marka merkezde, tespitler yörüngede) ──
function TehditHarita({ v }: { v: MarkaRaporVeri }) {
  const tum = [...v.oneCikan, ...v.digerleri].filter((t) => t.domain).sort((a, b) => (b.skor || 0) - (a.skor || 0)).slice(0, 22);
  if (!tum.length) return null;
  const W = 500, H = 250, cx = W / 2, cy = H / 2, N = tum.length;
  // Küme TLD (harita rengi için) — en kalabalık toplu-kayıt son-eki.
  const tldSay: Record<string, number> = {};
  for (const a of tum) { const tl = (a.domain.split(".").pop() || "").toLowerCase(); tldSay[tl] = (tldSay[tl] || 0) + 1; }
  const enK = Object.entries(tldSay).sort((x, y) => y[1] - x[1])[0];
  const kumeTld = enK && enK[1] >= 5 && enK[1] / tum.length > 0.35 ? enK[0] : "";
  const seed = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619 >>> 0; return h; };
  const nodes = tum.map((t, i) => {
    const h = seed(t.domain);
    const s = Math.max(0, Math.min(100, t.skor || 0));
    const aci = (-90 + i * (360 / N) + ((h % 28) - 14)) * (Math.PI / 180);
    const Rr = 40 + ((100 - s) / 100) * 66 + ((h >> 6) % 26);
    const x = cx + Rr * Math.cos(aci), y = cy + Rr * Math.sin(aci);
    const gorLbl = i < 10;
    const sol = Math.cos(aci) < -0.25, sag = Math.cos(aci) > 0.25;
    const anc: "start" | "end" | "middle" = sol ? "end" : sag ? "start" : "middle";
    return { x, y, r: 4 + (s / 100) * 3.5, fill: KATEGORILER[tKategori(t, kumeTld)].renk, lbl: gorLbl ? (t.domain.length > 18 ? t.domain.slice(0, 17) + "…" : t.domain) : "", anc, lx: sol ? x - 6 : sag ? x + 6 : x, ly: y + (Math.sin(aci) >= 0 ? 9 : -4) };
  });
  return (
    <View style={{ position: "relative", width: W, height: H, alignSelf: "center", marginTop: 2 }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {[114, 83, 52].map((rr, k) => <Circle key={k} cx={cx} cy={cy} r={rr} stroke="#dce5ea" strokeWidth={0.7} fill="none" />)}
        {nodes.map((n, i) => <Line key={`l${i}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="#e6ebf1" strokeWidth={0.5} />)}
        {nodes.map((n, i) => <Circle key={`c${i}`} cx={n.x} cy={n.y} r={n.r} fill={n.fill} />)}
        {nodes.map((n, i) => <SvgText key={`t${i}`} x={n.lx} y={n.ly} style={{ fontSize: 5.4 }} fill="#4a5670" textAnchor={n.anc}>{n.lbl}</SvgText>)}
      </Svg>
      <View style={{ position: "absolute", left: cx - 23, top: cy - 23, width: 46, height: 46, borderRadius: 23, backgroundColor: "#fff", borderColor: TEAL, borderWidth: 1.4, alignItems: "center", justifyContent: "center", padding: 5 }}>
        {v.logoDataUri ? <Image src={v.logoDataUri} style={{ width: 34, height: 34, objectFit: "contain" }} /> : <Text style={{ fontSize: 13, fontWeight: "bold", color: LACIVERT }}>{v.markaAd.slice(0, 2).toUpperCase()}</Text>}
      </View>
      <View style={{ position: "absolute", right: 8, top: 26, alignItems: "flex-end" }}>
        <Text style={{ fontSize: 13, fontWeight: "bold", color: LACIVERT }}>{v.ozet.toplam} alan adı</Text>
        <Text style={{ fontSize: 6.5, color: GRI }}>izlenen · marka-benzeri</Text>
      </View>
    </View>
  );
}

// Bir tespit için kural-tabanlı ÖNERİ (gerçek USOM/BTK/durum verisinden — uydurma yok).
function oneriUret(t: RaporTespit): { neden: string; oneri: string; oncelik: string } {
  const aktif = t.durum === "aktif-tuzak", canli = t.durum === "canli";
  if (t.usomda === true) return { neden: "USOM resmî zararlı bağlantı listesinde kayıtlı; devlet tarafından işaretlenmiş.", oneri: "Kayıt mevcut, yeni bildirim gerekmez; kurumsal DNS'te engelleme + hukuki takip.", oncelik: "Yüksek" };
  if (t.engelli === true) return { neden: "BTK erişim engeli tespit edildi (engel sayfasına yönleniyor).", oneri: "Zaten engelli; kesintisiz izleme yeterli.", oncelik: "Bilgi" };
  if (aktif) return { neden: "Aktif tuzak: marka adını taşıyan, resmî olmayan canlı adres.", oneri: "USOM'a bildirim (henüz kayıtlı değil) + kesintisiz izleme.", oncelik: "Yüksek" };
  if (canli) return { neden: "Canlı adres; marka adını izinsiz kullanıyor, içerik doğrulanmalı.", oneri: "Günlük izleme; içerik/logo taklidi belirirse aynı gün bildirim.", oncelik: "Orta · izleme" };
  return { neden: "Kayıtlı ancak içerik yayında değil (park/izleme).", oneri: "Aksiyon gerekmez; Türkçe adlı kayıtlar öncelikli izlemede.", oncelik: "Düşük · artan" };
}

// Öne çıkan tespit için kural-tabanlı DETAYLI BULGU metni (gerçek verilerden).
function detayMetin(t: RaporTespit): string {
  const parca: string[] = [];
  const durum = DURUM_AD[t.durum || ""] || "İnceleniyor";
  parca.push(`${t.domain}, otomatik ön-değerlendirmede ${t.skor}/100 skorla "${durum}" olarak sınıflandırıldı.`);
  if (t.canliDurum) parca.push(`Canlı doğrulama: ${canliDurumAd(t.canliDurum)}.`);
  if (t.ip || t.asn) parca.push(`Barındırma: ${[t.asn, t.ulke, t.altyapi].filter(Boolean).join(" · ")}${t.ip ? ` (IP ${t.ip})` : ""}${t.ca ? `; sertifika: ${t.ca}` : ""}.`);
  if (t.usomda === false) parca.push("USOM listesinde yer almıyor — bu adresi resmî radardan önce yakaladık (biz-önce).");
  if (t.usomda === true) parca.push("USOM resmî listesinde kayıtlı.");
  if (t.engelli === true) parca.push("BTK tarafından erişime engellenmiş.");
  if (t.etbis === true) parca.push("ETBİS e-ticaret sicilinde kayıtlı.");
  if (t.sinyaller && t.sinyaller.length) parca.push("Sinyaller: " + t.sinyaller.slice(0, 3).join("; ") + ".");
  parca.push("Kesin sahtelik sınıflandırması için adres ayrıca incelenir; listede yer alması tek başına hukuki tespit anlamına gelmez.");
  return parca.join(" ");
}

export function MarkaRaporPdf({ v }: { v: MarkaRaporVeri }) {
  const puan = riskPuan(v);
  const etiket = riskEtiket(puan);
  const tumTespit = [...v.oneCikan, ...v.digerleri];
  // Park kümesi: en kalabalık TLD toplu-kayıt (tek operasyon) — sayıyı şişirmesin.
  const tldSay: Record<string, number> = {};
  for (const a of tumTespit) { const tld = (a.domain.split(".").pop() || "").toLowerCase(); tldSay[tld] = (tldSay[tld] || 0) + 1; }
  const enKalabalik = Object.entries(tldSay).sort((x, y) => y[1] - x[1])[0];
  const kumeVar = !!enKalabalik && enKalabalik[1] >= 5 && enKalabalik[1] / Math.max(1, tumTespit.length) > 0.35;
  const kumeAdet = kumeVar ? enKalabalik[1] : 0;
  const ayriAdet = v.ozet.toplam - kumeAdet;
  const katSay = [0, 0, 0, 0, 0, 0, 0];
  for (const t of tumTespit) katSay[tKategori(t, kumeVar ? enKalabalik[0] : "")]++;

  const Cip = ({ text, color }: { text: string; color: string }) => <Text style={[st.cip, { color, borderColor: color }]}>{text}</Text>;
  const usomCip = (u?: boolean | null) => u === true ? <Cip text="USOM'da kayıtlı" color={KIRMIZI} /> : u === false ? <Cip text="USOM'da yok · biz-önce" color={YESIL} /> : <Cip text="USOM: bilinmiyor" color="#8a97a5" />;
  const btkCip = (e?: boolean | null) => e === true ? <Cip text="BTK · engelli" color="#7a4b8a" /> : e === false ? <Cip text="BTK engeli yok" color={GRI} /> : <Cip text="BTK: bilinmiyor" color="#8a97a5" />;
  const etbisCip = (t?: boolean | null) => t === true ? <Cip text="ETBİS'te kayıtlı" color={TEAL} /> : t === false ? <Cip text="ETBİS'te yok" color={GRI} /> : <Cip text="ETBİS: bilinmiyor" color="#8a97a5" />;

  const Antet = () => (
    <View style={st.antet} fixed>
      <View style={st.antetSol}><Text style={st.antetLogo}>MİRLEON</Text><Text style={st.antetAlt}>· Marka Koruma Servisi</Text></View>
      <Text style={st.antetSag}>{v.markaAd.toUpperCase()}</Text>
    </View>
  );
  const Footer = () => (
    <View style={st.footer} fixed>
      <Text style={st.fMini}>MirLeon AI · Marka Koruma · {v.refNo} · Gizli, alıcıya özeldir</Text>
      <Text style={st.fMini} render={({ pageNumber }) => `Sayfa ${pageNumber}`} />
    </View>
  );
  const Baslik = ({ metin, ikon }: { metin: string; ikon?: string }) => (
    <>
      <View style={st.bolum}><View style={st.bolumIkon}><Text style={{ fontSize: 9, color: "#fff", fontWeight: "bold" }}>{ikon || "▸"}</Text></View><Text style={st.bolumBaslik}>{metin}</Text></View>
      <View style={st.bolumCizgi} />
    </>
  );

  const durumOzet = v.ozet.aktif > 0
    ? `Bu dönemde ${v.markaAd} markası adına açılmış ${v.ozet.toplam} benzer adresin ${v.ozet.aktif} tanesi AKTİF tuzak olarak tespit edildi; ${v.ozet.canli} adres canlı, ${v.ozet.park} adres park/izlemede tutuldu.`
    : `Bu dönemde ${v.markaAd} markası adına açılmış ${v.ozet.toplam} benzer adres tespit edilmiş ve her biri değerlendirilmiştir; markanız adına AKTİF bir kimlik avı (phishing) tuzağına rastlanmamıştır. ${v.ozet.canli} adres canlı, ${v.ozet.park} adres park/izlemede.`;

  const oneriliKay = [...v.oneCikan, ...v.digerleri.filter((t) => t.durum === "aktif-tuzak" || t.durum === "canli")].slice(0, 7);

  return (
    <Document title={`${v.markaAd} — Marka Koruma Bülteni`} author="MirLeon">
      {/* ── KAPAK ── */}
      <Page size="A4" style={{ backgroundColor: KOYU, position: "relative", fontFamily: "Tinos", color: "#fff" }}>
        {/* radar halkaları — sağdan yayılan geniş halkalar (referans) */}
        {[210, 330, 460, 600, 750].map((d, i) => <View key={i} style={{ position: "absolute", borderColor: i < 2 ? "#22456b" : "#1a3350", borderWidth: 1, borderRadius: 999, width: d, height: d, top: 250 - d / 2, right: 70 - d / 2 }} />)}
        <View style={{ paddingHorizontal: 44, paddingTop: 46 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text style={{ color: "#fff", fontSize: 17, fontWeight: "bold", letterSpacing: 1.5 }}>MİRLEON<Text style={{ color: "#9fb4d8" }}>  |  </Text><Text style={{ color: "#cfe0ef" }}>NAZAR</Text></Text>
              <Text style={{ color: "#7d93b3", fontSize: 8, letterSpacing: 3, marginTop: 2 }}>MARKA KORUMA</Text>
            </View>
            <Text style={{ color: ALTIN, fontSize: 8.5, fontWeight: "bold", letterSpacing: 1.5, borderColor: ALTIN, borderWidth: 1, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4 }}>GİZLİ · ALICIYA ÖZEL</Text>
          </View>
          {/* kalkan+göz amblem */}
          <View style={{ alignItems: "flex-end", marginTop: 22, paddingRight: 20 }}>
            <Svg width={150} height={150} viewBox="0 0 100 100">
              <Path d="M50 8 L82 20 L82 46 C82 68 68 84 50 92 C32 84 18 68 18 46 L18 20 Z" stroke="#fff" strokeWidth={3} fill="none" />
              <Path d="M28 50 C36 40 64 40 72 50 C64 60 36 60 28 50 Z" stroke="#fff" strokeWidth={3} fill="none" />
              <Circle cx={50} cy={50} r={9} stroke="#fff" strokeWidth={3} fill="none" />
              <Circle cx={53} cy={47} r={3.2} fill="#2bb6c4" />
            </Svg>
          </View>
          <View style={{ marginTop: 40 }}>
            {v.logoDataUri
              ? <Image src={v.logoDataUri} style={{ height: 40, width: 150, objectFit: "contain", objectPosition: "left" }} />
              : <Text style={{ color: "#fff", fontSize: 30, fontWeight: "bold" }}>{v.markaAd}</Text>}
            <Text style={{ color: ALTIN, fontSize: 9.5, letterSpacing: 1.5, marginTop: 10 }}>{(v.markaResmi || v.markaAd).toUpperCase()} · {v.aralikEtiket.toUpperCase()}</Text>
            <Text style={{ color: "#fff", fontSize: 30, fontWeight: "bold", marginTop: 10 }}>Marka Koruma Bülteni</Text>
          </View>
          {/* Süreç akışı — İnternetten aksiyona metodoloji (referans kapak öğesi) */}
          <View style={{ marginTop: 26 }}>
            <Text style={{ color: "#7d93b3", fontSize: 8, letterSpacing: 2.5 }}>YÖNTEM · İNTERNETTEN TAKİBE</Text>
            <View style={{ marginTop: 10 }}>
              {["KEŞFET", "İZLE", "ANALİZ ET", "İLİŞKİLENDİR", "RİSKLENDİR", "UYAR", "AKSİYON", "RAPORLA", "TAKİP ET"].map((ad, i, dizi) => {
                const son = i === dizi.length - 1; // TAKİP ET → döngüyü kapatır (altın)
                const renk = son ? ALTIN : TEAL;
                return (
                  <View key={ad}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                      <View style={{ width: 15, height: 15, borderRadius: 8, borderColor: renk, borderWidth: 1.1, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 7, color: renk, fontWeight: "bold" }}>{i + 1}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: son ? ALTIN : "#fff", fontWeight: "bold", letterSpacing: 1.4 }}>{ad}</Text>
                    </View>
                    {!son && <View style={{ width: 1.1, height: 7, backgroundColor: "#2b4a6b", marginLeft: 7 }} />}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
        <View style={{ position: "absolute", bottom: 44, left: 44, right: 44, flexDirection: "row", alignItems: "center", borderTopColor: "#26456a", borderTopWidth: 1, paddingTop: 12 }}>
          <View style={{ flex: 1 }}><Text style={{ color: "#7d93b3", fontSize: 7.5, letterSpacing: 1.5 }}>RAPOR NO</Text><Text style={{ color: "#fff", fontSize: 11, fontWeight: "bold", marginTop: 3 }}>{v.refNo}</Text></View>
          <View style={{ width: 1, height: 26, backgroundColor: "#26456a" }} />
          <View style={{ flex: 1, paddingLeft: 30 }}><Text style={{ color: "#7d93b3", fontSize: 7.5, letterSpacing: 1.5 }}>DOĞRULAMA TARİHİ</Text><Text style={{ color: "#fff", fontSize: 11, fontWeight: "bold", marginTop: 3 }}>{v.tarih}</Text></View>
        </View>
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 6, backgroundColor: TEAL }} />
      </Page>

      {/* ── İÇ SAYFALAR ── */}
      <Page size="A4" style={st.page}>
        <Antet /><Footer />
        <View style={st.govde}>
          <Baslik metin="Yönetici Özeti" ikon="✓" />
          {/* Gauge + değerlendirme */}
          <View style={{ flexDirection: "row", borderColor: CIZGI, borderWidth: 1, borderRadius: 7, padding: 12, gap: 14, alignItems: "center", marginBottom: 10, alignSelf: "center", width: 400, backgroundColor: "#fbfcfe" }}>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 7, color: GRI, letterSpacing: 1.5, marginBottom: 2 }}>GENEL TEHDİT DÜZEYİ</Text>
              <Gauge puan={puan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 7.5, color: GRI, letterSpacing: 1 }}>DEĞERLENDİRME</Text>
              <Text style={{ fontSize: 21, fontWeight: "bold", color: LACIVERT, marginTop: 2, marginBottom: 7 }}>{etiket}</Text>
              <Text style={{ fontSize: 9, color: "#33405c", lineHeight: 1.5 }}>
                {v.ozet.aktif > 0 ? `${v.ozet.aktif} aktif tuzak. ` : "Aktif kimlik avı yok. "}
                Geniş benzer-isim ayak izi: {v.ozet.toplam} izlenecek adres, {v.erkenlik.usomdaYok} tanesi ulusal listede yok.
              </Text>
            </View>
          </View>
          <Text style={st.p}>{durumOzet} Genel tablo şu maddelerle özetlenebilir:</Text>
          <View style={st.madde}><Text style={st.maddeIsaret}>•</Text><Text style={st.maddeMetin}>
            <Text style={st.guclu}>{v.ozet.aktif > 0 ? `${v.ozet.aktif} aktif kimlik avı (phishing) adresi mevcuttur.` : "Aktif kimlik avı (phishing) yoktur."}</Text> {v.ozet.aktif > 0 ? "Bu adresler için önerilen adımlar aşağıdadır." : "Müşteri verisinin çalındığına dair bulguya rastlanmamıştır."}
          </Text></View>
          {kumeVar && <View style={st.madde}><Text style={st.maddeIsaret}>•</Text><Text style={st.maddeMetin}>
            <Text style={st.guclu}>Ham sayı yanıltıcı olabilir:</Text> {v.ozet.toplam} adresin {kumeAdet}'i tek bir <Text style={st.guclu}>.{enKalabalik[0]}</Text> toplu-kayıt kümesidir (aynı operasyon). Pratikte <Text style={st.guclu}>{ayriAdet} ayrı adres + 1 küme</Text> söz konusudur.
          </Text></View>}
          <View style={st.madde}><Text style={st.maddeIsaret}>•</Text><Text style={st.maddeMetin}>
            <Text style={st.guclu}>{v.erkenlik.usomdaYok} adres</Text> ulusal engelleme listesinde henüz yer almıyor — bunları resmî radardan önce yakaladık (biz-önce). Erken tespit, itibara ulaşmadan müdahale imkânı verir.
          </Text></View>
          {v.ozet.canli > 0 && <View style={st.madde}><Text style={st.maddeIsaret}>•</Text><Text style={st.maddeMetin}>
            <Text style={st.guclu}>{v.ozet.canli} canlı adres izlemededir.</Text> İçerik doğrulaması sürmekte; logo/form taklidi belirirse aynı gün bildirim yapılır.
          </Text></View>}

          {/* Tehdit haritası */}
          {tumTespit.length > 0 && (
            <View wrap={false} style={{ marginTop: 8 }}>
              <TehditHarita v={v} />
              <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 11, marginTop: 3, paddingHorizontal: 20 }}>
                {KATEGORILER.map((k, i) => katSay[i] > 0 ? (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: k.renk }} /><Text style={{ fontSize: 7, color: GRI }}>{k.ad} <Text style={{ fontWeight: "bold", color: LACIVERT }}>{katSay[i]}</Text></Text></View>
                ) : null)}
              </View>
              <Text style={st.sekilAlt}>Şekil 1. Yapay Zekâ Destekli Tehdit Haritası — {v.markaAd} merkez · marka</Text>
            </View>
          )}
        </View>
      </Page>

      {/* ── ÖNERİLEN AKSİYONLAR ── */}
      {oneriliKay.length > 0 && (
        <Page size="A4" style={st.page}>
          <Antet /><Footer />
          <View style={st.govde}>
            <Baslik metin="Önerilen Aksiyonlar" ikon="!" />
            <Text style={st.p}>Aşağıdaki tabloda her satır, ilgili adresin gerçek USOM/BTK durumu ve canlılık sınıflandırmasına dayanır. Öncelikler eylem aciliyetini gösterir.</Text>
            <View style={st.tHead}>
              <Text style={[st.th, { width: "26%" }]}>Adres</Text><Text style={[st.th, { width: "31%" }]}>Neden</Text><Text style={[st.th, { width: "31%" }]}>Önerimiz</Text><Text style={[st.th, { width: "12%" }]}>Öncelik</Text>
            </View>
            {oneriliKay.map((t, i) => { const o = oneriUret(t); return (
              <View key={i} style={[st.tRow, ...(i % 2 ? [st.tRowAlt] : [])]} wrap={false}>
                <Text style={[st.td, { width: "26%", fontWeight: "bold", color: LACIVERT }]}>{t.domain}</Text>
                <Text style={[st.td, { width: "31%", paddingRight: 6 }]}>{o.neden}</Text>
                <Text style={[st.td, { width: "31%", paddingRight: 6 }]}>{o.oneri}</Text>
                <Text style={[st.td, { width: "12%", color: SEV(t.durum), fontWeight: "medium" }]}>{o.oncelik}</Text>
              </View>
            ); })}
            <Text style={[st.p, { marginTop: 8, fontSize: 9, color: GRI }]}>
              <Text style={st.guclu}>Öncelik dereceleri — Yüksek:</Text> bu ay içinde bir adım önerilir. <Text style={st.guclu}>Orta:</Text> takvime bağlanabilir, acil değil. <Text style={st.guclu}>Bilgi:</Text> aksiyon değil, doğrulaması iyi olur. <Text style={st.guclu}>Düşük:</Text> MirLeon AI tarafında izlenmekte, aksiyon beklenmez.
            </Text>
          </View>
        </Page>
      )}

      {/* ── ÖNE ÇIKAN ADRESLER + DETAYLI BULGULAR ── */}
      {v.oneCikan.length > 0 && (
        <Page size="A4" style={st.page}>
          <Antet /><Footer />
          <View style={st.govde}>
            <Baslik metin="Öne Çıkan Adresler ve Canlı Doğrulama" ikon="◎" />
            <Text style={st.p}>Giriş formu bulunan ve/veya en yüksek skorlu adreslerin canlı doğrulama sonuçları ve teknik istihbaratı aşağıda belgelenmiştir.</Text>
            {/* ÖZET TABLO — canlı durum + barındırma + değerlendirme */}
            <View style={st.tHead}>
              <Text style={[st.th, { width: "34%" }]}>Alan adı</Text><Text style={[st.th, { width: "24%" }]}>Canlı durum</Text><Text style={[st.th, { width: "24%" }]}>Barındırma</Text><Text style={[st.th, { width: "18%" }]}>Değerlendirme</Text>
            </View>
            {[...v.oneCikan, ...v.digerleri.filter((t) => t.durum === "aktif-tuzak" || t.durum === "canli")].slice(0, 14).map((t, i) => { const kat = KATEGORILER[tKategori(t, kumeVar ? enKalabalik[0] : "")]; return (
              <View key={i} style={[st.tRow, ...(i % 2 ? [st.tRowAlt] : [])]} wrap={false}>
                <Text style={[st.td, { width: "34%", fontWeight: "medium", color: LACIVERT }]}>{t.domain}</Text>
                <Text style={[st.td, { width: "24%" }]}>{canliDurumAd(t.canliDurum)}</Text>
                <Text style={[st.td, { width: "24%", fontSize: 7.8 }]}>{[t.altyapi, t.ulke].filter(Boolean).join(" · ") || "—"}</Text>
                <Text style={[st.td, { width: "18%" }]}><Text style={{ color: kat.renk, fontSize: 7.6 }}>● </Text>{kat.ad}</Text>
              </View>
            ); })}
            <Baslik metin="Detaylı Bulgular" ikon="▤" />
            {v.oneCikan.map((t, i) => (
              <View key={i} wrap={false} style={{ marginBottom: 9 }}>
                <Text style={{ fontSize: 11, fontWeight: "bold", color: LACIVERT, marginBottom: 2 }}>
                  <Text style={{ color: TEAL }}>{`4.${i + 1}`}</Text>{`  ${t.domain}`}  <Text style={{ fontSize: 9, fontWeight: "normal", color: SEV(t.durum) }}>({DURUM_AD[t.durum || ""] || "İnceleniyor"} · %{t.skor})</Text>
                </Text>
                <Text style={{ fontSize: 9.5, lineHeight: 1.55, color: "#26324a", textAlign: "justify" }}>{detayMetin(t)}</Text>
              </View>
            ))}
          </View>
        </Page>
      )}

      {/* ── EK: TAM LİSTE ── */}
      {tumTespit.length > 0 && (
        <Page size="A4" style={st.page}>
          <Antet /><Footer />
          <View style={st.govde}>
            <Baslik metin={`EK: Tespit Edilen ${v.ozet.toplam} Adresin Tam Listesi`} ikon="▤" />
            <Text style={st.p}>Tüm tespitlerin temel teknik özeti. Durum ve skor otomatik ön-değerlendirmedir; kesin karar için adres ayrıca incelenir.</Text>
            <View style={st.tHead} fixed>
              <Text style={[st.th, { width: "27%" }]}>Alan adı</Text><Text style={[st.th, { width: "15%" }]}>IP</Text><Text style={[st.th, { width: "24%" }]}>Barındırma (ASN)</Text><Text style={[st.th, { width: "11%" }]}>Ülke</Text><Text style={[st.th, { width: "12%" }]}>Altyapı</Text><Text style={[st.th, { width: "11%" }]}>CA</Text>
            </View>
            {tumTespit.sort((a, b) => (b.skor || 0) - (a.skor || 0)).slice(0, 160).map((t, i) => (
              <View key={i} style={[st.tRow, ...(i % 2 ? [st.tRowAlt] : [])]} wrap={false}>
                <Text style={[st.td, { width: "27%", fontWeight: "medium", color: LACIVERT, fontSize: 7.8 }]}>{t.domain}</Text>
                <Text style={[st.td, { width: "15%", fontSize: 7.6 }]}>{t.ip || "—"}</Text>
                <Text style={[st.td, { width: "24%", fontSize: 7.4, paddingRight: 4 }]}>{t.asn || "—"}</Text>
                <Text style={[st.td, { width: "11%", fontSize: 7.6 }]}>{t.ulke || "—"}</Text>
                <Text style={[st.td, { width: "12%", fontSize: 7.6 }]}>{t.altyapi || "—"}</Text>
                <Text style={[st.td, { width: "11%", fontSize: 7.4 }]}>{t.ca || "—"}</Text>
              </View>
            ))}
            {v.ozet.toplam > 160 && <Text style={[st.p, { marginTop: 6, fontSize: 8.5, color: GRI }]}>En yüksek skorlu 160 adres gösterildi (toplam {v.ozet.toplam}).</Text>}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, borderTopColor: CIZGI, borderTopWidth: 1, paddingTop: 8 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: TEAL }} />
              <Text style={{ fontSize: 9, color: "#33405c" }}><Text style={st.guclu}>ÖNEMLİ NOT:</Text> Bulgular doğrulama anına ({v.tarih}) aittir; bir adresin durumu zamanla değişebilir.</Text>
            </View>
          </View>
        </Page>
      )}
    </Document>
  );
}

export async function markaRaporPdf(v: MarkaRaporVeri): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(<MarkaRaporPdf v={v} />);
}
