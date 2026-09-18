"use client";

// KONTROL ODASI — sistem-geneli operatör paneli (Ant Design). Giriş-kapılı.
// Tüm markalar + sistem sağlığı + kanal durumu (iOS/Android/Google/Meta) tek ekranda.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfigProvider, theme, Row, Col, Card, Statistic, Table, Tag, Flex, Button, Spin, Typography, Badge, Progress, Grid } from "antd";
import {
  EyeOutlined, ThunderboltOutlined, SafetyCertificateOutlined, GlobalOutlined, LogoutOutlined,
  AppleOutlined, AndroidOutlined, GoogleOutlined, NotificationOutlined, RadarChartOutlined, BarChartOutlined, CheckCircleOutlined, MinusCircleOutlined,
} from "@ant-design/icons";
import { markaDinle, cikis } from "@/lib/markaAuth";
import { usePanoTema, antTokenKoyu, antTokenAcik } from "@/lib/panoTema";
import { markaLogoAnahtar } from "@/lib/korunanMarkalar";

const { Text, Title } = Typography;
const fmt = (n: number) => (n || 0).toLocaleString("tr-TR");
const gecen = (t: number) => { if (!t) return "—"; const dk = (Date.now() - t) / 60000; if (dk < 60) return Math.round(dk) + " dk önce"; if (dk < 1440) return Math.round(dk / 60) + " saat önce"; return Math.round(dk / 1440) + " gün önce"; };

type MarkaSat = { marka: string; markaAdi: string; toplam: number; aktif: number; canli: number; sonZaman: number };
type Son = { domain: string; marka: string; skor: number; durum: string; zaman: number };
type Ozet = {
  ozet: { toplam: number; marka: number; buGun: number; sonTespit: number; aktif: number };
  markalar: MarkaSat[]; sonlar: Son[];
  kanallar: { ios: boolean; android: boolean; google: boolean; meta: boolean };
  durumDagilim?: { aktifTuzak: number; canli: number; park: number; pasif: number };
  tldDagilim?: { tld: string; adet: number }[];
  gunlukTrend?: { gun: string; adet: number }[];
  kaynakDagilim?: { ct: number; diger: number };
};
const KART = { background: "var(--c-0b1726)", borderColor: "var(--c-17293c)" } as const;

