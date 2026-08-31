import path from "path";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// Türkçe-uyumlu font (Roboto) — assets/fonts'tan gömülür.
const fontYol = (p: string) => path.join(process.cwd(), "assets/fonts", p);
Font.register({
  family: "Roboto",
  fonts: [
    { src: fontYol("Roboto-Regular.ttf") },
    { src: fontYol("Roboto-Medium.ttf"), fontWeight: "medium" },
    { src: fontYol("Roboto-Bold.ttf"), fontWeight: "bold" },
  ],
});
Font.registerHyphenationCallback((w) => [w]); // Türkçe kelime bölmeyi kapat

/* ---- Rapor veri tipi (OsintRaporu ile aynı) ---- */
export type PdfRapor = {
  tip: string;
  deger: string;
  alanlar: { ad: string; deger: string }[];
  bulgular: string[];
  risk: number;
  riskSeviye: "Yüksek" | "Orta" | "Düşük";
  analiz?: { ozet?: string; yorum?: string; neden?: string[]; adimlar?: string[]; ai?: boolean };
  baglantilar?: { deger: string; tip: string; sayi: number }[];
};

const INDIGO = "#3b46d9";
const LACIVERT = "#1e2540";
const GRI = "#6b7280";
const ACIK = "#eef0fb";
const SEVIYE_RENK: Record<string, string> = {
  "Yüksek": "#d92d20",
  "Orta": "#b25e09",
  "Düşük": "#2e7d55",
};
const TIP_ADI: Record<string, string> = { url: "İnternet Adresi", iban: "IBAN", telefon: "Telefon" };

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 64, fontFamily: "Roboto", fontSize: 10, color: LACIVERT },
  // Üst bant
  header: { backgroundColor: LACIVERT, paddingHorizontal: 32, paddingVertical: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logoAd: { color: "#ffffff", fontSize: 16, fontWeight: "bold", letterSpacing: 1 },
  logoAlt: { color: "#aab2e0", fontSize: 8, marginTop: 2 },
  rozet: { color: "#ffffff", fontSize: 8, borderColor: "#4c568f", borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3 },
  govde: { paddingHorizontal: 32, paddingTop: 18 },
  baslik: { fontSize: 13, fontWeight: "bold", color: LACIVERT },
  metaKutu: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, borderColor: "#e3e6f2", borderWidth: 1, borderRadius: 4 },
  metaHucre: { width: "50%", padding: 8, borderColor: "#e3e6f2", borderTopWidth: 1, borderRightWidth: 1 },
  metaEtiket: { color: GRI, fontSize: 8, marginBottom: 2 },
  metaDeger: { fontSize: 10, fontWeight: "medium" },
  // Risk kutusu
  riskKutu: { marginTop: 16, flexDirection: "row", alignItems: "center", borderRadius: 6, padding: 14 },
  riskSkor: { fontSize: 30, fontWeight: "bold", color: "#ffffff" },
  bolumBaslik: { fontSize: 11, fontWeight: "bold", color: INDIGO, marginTop: 18, marginBottom: 6, borderBottomColor: ACIK, borderBottomWidth: 2, paddingBottom: 3 },
  p: { fontSize: 10, lineHeight: 1.5, color: "#333a52" },
  // Tablo
  tabloSatir: { flexDirection: "row", borderBottomColor: "#eef0f6", borderBottomWidth: 1 },
  tdAd: { width: "40%", padding: 6, color: GRI, fontSize: 9 },
  tdDeger: { width: "60%", padding: 6, fontSize: 9, fontWeight: "medium" },
  madde: { flexDirection: "row", marginBottom: 4 },
  maddeIsaret: { width: 12, fontSize: 10, color: INDIGO },
  adimSatir: { flexDirection: "row", marginBottom: 5 },
  adimNo: { width: 16, height: 16, borderRadius: 8, backgroundColor: INDIGO, color: "#fff", fontSize: 9, textAlign: "center", paddingTop: 2, marginRight: 6 },
  baglanti: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#f7f8fc", borderRadius: 4, padding: 6, marginBottom: 4 },
  // Alt bilgi
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 32, paddingVertical: 12, borderTopColor: "#e3e6f2", borderTopWidth: 1 },
  footerYazi: { fontSize: 7.5, color: GRI, lineHeight: 1.4 },
  footerAlt: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
});

