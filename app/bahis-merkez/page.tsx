"use client";

// YASA DIŞI BAHİS — OPERASYON MERKEZİ (Ant Design, Kontrol Odası tarzı). Giriş-kapılı.
// CT akışından canlı yakalanan bahis siteleri + biz-önce (USOM'da yok) + marka dağılımı.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfigProvider, theme, Row, Col, Card, Statistic, Table, Tag, Flex, Button, Spin, Typography, Badge, Progress, Grid } from "antd";
import {
  EyeOutlined, ThunderboltOutlined, GlobalOutlined, LogoutOutlined, FlagOutlined,
  RadarChartOutlined, BarChartOutlined, SafetyCertificateOutlined, AimOutlined,
} from "@ant-design/icons";
import { markaDinle, cikis } from "@/lib/markaAuth";
import { usePanoTema, antTokenKoyu, antTokenAcik } from "@/lib/panoTema";

const { Text, Title } = Typography;
const fmt = (n: number) => (n || 0).toLocaleString("tr-TR");
const gecen = (t: number) => { if (!t) return "—"; const dk = (Date.now() - t) / 60000; if (dk < 1) return "az önce"; if (dk < 60) return Math.round(dk) + " dk önce"; if (dk < 1440) return Math.round(dk / 60) + " saat önce"; return Math.round(dk / 1440) + " gün önce"; };

type Yakalanan = { domain: string; ca: string; zaman: number; guven: number; isaretler: string[]; tld: string; trHedefli: boolean; usomda: boolean | null; engelli: boolean | null; marka: string | null };
type MarkaSat = { marka: string; sayi: number; son: number; bizOnce: number };
const KART = { background: "var(--c-0b1726)", borderColor: "var(--c-17293c)" } as const;

function usomBildir(domain: string) {
  try { navigator.clipboard?.writeText(domain); } catch { /* pano yok */ }
  window.open("https://www.usom.gov.tr/bildirim", "_blank", "noopener,noreferrer");
}

