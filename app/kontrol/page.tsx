"use client";

// KONTROL ODASI — sistem-geneli operatör paneli (Ant Design). Giriş-kapılı.
// Tüm markalar + sistem sağlığı + kanal durumu (iOS/Android/Google/Meta) tek ekranda.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfigProvider, theme, Row, Col, Card, Statistic, Table, Tag, Flex, Button, Spin, Typography, Badge, Progress } from "antd";
import {
  EyeOutlined, ThunderboltOutlined, SafetyCertificateOutlined, GlobalOutlined, LogoutOutlined,
  AppleOutlined, AndroidOutlined, GoogleOutlined, NotificationOutlined, RadarChartOutlined, BarChartOutlined, CheckCircleOutlined, MinusCircleOutlined,
} from "@ant-design/icons";
import { markaDinle, cikis } from "@/lib/markaAuth";

const { Text, Title } = Typography;
const fmt = (n: number) => (n || 0).toLocaleString("tr-TR");
const gecen = (t: number) => { if (!t) return "—"; const dk = (Date.now() - t) / 60000; if (dk < 60) return Math.round(dk) + " dk önce"; if (dk < 1440) return Math.round(dk / 60) + " saat önce"; return Math.round(dk / 1440) + " gün önce"; };

type MarkaSat = { marka: string; markaAdi: string; toplam: number; aktif: number; canli: number; sonZaman: number };
type Son = { domain: string; marka: string; skor: number; durum: string; zaman: number };
type Ozet = {
  ozet: { toplam: number; marka: number; buGun: number; sonTespit: number; aktif: number };
  markalar: MarkaSat[]; sonlar: Son[];
  kanallar: { ios: boolean; android: boolean; google: boolean; meta: boolean };
};
const KART = { background: "#0b1726", borderColor: "#17293c" } as const;
const durumRenk: Record<string, string> = { "aktif-tuzak": "error", "canli": "processing", "park": "default", "yayinda-degil": "default" };
const durumAd: Record<string, string> = { "aktif-tuzak": "aktif tuzak", "canli": "canlı", "park": "park", "yayinda-degil": "pasif" };