export function OsintRaporPdf({ rapor, refNo, tarih }: { rapor: PdfRapor; refNo: string; tarih: string }) {
  const renk = SEVIYE_RENK[rapor.riskSeviye] || INDIGO;
  return (
    <Document title={`SİTS OSINT Raporu ${refNo}`} author="SİTS">
      <Page size="A4" style={s.page}>
        {/* Antet */}
        <View style={s.header} fixed>
          <View>
            <Text style={s.logoAd}>SİTS</Text>
            <Text style={s.logoAlt}>Siber Test, Tespit ve Savunma</Text>
          </View>
          <Text style={s.rozet}>OSINT TEHDİT DEĞERLENDİRME RAPORU</Text>
        </View>

        <View style={s.govde}>
          <Text style={s.baslik}>Açık Kaynak İstihbarat (OSINT) Değerlendirmesi</Text>

          {/* Meta bilgi */}
          <View style={s.metaKutu}>
            <View style={[s.metaHucre, { borderLeftWidth: 1 }]}>
              <Text style={s.metaEtiket}>Rapor No</Text>
              <Text style={s.metaDeger}>{refNo}</Text>
            </View>
            <View style={s.metaHucre}>
              <Text style={s.metaEtiket}>Düzenlenme</Text>
              <Text style={s.metaDeger}>{tarih}</Text>
            </View>
            <View style={[s.metaHucre, { borderLeftWidth: 1 }]}>
              <Text style={s.metaEtiket}>İncelenen Değer</Text>
              <Text style={s.metaDeger}>{rapor.deger}</Text>
            </View>
            <View style={s.metaHucre}>
              <Text style={s.metaEtiket}>Gösterge Türü</Text>
              <Text style={s.metaDeger}>{TIP_ADI[rapor.tip] || rapor.tip}</Text>
            </View>
          </View>

          {/* Risk özeti */}
          <View style={[s.riskKutu, { backgroundColor: renk }]}>
            <Text style={s.riskSkor}>{rapor.risk}</Text>
            <View style={{ marginLeft: 14 }}>
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "bold" }}>{rapor.riskSeviye} Risk</Text>
              <Text style={{ color: "#ffffffcc", fontSize: 9, marginTop: 2 }}>
                100 üzerinden değerlendirme · açık kaynak sinyallerine dayalı
              </Text>
            </View>
          </View>

          {/* Değerlendirme */}
          {(rapor.analiz?.ozet || rapor.analiz?.yorum) && (
            <View>
              <Text style={s.bolumBaslik}>Değerlendirme</Text>
              {rapor.analiz?.ozet ? <Text style={[s.p, { fontWeight: "medium", marginBottom: 3 }]}>{rapor.analiz.ozet}</Text> : null}
              {rapor.analiz?.yorum ? <Text style={s.p}>{rapor.analiz.yorum}</Text> : null}
            </View>
          )}

          {/* Neden böyle değerlendirdik? */}
          {rapor.analiz?.neden && rapor.analiz.neden.length > 0 && (
            <View>
              <Text style={s.bolumBaslik}>Neden Böyle Değerlendirdik?</Text>
              {rapor.analiz.neden.map((n, i) => (
                <View style={s.madde} key={i}>
                  <Text style={s.maddeIsaret}>•</Text>
                  <Text style={[s.p, { flex: 1 }]}>{n}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Toplanan istihbarat */}
          {rapor.alanlar?.length > 0 && (
            <View wrap={false}>
              <Text style={s.bolumBaslik}>Toplanan İstihbarat</Text>
              <View style={{ borderColor: "#eef0f6", borderWidth: 1, borderRadius: 4 }}>
                {rapor.alanlar.map((a, i) => (
                  <View style={s.tabloSatir} key={i}>
                    <Text style={s.tdAd}>{a.ad}</Text>
                    <Text style={s.tdDeger}>{a.deger}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Bulgular */}
          {rapor.bulgular?.length > 0 && (
            <View>
              <Text style={s.bolumBaslik}>Bulgular</Text>
              {rapor.bulgular.map((b, i) => (
                <View style={s.madde} key={i}>
                  <Text style={s.maddeIsaret}>•</Text>
                  <Text style={[s.p, { flex: 1 }]}>{b}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Birlikte bildirilen göstergeler */}
          {rapor.baglantilar && rapor.baglantilar.length > 0 && (
            <View>
              <Text style={s.bolumBaslik}>Birlikte Bildirilen Göstergeler (Kampanya Bağı)</Text>
              {rapor.baglantilar.map((b, i) => (
                <View style={s.baglanti} key={i}>
                  <Text style={{ fontSize: 9 }}>{b.deger}</Text>
                  <Text style={{ fontSize: 8, color: INDIGO, fontWeight: "medium" }}>{b.sayi}× birlikte</Text>
                </View>
              ))}
            </View>
          )}

          {/* Öneriler */}
          {rapor.analiz?.adimlar && rapor.analiz.adimlar.length > 0 && (
            <View>
              <Text style={s.bolumBaslik}>Öneriler / Yapılması Gerekenler</Text>
              {rapor.analiz.adimlar.map((a, i) => (
                <View style={s.adimSatir} key={i}>
                  <Text style={s.adimNo}>{i + 1}</Text>
                  <Text style={[s.p, { flex: 1 }]}>{a}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Alt bilgi */}
        <View style={s.footer} fixed>
          <Text style={s.footerYazi}>
            Bu rapor açık kaynak verilerden otomatik üretilmiştir; kesin hüküm veya resmi bir devlet belgesi değildir.
            Nihai değerlendirme ve işlem sorumluluğu kullanıcıya aittir. Acil durumda 155 / 112.
          </Text>
          <View style={s.footerAlt}>
            <Text style={s.footerYazi}>SİTS — Siber Test, Tespit ve Savunma · {refNo}</Text>
            <Text style={s.footerYazi} render={({ pageNumber, totalPages }) => `Sayfa ${pageNumber} / ${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function raporPdf(rapor: PdfRapor, refNo: string, tarih: string): Promise<Buffer> {
  return renderToBuffer(<OsintRaporPdf rapor={rapor} refNo={refNo} tarih={tarih} />);
}