export default function BahisMerkez() {
  const router = useRouter();
  const { tema: temaAd, koyu, degistir } = usePanoTema();
  const screens = Grid.useBreakpoint();
  const [oturum, setOturum] = useState<boolean | null>(null);
  const [hesapAdi, setHesapAdi] = useState("");
  const [liste, setListe] = useState<Yakalanan[] | null>(null);
  const [markalar, setMarkalar] = useState<MarkaSat[]>([]);
  const [ist, setIst] = useState({ toplam: 0, bizOnce: 0, engelliSayi: 0, trSayi: 0, markaVar: 0, tarandi: 0 });
  const durdu = useRef(false);

  useEffect(() => markaDinle((user, hesap) => {
    if (!user) { setOturum(false); router.replace("/marka-giris"); return; }
    setOturum(true); setHesapAdi(hesap?.ad || hesap?.marka || "Operatör");
  }), [router]);

  useEffect(() => {
    if (!oturum) return;
    durdu.current = false;
    async function cek() {
      try {
        const d = await (await fetch("/api/bahis", { cache: "no-store" })).json();
        if (durdu.current) return;
        setListe(Array.isArray(d.liste) ? d.liste : []);
        setMarkalar(Array.isArray(d.markaDagilim) ? d.markaDagilim : []);
        setIst((p) => ({ toplam: d.toplam || 0, bizOnce: d.bizOnce || 0, engelliSayi: d.engelliSayi || 0, trSayi: d.trSayi || 0, markaVar: d.markaVar || 0, tarandi: p.tarandi + (d.tarandi || 0) }));
      } catch { if (!durdu.current) setListe((l) => l ?? []); }
    }
    cek(); const t = setInterval(cek, 7000);
    return () => { durdu.current = true; clearInterval(t); };
  }, [oturum]);

  const antTema = { algorithm: koyu ? theme.darkAlgorithm : theme.defaultAlgorithm, token: koyu ? antTokenKoyu : antTokenAcik };
  const durumTag = (y: Yakalanan) =>
    y.engelli === true ? <Tag color="default" icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }}>block</span>} style={{ margin: 0 }}>engelli</Tag>
    : y.usomda === false ? <Tag color="success" style={{ margin: 0 }}>biz-önce</Tag>
    : y.usomda === true ? <Tag style={{ margin: 0 }}>USOM&apos;da</Tag>
    : <Tag color="default" style={{ margin: 0 }}>sorgulanıyor</Tag>;

  return (
    <ConfigProvider theme={antTema}>
    <div className="pano" data-tema={temaAd}>
      {oturum === null || (oturum && liste === null) ? (
        <Flex vertical align="center" justify="center" gap={14} style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--c-080f1a)", color: "var(--c-8fa6bd)" }}><Spin size="large" /><span>Bahis operasyon merkezi yükleniyor…</span></Flex>
      ) : (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, overflowY: "auto", background: "var(--c-080f1a)", padding: "16px 20px 40px", fontFamily: "'IBM Plex Sans',sans-serif" }}>
          {/* Üst bar */}
          <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 18, rowGap: 10 }}>
            <Flex align="center" gap={12} wrap style={{ rowGap: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={koyu ? "/mirleon-white.svg" : "/mirleon.svg"} alt="MirLeon" style={{ height: 22 }} />
              <span style={{ width: 1, height: 20, background: "var(--c-1f3652)" }} />
              <div>
                <Title level={4} style={{ margin: 0, color: "var(--c-e6eef7)" }}>Yasa Dışı Bahis — Operasyon Merkezi</Title>
                <Text style={{ fontSize: 12, color: "var(--c-5b6b7d)" }}>CT akışından canlı yakalanan bahis siteleri · USOM&apos;da olmayan = biz-önce</Text>
              </div>
              <Badge status="processing" color="var(--c-31c8b0)" text={<Text style={{ color: "var(--c-31c8b0)", fontFamily: "monospace", fontSize: 11 }}>LIVE</Text>} />
            </Flex>
            <Flex gap={8} wrap style={{ rowGap: 8 }}>
              <Button onClick={degistir} title={koyu ? "Açık tema" : "Koyu tema"} style={{ color: "var(--c-8fa6bd)" }}
                icon={<span className="material-symbols-outlined" style={{ fontSize: 17, lineHeight: 1 }}>{koyu ? "light_mode" : "dark_mode"}</span>} />
              <Button icon={<RadarChartOutlined />} onClick={() => router.push("/kontrol")} style={{ color: "var(--c-8fa6bd)" }}>Kontrol Odası</Button>
              <Button icon={<BarChartOutlined />} onClick={() => router.push("/mercek")} style={{ color: "var(--c-8fa6bd)" }}>Kokpit</Button>
              <Button icon={<LogoutOutlined />} onClick={() => { cikis(); router.replace("/marka-giris"); }} style={{ color: "var(--c-8fa6bd)" }}>Çıkış ({hesapAdi})</Button>
            </Flex>
          </Flex>

          {/* KPI */}
          <Row gutter={[14, 14]}>
            {[
              { t: "İzlenen Sertifika", v: fmt(ist.tarandi), i: <EyeOutlined />, c: "var(--c-4d9fe0)" },
              { t: "Yakalanan Bahis", v: fmt(ist.toplam), i: <AimOutlined />, c: "var(--c-4d9fe0)" },
              { t: "USOM'da yok · biz-önce", v: fmt(ist.bizOnce), i: <ThunderboltOutlined />, c: "var(--c-3ee08a)" },
              { t: "Zaten engelli (BTK)", v: fmt(ist.engelliSayi), i: <SafetyCertificateOutlined />, c: "var(--c-8fb0d4)" },
              { t: "Türkiye hedefli", v: fmt(ist.trSayi), i: <GlobalOutlined />, c: "var(--c-f5222d)" },
              { t: "Bilinen marka", v: fmt(ist.markaVar), i: <SafetyCertificateOutlined />, c: "var(--c-faad14)" },
            ].map((k) => (
              <Col key={k.t} {...(screens.md ? { flex: "1" } : { xs: 12, sm: 8 })}>
                <Card size="small" style={KART} styles={{ body: { padding: "12px 14px" } }}>
                  <Statistic title={<Text style={{ fontSize: 11, color: "var(--c-8fa6bd)" }}>{k.t}</Text>} value={k.v} prefix={<span style={{ color: k.c, marginRight: 4 }}>{k.i}</span>} valueStyle={{ color: k.c, fontSize: 20, fontWeight: 700 }} />
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
            {/* Marka dağılımı */}
            <Col xs={24} lg={8}>
              <Card style={KART} styles={{ body: { padding: 14 } }} title={<Text style={{ color: "var(--c-c7d6e6)" }}>Yakalanan bahis markaları</Text>}>
                <Table
                  size="small" pagination={false} rowKey="marka" dataSource={markalar}
                  scroll={{ x: "max-content", y: 440 }}
                  locale={{ emptyText: <Text type="secondary">Marka eşleşmesi bekleniyor…</Text> }}
                  columns={[
                    { title: "Marka", dataIndex: "marka", render: (v: string) => <Text style={{ color: "var(--c-cfe3f5)", fontFamily: "monospace", fontSize: 12 }}>{v}</Text> },
                    { title: "Adet", dataIndex: "sayi", width: 64, align: "center", render: (v: number) => <Text strong style={{ color: "var(--c-e6eef7)" }}>{v}</Text> },
                    { title: "Biz-önce", dataIndex: "bizOnce", width: 80, align: "center", render: (v: number) => v ? <Tag color="success" style={{ margin: 0 }}>{v}</Tag> : <Text type="secondary">–</Text> },
                    { title: "Son", dataIndex: "son", width: 90, render: (v: number) => <Text style={{ fontSize: 11, color: "var(--c-8fb0d4)" }}>{gecen(v)}</Text> },
                  ]}
                />
              </Card>
            </Col>
            {/* Canlı tespit akışı */}
            <Col xs={24} lg={16}>
              <Card style={KART} styles={{ body: { padding: 14 } }} title={<Flex justify="space-between" align="center"><Text style={{ color: "var(--c-c7d6e6)" }}>Canlı tespit akışı</Text><Text style={{ fontSize: 11, color: "var(--c-5b6b7d)" }}>7 sn&apos;de tazelenir</Text></Flex>}>
                <Table
                  size="small" pagination={false} rowKey="domain" dataSource={liste || []}
                  scroll={{ x: "max-content", y: 440 }}
                  rowClassName={(r: Yakalanan) => (Date.now() - r.zaman < 45000 ? "bahis-yeni" : "")}
                  locale={{ emptyText: <Text type="secondary">Akış taranıyor…</Text> }}
                  columns={[
                    { title: "Domain", dataIndex: "domain", ellipsis: true, render: (v: string) => <a href={`/sorgula?q=${encodeURIComponent(v)}`} target="_blank" rel="noreferrer" style={{ color: "var(--c-ff9aa4)", fontFamily: "monospace", fontSize: 12 }}>{v}</a> },
                    { title: "Marka", dataIndex: "marka", width: 100, ellipsis: true, render: (v: string | null) => v ? <Text style={{ fontSize: 11, color: "var(--c-f6c877)" }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text> },
                    { title: "Güven", dataIndex: "guven", width: 64, align: "center", render: (v: number) => <Tag color={v >= 85 ? "error" : v >= 70 ? "warning" : "default"} style={{ margin: 0 }}>%{v}</Tag> },
                    { title: "Durum", key: "durum", width: 96, render: (_: unknown, r: Yakalanan) => durumTag(r) },
                    { title: "TR", dataIndex: "trHedefli", width: 44, align: "center", render: (v: boolean) => v ? <span title="Türkiye hedefli">🇹🇷</span> : null },
                    { title: "Zaman", dataIndex: "zaman", width: 90, render: (v: number) => <Text style={{ fontSize: 11, color: "var(--c-5b6b7d)" }}>{gecen(v)}</Text> },
                    { title: "", key: "aksiyon", width: 44, align: "center", render: (_: unknown, r: Yakalanan) => (r.usomda === false && r.engelli !== true) ? <Button size="small" type="text" title="USOM'a bildir (alan adı kopyalanır)" onClick={() => usomBildir(r.domain)} icon={<FlagOutlined style={{ color: "var(--c-3ee08a)" }} />} /> : null },
                  ]}
                />
              </Card>
            </Col>
          </Row>

          <div style={{ marginTop: 10 }}>
            <Progress percent={100} showInfo={false} strokeColor="var(--c-12402a)" trailColor="var(--c-17293c)" size="small" />
            <Text style={{ fontSize: 11, color: "var(--c-5b6b7d)" }}>MirLeon · yasa dışı bahis operasyon merkezi · CT akışı canlı taranır, her tespit USOM siciline sorulur. &quot;Hepsi&quot; değil — akıştan yakalanan.</Text>
          </div>
        </div>
      )}
      <style>{`.bahis-yeni td { background: var(--c-0e2f1e) !important; }`}</style>
    </div>
    </ConfigProvider>
  );
}