// ── GRAFİKLER (elle SVG/CSS — bağımlılık yok; tek-renk=magnitude, durum=ayrılmış status renkleri) ──
const BaslikCizgi = ({ ust, alt }: { ust: string; alt?: string }) => (
  <div style={{ marginBottom: 12 }}>
    <Text strong style={{ color: "var(--c-c7d6e6)", fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase" }}>{ust}</Text>
    {alt ? <Text style={{ display: "block", fontSize: 11, color: "var(--c-5b6b7d)", marginTop: 2 }}>{alt}</Text> : null}
  </div>
);
// Yatay bar (magnitude, tek hue) — 8px ince, yuvarlak uç, değer etiketi, tabular sayı.
function YatayBar({ satirlar, renk }: { satirlar: { ad: string; deger: number; logo?: string | null }[]; renk: string }) {
  const max = Math.max(1, ...satirlar.map((s) => s.deger));
  if (!satirlar.length) return <Text style={{ fontSize: 12, color: "var(--c-5b6b7d)" }}>Henüz veri yok.</Text>;
  return (
    <Flex vertical gap={9}>
      {satirlar.map((s, i) => (
        <div key={i}>
          <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
            <Flex align="center" gap={7} style={{ minWidth: 0 }}>
              {s.logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.logo} alt="" width={16} height={16} style={{ borderRadius: 3, background: "#fff", flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
              <Text ellipsis style={{ fontSize: 12.5, color: "var(--c-cfe3f5)" }}>{s.ad}</Text>
            </Flex>
            <Text strong style={{ fontSize: 12.5, color: "var(--c-e6eef7)", fontVariantNumeric: "tabular-nums", flexShrink: 0, marginLeft: 8 }}>{s.deger}</Text>
          </Flex>
          <div style={{ height: 8, background: "var(--c-17293c)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${(s.deger / max) * 100}%`, height: "100%", background: renk, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </Flex>
  );
}
// Donut (durum) — ayrılmış status renkleri + etiketli lejant (renk-tek-başına değil).
function Donut({ dilimler }: { dilimler: { ad: string; deger: number; renk: string }[] }) {
  const toplam = Math.max(1, dilimler.reduce((a, d) => a + d.deger, 0));
  const gercekToplam = dilimler.reduce((a, d) => a + d.deger, 0);
  const R = 52, sw = 15, C = 2 * Math.PI * R;
  let ofset = 0;
  return (
    <Flex align="center" gap={18} wrap>
      <svg width={132} height={132} viewBox="0 0 132 132" style={{ flexShrink: 0 }}>
        <circle cx={66} cy={66} r={R} fill="none" stroke="var(--c-17293c)" strokeWidth={sw} />
        {dilimler.filter((d) => d.deger > 0).map((d, i) => {
          const uz = (d.deger / toplam) * C;
          const bosluk = gercekToplam > 1 ? 1.5 : 0; // segmentler arası 1.5px yüzey boşluğu
          const el = <circle key={i} cx={66} cy={66} r={R} fill="none" stroke={d.renk} strokeWidth={sw}
            strokeDasharray={`${Math.max(0, uz - bosluk)} ${C - Math.max(0, uz - bosluk)}`} strokeDashoffset={-ofset} transform="rotate(-90 66 66)" strokeLinecap="butt" />;
          ofset += uz;
          return el;
        })}
        <text x={66} y={63} textAnchor="middle" style={{ fontSize: 21, fontWeight: 700, fill: "var(--c-e6eef7)" }}>{gercekToplam}</text>
        <text x={66} y={80} textAnchor="middle" style={{ fontSize: 9, fill: "var(--c-8fa6bd)" }}>tespit</text>
      </svg>
      <Flex vertical gap={6} style={{ minWidth: 130 }}>
        {dilimler.map((d, i) => (
          <Flex key={i} align="center" justify="space-between" gap={10}>
            <Flex align="center" gap={7}><span style={{ width: 9, height: 9, borderRadius: 2, background: d.renk, flexShrink: 0 }} /><Text style={{ fontSize: 12, color: "var(--c-c7d6e6)" }}>{d.ad}</Text></Flex>
            <Text strong style={{ fontSize: 12, color: "var(--c-e6eef7)", fontVariantNumeric: "tabular-nums" }}>{d.deger}</Text>
          </Flex>
        ))}
      </Flex>
    </Flex>
  );
}
const durumRenk: Record<string, string> = { "aktif-tuzak": "error", "canli": "processing", "park": "default", "yayinda-degil": "default" };
const durumAd: Record<string, string> = { "aktif-tuzak": "aktif tuzak", "canli": "canlı", "park": "park", "yayinda-degil": "pasif" };

export default function KontrolOdasi() {
  const router = useRouter();
  const { tema: temaAd, koyu, degistir } = usePanoTema();
  const screens = Grid.useBreakpoint(); // md+ → KPI'lar flex ile eşit-dolu; altında span ile 2/3'lü ızgara
  const [oturum, setOturum] = useState<boolean | null>(null);
  const [hesapAdi, setHesapAdi] = useState("");
  const [veri, setVeri] = useState<Ozet | null>(null);
  const [toplamCT, setToplamCT] = useState<number | null>(null);

  useEffect(() => markaDinle((user, hesap) => {
    if (!user) { setOturum(false); router.replace("/marka-giris"); return; }
    setOturum(true); setHesapAdi(hesap?.ad || hesap?.marka || "Operatör");
  }), [router]);

  useEffect(() => {
    if (!oturum) return;
    let durdu = false;
    async function cek() {
      try { const j = await (await fetch("/api/kontrol-ozet", { cache: "no-store" })).json(); if (!durdu && !j.hata) setVeri(j); } catch { /* sessiz */ }
    }
    cek(); const t = setInterval(cek, 30000);
    (async () => { try { const j = await (await fetch("/api/ct-akis", { cache: "no-store" })).json(); if (!durdu && j.toplam) setToplamCT(j.toplam); } catch { /* */ } })();
    return () => { durdu = true; clearInterval(t); };
  }, [oturum]);

  const antTema = { algorithm: koyu ? theme.darkAlgorithm : theme.defaultAlgorithm, token: koyu ? antTokenKoyu : antTokenAcik };

  return (
    <ConfigProvider theme={antTema}>
    <div className="pano" data-tema={temaAd}>
      {oturum === null || (oturum && !veri) ? (
        <Flex vertical align="center" justify="center" gap={14} style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--c-080f1a)", color: "var(--c-8fa6bd)" }}><Spin size="large" /><span>Kontrol odası yükleniyor…</span></Flex>
      ) : !veri ? (
        <Flex align="center" justify="center" style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--c-080f1a)", color: "var(--c-8fa6bd)" }}>Veri alınamadı.</Flex>
      ) : (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, overflowY: "auto", background: "var(--c-080f1a)", padding: "16px 20px 40px", fontFamily: "'IBM Plex Sans',sans-serif" }}>
          {/* Üst bar */}
          <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 18, rowGap: 10 }}>
            <Flex align="center" gap={12} wrap style={{ rowGap: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={koyu ? "/mirleon-white.svg" : "/mirleon.svg"} alt="MirLeon" style={{ height: 22 }} />
              <span style={{ width: 1, height: 20, background: "var(--c-1f3652)" }} />
              <div>
                <Title level={4} style={{ margin: 0, color: "var(--c-e6eef7)" }}>Kontrol Odası</Title>
                <Text style={{ fontSize: 12, color: "var(--c-5b6b7d)" }}>Sistem-geneli operatör görünümü · son tespit {gecen(veri.ozet.sonTespit)}</Text>
              </div>
              <Badge status="processing" color="var(--c-31c8b0)" text={<Text style={{ color: "var(--c-31c8b0)", fontFamily: "monospace", fontSize: 11 }}>LIVE</Text>} />
            </Flex>
            <Flex gap={8} wrap style={{ rowGap: 8 }}>
              <Button onClick={degistir} title={koyu ? "Açık temaya geç" : "Koyu temaya geç"} style={{ color: "var(--c-8fa6bd)" }}
                icon={<span className="material-symbols-outlined" style={{ fontSize: 17, lineHeight: 1 }}>{koyu ? "light_mode" : "dark_mode"}</span>} />
              <Button icon={<RadarChartOutlined />} onClick={() => router.push("/mercek")} style={{ color: "var(--c-8fa6bd)" }}>Kokpit</Button>
              <Button icon={<BarChartOutlined />} onClick={() => router.push("/panel")} style={{ color: "var(--c-8fa6bd)" }}>Panel</Button>
              <Button icon={<LogoutOutlined />} onClick={() => { cikis(); router.replace("/marka-giris"); }} style={{ color: "var(--c-8fa6bd)" }}>Çıkış ({hesapAdi})</Button>
            </Flex>
          </Flex>

          {/* KPI */}
          <Row gutter={[14, 14]}>
            {[
              { t: "İzlenen Sertifika", v: toplamCT ? (toplamCT / 1e9).toFixed(2) + " Mr" : "…", i: <EyeOutlined />, c: "var(--c-4d9fe0)" },
              { t: "Toplam Tespit (son 400)", v: fmt(veri.ozet.toplam), i: <SafetyCertificateOutlined />, c: "var(--c-4d9fe0)" },
              { t: "Bugün", v: fmt(veri.ozet.buGun), i: <ThunderboltOutlined />, c: "var(--c-52c41a)" },
              { t: "İzlenen Marka", v: fmt(veri.ozet.marka), i: <GlobalOutlined />, c: "var(--c-4d9fe0)" },
              { t: "Aktif Tuzak", v: fmt(veri.ozet.aktif), i: <ThunderboltOutlined />, c: "var(--c-f5222d)" },
            ].map((k) => (
              <Col key={k.t} {...(screens.md ? { flex: "1" } : { xs: 12, sm: 8 })}>
                <Card size="small" style={KART} styles={{ body: { padding: "12px 14px" } }}>
                  <Statistic title={<Text style={{ fontSize: 11, color: "var(--c-8fa6bd)" }}>{k.t}</Text>} value={k.v} prefix={<span style={{ color: k.c, marginRight: 4 }}>{k.i}</span>} valueStyle={{ color: k.c, fontSize: 20, fontWeight: 700 }} />
                </Card>
              </Col>
            ))}
          </Row>

          {/* Kanal durumu */}
          <Card style={{ ...KART, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
            <Text strong style={{ color: "var(--c-c7d6e6)", fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase" }}>Kanal durumu</Text>
            <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
              {[
                { ad: "iOS App Store", aktif: veri.kanallar.ios, ikon: <AppleOutlined /> },
                { ad: "Android Play", aktif: veri.kanallar.android, ikon: <AndroidOutlined /> },
                { ad: "Google Ads", aktif: veri.kanallar.google, ikon: <GoogleOutlined /> },
                { ad: "Meta reklam", aktif: veri.kanallar.meta, ikon: <NotificationOutlined /> },
              ].map((k) => (
                <Col key={k.ad} xs={12} sm={6}>
                  <Flex align="center" gap={10} style={{ padding: "10px 12px", border: `1px solid ${k.aktif ? "var(--c-12402a)" : "var(--c-2a2f38)"}`, borderRadius: 10, background: k.aktif ? "var(--c-0a1a12)" : "var(--c-0d131c)" }}>
                    <span style={{ color: k.aktif ? "var(--c-3ee08a)" : "var(--c-5b6b7d)", fontSize: 18 }}>{k.ikon}</span>
                    <div style={{ flex: 1 }}>
                      <Text style={{ color: "var(--c-e6eef7)", fontSize: 13, display: "block" }}>{k.ad}</Text>
                      <Text style={{ fontSize: 11, color: k.aktif ? "var(--c-3ee08a)" : "var(--c-8a97a5)" }}>{k.aktif ? "canlı" : "yapılandırılmadı"}</Text>
                    </div>
                    {k.aktif ? <CheckCircleOutlined style={{ color: "var(--c-3ee08a)" }} /> : <MinusCircleOutlined style={{ color: "var(--c-5b6b7d)" }} />}
                  </Flex>
                </Col>
              ))}
            </Row>
          </Card>

          {/* ── ANALİZ — en çok hedef alınan markalar + durum/uzantı/trend ── */}
          <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
            <Col xs={24} lg={14}>
              <Card style={{ ...KART, height: "100%" }} styles={{ body: { padding: 16 } }}>
                <BaslikCizgi ust="En çok hedef alınan markalar" alt="Aktif izleme penceresindeki tespit sayısına göre (yüksekten düşüğe)" />
                <YatayBar
                  renk="#4d9fe0"
                  satirlar={(veri.markalar || []).filter((m) => m.toplam > 0).slice(0, 10).map((m) => ({ ad: m.markaAdi || m.marka, deger: m.toplam, logo: markaLogoAnahtar(m.marka, 32) }))}
                />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card style={{ ...KART, height: "100%" }} styles={{ body: { padding: 16 } }}>
                <BaslikCizgi ust="Durum dağılımı" alt="Tespitlerin canlılık sınıfı" />
                <Donut dilimler={[
                  { ad: "Aktif tuzak", deger: veri.durumDagilim?.aktifTuzak || 0, renk: "#f5222d" },
                  { ad: "Canlı", deger: veri.durumDagilim?.canli || 0, renk: "#4d9fe0" },
                  { ad: "Park · izlemede", deger: veri.durumDagilim?.park || 0, renk: "#c99a3a" },
                  { ad: "Pasif · yayında değil", deger: veri.durumDagilim?.pasif || 0, renk: "#5b6b7d" },
                ]} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
            <Col xs={24} lg={14}>
              <Card style={{ ...KART, height: "100%" }} styles={{ body: { padding: 16 } }}>
                <BaslikCizgi ust="En çok kötüye kullanılan uzantılar" alt="Taklit adreslerin alan adı uzantısı (TLD)" />
                <YatayBar renk="#31c8b0" satirlar={(veri.tldDagilim || []).map((t) => ({ ad: "." + t.tld, deger: t.adet }))} />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card style={{ ...KART, height: "100%" }} styles={{ body: { padding: 16 } }}>
                <BaslikCizgi ust="Biz-önce kapsamı" alt={(() => { const c = veri.kaynakDagilim?.ct || 0, t = c + (veri.kaynakDagilim?.diger || 0); return t ? `Tespitlerin %${Math.round((c / t) * 100)}'i CT akışından gerçek-zamanlı yakalandı` : "Yakalama kaynağı"; })()} />
                <Donut dilimler={[
                  { ad: "CT akışı · gerçek-zamanlı", deger: veri.kaynakDagilim?.ct || 0, renk: "#31c8b0" },
                  { ad: "Geçmişe dönük tarama", deger: veri.kaynakDagilim?.diger || 0, renk: "#5b6b7d" },
                ]} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
            {/* Markalar tablosu */}
            <Col xs={24} lg={12}>
              <Card style={KART} styles={{ body: { padding: 14 } }} title={<Text style={{ color: "var(--c-c7d6e6)" }}>İzlenen markalar</Text>}>
                <Table
                  size="small" pagination={false} rowKey="marka" dataSource={veri.markalar}
                  scroll={{ x: "max-content", y: 360 }}
                  columns={[
                    { title: "Marka", dataIndex: "markaAdi", render: (v: string, r: MarkaSat) => {
                      const logo = markaLogoAnahtar(r.marka, 32);
                      return <a onClick={() => router.push(`/mercek?marka=${encodeURIComponent(r.marka)}`)} style={{ color: "var(--c-cfe3f5)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {logo && <img src={logo} alt="" width={18} height={18} style={{ borderRadius: 4, background: "#fff", flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
                        <span>{v || r.marka}</span>
                      </a>;
                    } },
                    { title: "Toplam", dataIndex: "toplam", width: 80, align: "center", render: (v: number) => <Text strong style={{ color: "var(--c-e6eef7)" }}>{v}</Text> },
                    { title: "Aktif", dataIndex: "aktif", width: 70, align: "center", render: (v: number) => v ? <Tag color="error" style={{ margin: 0 }}>{v}</Tag> : <Text type="secondary">–</Text> },
                    { title: "Canlı", dataIndex: "canli", width: 70, align: "center", render: (v: number) => <Text style={{ color: "var(--c-4d9fe0)" }}>{v}</Text> },
                    { title: "Son", dataIndex: "sonZaman", width: 100, render: (v: number) => <Text style={{ fontSize: 11, color: "var(--c-8fb0d4)" }}>{gecen(v)}</Text> },
                  ]}
                />
              </Card>
            </Col>
            {/* Son tespitler */}
            <Col xs={24} lg={12}>
              <Card style={KART} styles={{ body: { padding: 14 } }} title={<Text style={{ color: "var(--c-c7d6e6)" }}>Son tespitler (tüm markalar)</Text>}>
                <Table
                  size="small" pagination={false} rowKey={(r: Son) => r.domain} dataSource={veri.sonlar}
                  scroll={{ x: "max-content", y: 360 }}
                  columns={[
                    { title: "Domain", dataIndex: "domain", ellipsis: true, render: (v: string) => <a href={`/sorgula?q=${encodeURIComponent(v)}`} target="_blank" rel="noreferrer" style={{ color: "var(--c-ff9aa4)", fontFamily: "monospace", fontSize: 12 }}>{v}</a> },
                    { title: "Marka", dataIndex: "marka", width: 90, ellipsis: true, render: (v: string) => <Text style={{ fontSize: 11, color: "var(--c-8fb0d4)" }}>{v}</Text> },
                    { title: "Skor", dataIndex: "skor", width: 60, align: "center", render: (v: number) => <Tag color={v >= 60 ? "error" : v >= 45 ? "warning" : "default"} style={{ margin: 0 }}>%{v}</Tag> },
                    { title: "Durum", dataIndex: "durum", width: 90, render: (v: string) => v ? <Tag color={durumRenk[v] || "default"} style={{ margin: 0 }}>{durumAd[v] || v}</Tag> : <Text type="secondary">–</Text> },
                    { title: "Zaman", dataIndex: "zaman", width: 100, render: (v: number) => <Text style={{ fontSize: 11, color: "var(--c-5b6b7d)" }}>{gecen(v)}</Text> },
                  ]}
                />
              </Card>
            </Col>
          </Row>

          <div style={{ marginTop: 10 }}>
            <Progress percent={100} showInfo={false} strokeColor="var(--c-12402a)" trailColor="var(--c-17293c)" size="small" />
            <Text style={{ fontSize: 11, color: "var(--c-5b6b7d)" }}>MirLeon Kontrol Odası · sistem-geneli operatör görünümü · veriler 30 sn'de bir tazelenir</Text>
          </div>
        </div>
      )}
    </div>
    </ConfigProvider>
  );
}