export default function KontrolOdasi() {
  const router = useRouter();
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

  const tema = { algorithm: theme.darkAlgorithm, token: { colorPrimary: "#4d9fe0", borderRadius: 12, colorBgLayout: "#080f1a", colorBgContainer: "#0b1726", colorBorderSecondary: "#17293c" } };

  return (
    <ConfigProvider theme={tema}>
      {oturum === null || (oturum && !veri) ? (
        <Flex align="center" justify="center" style={{ height: "100vh", background: "#080f1a" }}><Spin tip="Kontrol odası yükleniyor…"><div style={{ padding: 40 }} /></Spin></Flex>
      ) : !veri ? (
        <Flex align="center" justify="center" style={{ height: "100vh", background: "#080f1a", color: "#8fa6bd" }}>Veri alınamadı.</Flex>
      ) : (
        <div style={{ minHeight: "100vh", background: "#080f1a", padding: "16px 20px 40px", fontFamily: "'IBM Plex Sans',sans-serif" }}>
          {/* Üst bar */}
          <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 18, rowGap: 10 }}>
            <Flex align="center" gap={12} wrap style={{ rowGap: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mirleon-white.svg" alt="MirLeon" style={{ height: 22 }} />
              <span style={{ width: 1, height: 20, background: "#1f3652" }} />
              <div>
                <Title level={4} style={{ margin: 0, color: "#e6eef7" }}>Kontrol Odası</Title>
                <Text style={{ fontSize: 12, color: "#5b6b7d" }}>Sistem-geneli operatör görünümü · son tespit {gecen(veri.ozet.sonTespit)}</Text>
              </div>
              <Badge status="processing" color="#31c8b0" text={<Text style={{ color: "#31c8b0", fontFamily: "monospace", fontSize: 11 }}>LIVE</Text>} />
            </Flex>
            <Flex gap={8}>
              <Button icon={<RadarChartOutlined />} onClick={() => router.push("/mercek")} style={{ color: "#8fa6bd" }}>Kokpit</Button>
              <Button icon={<BarChartOutlined />} onClick={() => router.push("/panel")} style={{ color: "#8fa6bd" }}>Panel</Button>
              <Button icon={<LogoutOutlined />} onClick={() => { cikis(); router.replace("/marka-giris"); }} style={{ color: "#8fa6bd" }}>Çıkış ({hesapAdi})</Button>
            </Flex>
          </Flex>

          {/* KPI */}
          <Row gutter={[14, 14]}>
            {[
              { t: "İzlenen Sertifika", v: toplamCT ? (toplamCT / 1e9).toFixed(2) + " Mr" : "…", i: <EyeOutlined />, c: "#4d9fe0" },
              { t: "Toplam Tespit (son 400)", v: fmt(veri.ozet.toplam), i: <SafetyCertificateOutlined />, c: "#4d9fe0" },
              { t: "Bugün", v: fmt(veri.ozet.buGun), i: <ThunderboltOutlined />, c: "#52c41a" },
              { t: "İzlenen Marka", v: fmt(veri.ozet.marka), i: <GlobalOutlined />, c: "#4d9fe0" },
              { t: "Aktif Tuzak", v: fmt(veri.ozet.aktif), i: <ThunderboltOutlined />, c: "#f5222d" },
            ].map((k) => (
              <Col key={k.t} xs={12} sm={8} lg={4} flex="1">
                <Card size="small" style={KART} styles={{ body: { padding: "12px 14px" } }}>
                  <Statistic title={<Text style={{ fontSize: 11, color: "#8fa6bd" }}>{k.t}</Text>} value={k.v} prefix={<span style={{ color: k.c, marginRight: 4 }}>{k.i}</span>} valueStyle={{ color: k.c, fontSize: 20, fontWeight: 700 }} />
                </Card>
              </Col>
            ))}
          </Row>

          {/* Kanal durumu */}
          <Card style={{ ...KART, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
            <Text strong style={{ color: "#c7d6e6", fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase" }}>Kanal durumu</Text>
            <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
              {[
                { ad: "iOS App Store", aktif: veri.kanallar.ios, ikon: <AppleOutlined /> },
                { ad: "Android Play", aktif: veri.kanallar.android, ikon: <AndroidOutlined /> },
                { ad: "Google Ads", aktif: veri.kanallar.google, ikon: <GoogleOutlined /> },
                { ad: "Meta reklam", aktif: veri.kanallar.meta, ikon: <NotificationOutlined /> },
              ].map((k) => (
                <Col key={k.ad} xs={12} sm={6}>
                  <Flex align="center" gap={10} style={{ padding: "10px 12px", border: `1px solid ${k.aktif ? "#12402a" : "#2a2f38"}`, borderRadius: 10, background: k.aktif ? "#0a1a12" : "#0d131c" }}>
                    <span style={{ color: k.aktif ? "#3ee08a" : "#5b6b7d", fontSize: 18 }}>{k.ikon}</span>
                    <div style={{ flex: 1 }}>
                      <Text style={{ color: "#e6eef7", fontSize: 13, display: "block" }}>{k.ad}</Text>
                      <Text style={{ fontSize: 11, color: k.aktif ? "#3ee08a" : "#8a97a5" }}>{k.aktif ? "canlı" : "yapılandırılmadı"}</Text>
                    </div>
                    {k.aktif ? <CheckCircleOutlined style={{ color: "#3ee08a" }} /> : <MinusCircleOutlined style={{ color: "#5b6b7d" }} />}
                  </Flex>
                </Col>
              ))}
            </Row>
          </Card>

          <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
            {/* Markalar tablosu */}
            <Col xs={24} lg={12}>
              <Card style={KART} styles={{ body: { padding: 14 } }} title={<Text style={{ color: "#c7d6e6" }}>İzlenen markalar</Text>}>
                <Table
                  size="small" pagination={false} rowKey="marka" dataSource={veri.markalar}
                  scroll={{ x: "max-content", y: 360 }}
                  columns={[
                    { title: "Marka", dataIndex: "markaAdi", render: (v: string, r: MarkaSat) => <a onClick={() => router.push("/mercek")} style={{ color: "#cfe3f5" }}>{v || r.marka}</a> },
                    { title: "Toplam", dataIndex: "toplam", width: 80, align: "center", render: (v: number) => <Text strong style={{ color: "#e6eef7" }}>{v}</Text> },
                    { title: "Aktif", dataIndex: "aktif", width: 70, align: "center", render: (v: number) => v ? <Tag color="error" style={{ margin: 0 }}>{v}</Tag> : <Text type="secondary">–</Text> },
                    { title: "Canlı", dataIndex: "canli", width: 70, align: "center", render: (v: number) => <Text style={{ color: "#4d9fe0" }}>{v}</Text> },
                    { title: "Son", dataIndex: "sonZaman", width: 100, render: (v: number) => <Text style={{ fontSize: 11, color: "#8fb0d4" }}>{gecen(v)}</Text> },
                  ]}
                />
              </Card>
            </Col>
            {/* Son tespitler */}
            <Col xs={24} lg={12}>
              <Card style={KART} styles={{ body: { padding: 14 } }} title={<Text style={{ color: "#c7d6e6" }}>Son tespitler (tüm markalar)</Text>}>
                <Table
                  size="small" pagination={false} rowKey={(r: Son) => r.domain} dataSource={veri.sonlar}
                  scroll={{ x: "max-content", y: 360 }}
                  columns={[
                    { title: "Domain", dataIndex: "domain", ellipsis: true, render: (v: string) => <a href={`/sorgula?q=${encodeURIComponent(v)}`} target="_blank" rel="noreferrer" style={{ color: "#ff9aa4", fontFamily: "monospace", fontSize: 12 }}>{v}</a> },
                    { title: "Marka", dataIndex: "marka", width: 90, ellipsis: true, render: (v: string) => <Text style={{ fontSize: 11, color: "#8fb0d4" }}>{v}</Text> },
                    { title: "Skor", dataIndex: "skor", width: 60, align: "center", render: (v: number) => <Tag color={v >= 60 ? "error" : v >= 45 ? "warning" : "default"} style={{ margin: 0 }}>%{v}</Tag> },
                    { title: "Durum", dataIndex: "durum", width: 90, render: (v: string) => v ? <Tag color={durumRenk[v] || "default"} style={{ margin: 0 }}>{durumAd[v] || v}</Tag> : <Text type="secondary">–</Text> },
                    { title: "Zaman", dataIndex: "zaman", width: 100, render: (v: number) => <Text style={{ fontSize: 11, color: "#5b6b7d" }}>{gecen(v)}</Text> },
                  ]}
                />
              </Card>
            </Col>
          </Row>

          <div style={{ marginTop: 10 }}>
            <Progress percent={100} showInfo={false} strokeColor="#12402a" trailColor="#17293c" size="small" />
            <Text style={{ fontSize: 11, color: "#5b6b7d" }}>MirLeon Kontrol Odası · sistem-geneli operatör görünümü · veriler 30 sn'de bir tazelenir</Text>
          </div>
        </div>
      )}
    </ConfigProvider>
  );
}
