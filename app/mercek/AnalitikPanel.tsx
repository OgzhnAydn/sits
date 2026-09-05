"use client";

// ANALİTİK PANEL — kokpitin (/mercek) İÇİNDE bir görünüm (ayrı sayfa/URL değil).
// TÜM veri /api/marka-panel'den (gerçek saklı veri). ConfigProvider/tema kokpitten gelir.
import { useEffect, useState } from "react";
import { Row, Col, Card, Statistic, Tag, Empty, Spin, Typography, Flex, Progress } from "antd";
import {
  EyeOutlined, ThunderboltOutlined, SafetyCertificateOutlined, GlobalOutlined, ClusterOutlined,
  RiseOutlined, ClockCircleOutlined, DashboardOutlined, AppleOutlined, CheckCircleOutlined, WarningOutlined, NotificationOutlined, GoogleOutlined,
} from "@ant-design/icons";

const { Text } = Typography;
const fmt = (n: number) => (n || 0).toLocaleString("tr-TR");
type Say = { ad: string; sayi: number };
type Panel = {
  marka: string; toplam: number; gunluk: number; haftalik: number; aylik: number;
  tempo: { gun: string; sayi: number }[]; saatDagilim: number[];
  durum: Record<string, number>; riskHist: { aralik: string; sayi: number }[];
  kaynak: Record<string, number>; tld: Say[];
  ortak: { ip: Say[]; asn: Say[]; ca: Say[]; ulke: Say[]; takip: Say[] };
  kume: { tld: string; adet: number } | null;
  yukselmeler: { domain: string; sebep: string[]; t: number; simdikiRisk: number }[];
  saglik: { sonTespit: number; buGun: number; intelKapsam: number };
  erkenlik: { toplam: number; bizOnce: number; usomdaYok: number; usomOnce: number };
  tespitHizi: { adet: number; enHizli: number; gunIci: number } | null;
};
// ms → insanca süre (dk/saat/gün)
const sure = (ms: number) => {
  const dk = ms / 60000;
  if (dk < 60) return Math.round(dk) + " dk";
  const sa = dk / 60;
  if (sa < 48) return sa.toFixed(sa < 10 ? 1 : 0) + " saat";
  return Math.round(sa / 24) + " gün";
};

const DURUM_RENK: Record<string, string> = { "aktif-tuzak": "#f5222d", "canli": "#4d9fe0", "park": "#8c8c8c", "yayinda-degil": "#495a6e", "belirsiz": "#5b6b7d" };
const DURUM_AD: Record<string, string> = { "aktif-tuzak": "Aktif tuzak", "canli": "Canlı", "park": "Park / izlemede", "yayinda-degil": "Yayında değil", "belirsiz": "Belirsiz" };
const gecenSure = (t: number) => { if (!t) return "—"; const dk = (Date.now() - t) / 60000; if (dk < 60) return Math.round(dk) + " dk önce"; if (dk < 1440) return Math.round(dk / 60) + " saat önce"; return Math.round(dk / 1440) + " gün önce"; };
const KART = { background: "#0b1726", borderColor: "#17293c" } as const;

function Baslik({ ikon, children }: { ikon: React.ReactNode; children: React.ReactNode }) {
  return <Flex align="center" gap={8} style={{ marginBottom: 14 }}><span style={{ color: "#4d9fe0" }}>{ikon}</span><Text strong style={{ fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase", color: "#c7d6e6" }}>{children}</Text></Flex>;
}
function TempoBar({ veri }: { veri: { gun: string; sayi: number }[] }) {
  const max = Math.max(1, ...veri.map((v) => v.sayi));
  return (
    <div>
      <Flex align="flex-end" gap={2} style={{ height: 130 }}>
        {veri.map((v, i) => (
          <div key={i} title={`${v.gun}: ${v.sayi}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ height: `${(v.sayi / max) * 100}%`, minHeight: v.sayi ? 3 : 0, background: "linear-gradient(180deg,#4d9fe0,#2a6aa8)", borderRadius: "3px 3px 0 0" }} />
          </div>
        ))}
      </Flex>
      <Flex justify="space-between" style={{ marginTop: 6 }}>
        <Text style={{ fontSize: 10, color: "#5b6b7d" }}>{veri[0]?.gun}</Text>
        <Text style={{ fontSize: 10, color: "#5b6b7d" }}>{veri[Math.floor(veri.length / 2)]?.gun}</Text>
        <Text style={{ fontSize: 10, color: "#5b6b7d" }}>{veri[veri.length - 1]?.gun}</Text>
      </Flex>
    </div>
  );
}
function Donut({ veri }: { veri: Record<string, number> }) {
  const parcalar = Object.entries(veri).sort((a, b) => b[1] - a[1]);
  const toplam = parcalar.reduce((s, [, v]) => s + v, 0) || 1;
  const r = 52, c = 2 * Math.PI * r; let ofset = 0;
  return (
    <Flex align="center" gap={20} wrap>
      <svg width={130} height={130} viewBox="0 0 130 130">
        <circle cx={65} cy={65} r={r} fill="none" stroke="#17293c" strokeWidth={16} />
        {parcalar.map(([k, v], i) => { const uz = (v / toplam) * c; const el = <circle key={i} cx={65} cy={65} r={r} fill="none" stroke={DURUM_RENK[k] || "#5b6b7d"} strokeWidth={16} strokeDasharray={`${uz} ${c - uz}`} strokeDashoffset={-ofset} transform="rotate(-90 65 65)" />; ofset += uz; return el; })}
        <text x={65} y={61} textAnchor="middle" fill="#e6eef7" fontSize={22} fontWeight={700}>{fmt(toplam)}</text>
        <text x={65} y={78} textAnchor="middle" fill="#5b6b7d" fontSize={10}>toplam</text>
      </svg>
      <Flex vertical gap={6} style={{ flex: 1, minWidth: 130 }}>
        {parcalar.map(([k, v]) => (
          <Flex key={k} align="center" gap={8}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: DURUM_RENK[k] || "#5b6b7d" }} />
            <Text style={{ fontSize: 12, color: "#c7d6e6", flex: 1 }}>{DURUM_AD[k] || k}</Text>
            <Text strong style={{ fontSize: 12, color: "#e6eef7" }}>{v}</Text>
          </Flex>
        ))}
      </Flex>
    </Flex>
  );
}
function YatayBar({ veri, renk = "#4d9fe0", bos = "Henüz veri yok" }: { veri: Say[]; renk?: string; bos?: string }) {
  if (!veri.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text style={{ color: "#5b6b7d", fontSize: 12 }}>{bos}</Text>} />;
  const max = Math.max(1, ...veri.map((v) => v.sayi));
  return (
    <Flex vertical gap={9}>
      {veri.map((v, i) => (
        <div key={i}>
          <Flex justify="space-between" style={{ marginBottom: 3 }}>
            <Text style={{ fontSize: 12, color: "#c7d6e6", maxWidth: "78%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.ad}>{v.ad}</Text>
            <Text strong style={{ fontSize: 12, color: "#e6eef7" }}>{v.sayi}</Text>
          </Flex>
          <div style={{ height: 6, background: "#17293c", borderRadius: 4 }}><div style={{ width: `${(v.sayi / max) * 100}%`, height: "100%", background: renk, borderRadius: 4 }} /></div>
        </div>
      ))}
    </Flex>
  );
}
function SaatIsi({ veri }: { veri: number[] }) {
  const max = Math.max(1, ...veri);
  return (
    <div>
      <Flex gap={3} wrap>
        {veri.map((v, s) => (
          <Flex key={s} vertical align="center" gap={3} style={{ flex: "1 0 3.2%" }}>
            <div title={`${s}:00 — ${v} tespit`} style={{ width: "100%", height: 26, borderRadius: 4, background: v ? `rgba(77,159,224,${0.15 + 0.85 * (v / max)})` : "#17293c" }} />
            {s % 3 === 0 && <Text style={{ fontSize: 9, color: "#5b6b7d" }}>{s}</Text>}
          </Flex>
        ))}
      </Flex>
      <Text style={{ fontSize: 11, color: "#5b6b7d" }}>Saat bazında yeni tespit yoğunluğu (UTC)</Text>
    </div>
  );
}

type AppBulgu = { platform: string; ad: string; gelistirici: string; paket: string; url: string; ikon?: string; puan?: number; sayi?: number; ulke: string; resmiMi: boolean; durum: string };
type AppSonuc = { markaAdi: string; sonuc: AppBulgu[]; toplam: number; resmi: number; incele: number; not?: string };
type Reklam = { reklamveren: string; baslik?: string; metin?: string; hedefAlan?: string; snapshot?: string; baslangic?: string; platformlar?: string[]; supheli: boolean };
type ReklamSonuc = { yapilandirildi: boolean; reklamlar: Reklam[]; supheli: number; not: string };
type GReklam = { reklamveren: string; yasal?: string; konum?: string; dogrulama: string; url?: string; supheli: boolean };
type GReklamSonuc = { yapilandirildi: boolean; reklamlar: GReklam[]; supheli: number; guncelleme: number; not: string };

export default function AnalitikPanel({ marka }: { marka: string }) {
  const [veri, setVeri] = useState<Panel | null>(null);
  const [yuk, setYuk] = useState(true);
  const [app, setApp] = useState<AppSonuc | null>(null);
  useEffect(() => {
    if (!marka) { setYuk(false); return; }
    let durdu = false;
    async function cek() {
      try { const j = await (await fetch(`/api/marka-panel?marka=${encodeURIComponent(marka)}`, { cache: "no-store" })).json(); if (!durdu && !j.hata) { setVeri(j); setYuk(false); } }
      catch { if (!durdu) setYuk(false); }
    }
    cek(); const t = setInterval(cek, 60000); return () => { durdu = true; clearInterval(t); };
  }, [marka]);
  const [reklam, setReklam] = useState<ReklamSonuc | null>(null);
  // Mobil uygulama + reklam taraması — bir kez çek.
  useEffect(() => {
    if (!marka) return;
    let durdu = false;
    (async () => {
      try { const j = await (await fetch(`/api/app-tara?marka=${encodeURIComponent(marka)}`, { cache: "no-store" })).json(); if (!durdu && !j.hata) setApp(j); } catch { /* sessiz */ }
    })();
    (async () => {
      try { const j = await (await fetch(`/api/reklam-tara?marka=${encodeURIComponent(marka)}`, { cache: "no-store" })).json(); if (!durdu && !j.hata) setReklam(j); } catch { /* sessiz */ }
    })();
    (async () => {
      try { const j = await (await fetch(`/api/google-reklam?marka=${encodeURIComponent(marka)}`, { cache: "no-store" })).json(); if (!durdu && !j.hata) setGreklam(j); } catch { /* sessiz */ }
    })();
    return () => { durdu = true; };
  }, [marka]);
  const [greklam, setGreklam] = useState<GReklamSonuc | null>(null);

  if (!marka) return <Card style={KART}><Empty description={<Text style={{ color: "#8fa6bd" }}>Analitik panel marka-kilitli bir hesap gerektirir.</Text>} /></Card>;
  if (yuk && !veri) return <Flex align="center" justify="center" style={{ minHeight: 300 }}><Spin tip="Panel yükleniyor…"><div style={{ padding: 40 }} /></Spin></Flex>;
  if (!veri) return <Card style={KART}><Text style={{ color: "#8fa6bd" }}>Panel verisi alınamadı.</Text></Card>;

  return (
    <Flex vertical gap={12}>
      {/* KPI şeridi */}
      <Row gutter={[12, 12]}>
        {[
          { t: "Toplam Gözlem", v: veri.toplam, i: <EyeOutlined />, c: "#4d9fe0" },
          { t: "Bugün", v: veri.saglik.buGun, i: <ThunderboltOutlined />, c: "#52c41a" },
          { t: "Bu Hafta", v: veri.haftalik, i: <RiseOutlined />, c: "#4d9fe0" },
          { t: "Bu Ay", v: veri.aylik, i: <DashboardOutlined />, c: "#4d9fe0" },
          { t: "Aktif Tuzak", v: veri.durum["aktif-tuzak"] || 0, i: <ThunderboltOutlined />, c: "#f5222d" },
          { t: "Canlı", v: veri.durum["canli"] || 0, i: <GlobalOutlined />, c: "#4d9fe0" },
          { t: "USOM'da Yok", v: veri.erkenlik.usomdaYok, i: <SafetyCertificateOutlined />, c: "#f2a33c" },
        ].map((k) => (
          <Col key={k.t} xs={12} sm={8} md={6} lg={3} flex="1">
            <Card size="small" styles={{ body: { padding: "10px 12px" } }} style={KART}>
              <Statistic title={<Text style={{ fontSize: 11, color: "#8fa6bd" }}>{k.t}</Text>} value={k.v} prefix={<span style={{ color: k.c, marginRight: 4 }}>{k.i}</span>} valueStyle={{ color: k.c, fontSize: 20, fontWeight: 700 }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Tempo + Saat ısı */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={16}><Card style={KART} styles={{ body: { padding: 18 } }}><Baslik ikon={<RiseOutlined />}>Tespit temposu — son 30 gün</Baslik><TempoBar veri={veri.tempo} /></Card></Col>
        <Col xs={24} lg={8}><Card style={KART} styles={{ body: { padding: 18 } }}><Baslik ikon={<ClockCircleOutlined />}>Saatlik yoğunluk</Baslik><SaatIsi veri={veri.saatDagilim} /></Card></Col>
      </Row>

      {/* Kompozisyon */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={9}><Card style={KART} styles={{ body: { padding: 18 } }}><Baslik ikon={<DashboardOutlined />}>Durum dağılımı</Baslik><Donut veri={veri.durum} /></Card></Col>
        <Col xs={24} sm={12} lg={8}>
          <Card style={KART} styles={{ body: { padding: 18 } }}>
            <Baslik ikon={<SafetyCertificateOutlined />}>Güven dağılımı</Baslik>
            <Flex align="flex-end" gap={10} style={{ height: 130 }}>
              {veri.riskHist.map((r) => {
                const max = Math.max(1, ...veri.riskHist.map((x) => x.sayi));
                const renk = r.aralik === "80-100" || r.aralik === "60-80" ? "#f5222d" : r.aralik === "40-60" ? "#fa8c16" : "#5b6b7d";
                return (
                  <Flex key={r.aralik} vertical align="center" justify="flex-end" style={{ flex: 1, height: "100%" }}>
                    <Text style={{ fontSize: 11, color: "#e6eef7" }}>{r.sayi}</Text>
                    <div style={{ width: "100%", height: `${(r.sayi / max) * 88}%`, minHeight: r.sayi ? 3 : 0, background: renk, borderRadius: "4px 4px 0 0" }} />
                    <Text style={{ fontSize: 10, color: "#5b6b7d", marginTop: 4 }}>{r.aralik}</Text>
                  </Flex>
                );
              })}
            </Flex>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={7}><Card style={KART} styles={{ body: { padding: 18 } }}><Baslik ikon={<EyeOutlined />}>Tespit kaynağı</Baslik><YatayBar veri={Object.entries(veri.kaynak).map(([ad, sayi]) => ({ ad, sayi })).sort((a, b) => b.sayi - a.sayi)} renk="#7c5cff" /></Card></Col>
      </Row>

      {/* Küme uyarısı */}
      {veri.kume && (
        <Card style={{ ...KART, borderColor: "#3a2a12", background: "#1a1206" }} styles={{ body: { padding: "12px 16px" } }}>
          <Flex align="center" gap={10}><ClusterOutlined style={{ color: "#f2a33c", fontSize: 18 }} /><Text style={{ color: "#f6c877" }}>En büyük tek-operasyon kümesi: <b>{veri.kume.adet} adet .{veri.kume.tld}</b> aynı desende — tekil tehdit değil, tek operasyonun toplu kaydı olarak değerlendirilir.</Text></Flex>
        </Card>
      )}

      {/* ORTAK NOKTA */}
      <Baslik ikon={<ClusterOutlined />}>Ortak nokta &amp; atıf — bu tehditler neyi paylaşıyor</Baslik>
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={8}><Card style={KART} styles={{ body: { padding: 18 } }}><Text strong style={{ color: "#8fa6bd", fontSize: 12 }}>Ortak IP adresleri</Text><div style={{ height: 10 }} /><YatayBar veri={veri.ortak.ip} renk="#f5222d" /></Card></Col>
        <Col xs={24} sm={12} lg={8}><Card style={KART} styles={{ body: { padding: 18 } }}><Text strong style={{ color: "#8fa6bd", fontSize: 12 }}>Ortak ağ (ASN)</Text><div style={{ height: 10 }} /><YatayBar veri={veri.ortak.asn} renk="#fa8c16" /></Card></Col>
        <Col xs={24} sm={12} lg={8}><Card style={KART} styles={{ body: { padding: 18 } }}><Text strong style={{ color: "#8fa6bd", fontSize: 12 }}><GlobalOutlined /> Barındırma ülkesi</Text><div style={{ height: 10 }} /><YatayBar veri={veri.ortak.ulke} renk="#4d9fe0" /></Card></Col>
        <Col xs={24} sm={12} lg={8}><Card style={KART} styles={{ body: { padding: 18 } }}><Text strong style={{ color: "#8fa6bd", fontSize: 12 }}>Sertifika sağlayıcı (CA)</Text><div style={{ height: 10 }} /><YatayBar veri={veri.ortak.ca} renk="#52c41a" /></Card></Col>
        <Col xs={24} sm={12} lg={8}><Card style={KART} styles={{ body: { padding: 18 } }}><Text strong style={{ color: "#8fa6bd", fontSize: 12 }}>En çok kötüye kullanılan uzantı</Text><div style={{ height: 10 }} /><YatayBar veri={veri.tld} renk="#7c5cff" /></Card></Col>
        <Col xs={24} sm={12} lg={8}><Card style={KART} styles={{ body: { padding: 18 } }}><Text strong style={{ color: "#8fa6bd", fontSize: 12 }}>Ortak takip kimliği (operatör)</Text><div style={{ height: 10 }} /><YatayBar veri={veri.ortak.takip} renk="#eb2f96" bos="Henüz takip kimliği eşleşmesi yok (yeni taramalarla dolar)" /></Card></Col>
      </Row>

      {/* Mobil uygulama taraması (iOS App Store) */}
      {app && (
        <Card style={KART} styles={{ body: { padding: 18 } }}>
          <Flex align="center" justify="space-between" style={{ marginBottom: 14 }}>
            <Baslik ikon={<AppleOutlined />}>Mobil uygulama taraması — iOS + Android</Baslik>
            <Flex gap={8}>
              <Tag color={app.incele ? "error" : "default"} style={{ margin: 0 }}>{app.incele} incelenecek</Tag>
              <Tag color="success" style={{ margin: 0 }}>{app.resmi} resmî</Tag>
            </Flex>
          </Flex>
          {app.toplam === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text style={{ color: "#5b6b7d", fontSize: 12 }}>App Store’da bu markayı taşıyan uygulama bulunmadı.</Text>} />
          ) : (
            <Flex vertical gap={8}>
              {app.sonuc.slice(0, 10).map((a) => (
                <a key={a.paket} href={a.url} target="_blank" rel="noreferrer"
                  className="app-satir" style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", border: "1px solid #17293c", borderRadius: 10, borderLeft: `3px solid ${a.resmiMi ? "#3ee08a" : "#f5222d"}`, textDecoration: "none" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.ikon ? <img src={a.ikon} alt="" style={{ width: 34, height: 34, borderRadius: 8 }} /> : <span style={{ width: 34, height: 34, borderRadius: 8, background: "#12283f" }} />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text style={{ color: "#e6eef7", fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.ad}</Text>
                    <Text style={{ color: "#8fb0d4", fontSize: 11 }}><span style={{ color: a.platform === "ios" ? "#c7d6e6" : "#3ee08a", fontWeight: 600 }}>{a.platform === "ios" ? "iOS" : "Android"}</span> · {a.gelistirici}</Text>
                  </div>
                  {a.puan ? <Text style={{ color: "#f2a33c", fontSize: 12, fontWeight: 600 }}>★ {a.puan.toFixed(1)}</Text> : null}
                  {a.resmiMi
                    ? <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0 }}>resmî</Tag>
                    : <Tag icon={<WarningOutlined />} color="error" style={{ margin: 0 }}>incele</Tag>}
                </a>
              ))}
            </Flex>
          )}
          <Text style={{ display: "block", marginTop: 10, fontSize: 11, color: "#5b6b7d" }}>{app.not} “İncele”, marka adını taşıyan ama resmî geliştiriciden olmayan uygulamadır — taklit olabilir, doğrulanmalı.</Text>
        </Card>
      )}

      {/* Reklam izleme (Meta Ad Library) */}
      {reklam && (
        <Card style={KART} styles={{ body: { padding: 18 } }}>
          <Flex align="center" justify="space-between" style={{ marginBottom: reklam.yapilandirildi ? 14 : 0 }}>
            <Baslik ikon={<NotificationOutlined />}>Reklam izleme — Meta (Facebook / Instagram)</Baslik>
            {reklam.yapilandirildi
              ? <Tag color={reklam.supheli ? "error" : "success"} style={{ margin: 0 }}>{reklam.supheli} şüpheli reklam</Tag>
              : <Tag style={{ margin: 0 }}>yapılandırılmadı</Tag>}
          </Flex>
          {!reklam.yapilandirildi ? (
            <Text style={{ fontSize: 12, color: "#8fb0d4" }}>{reklam.not}</Text>
          ) : reklam.reklamlar.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text style={{ color: "#5b6b7d", fontSize: 12 }}>{reklam.not}</Text>} />
          ) : (
            <Flex vertical gap={8}>
              {reklam.reklamlar.slice(0, 10).map((r, i) => (
                <a key={i} href={r.snapshot || "#"} target="_blank" rel="noreferrer"
                  style={{ display: "block", padding: "9px 12px", border: "1px solid #17293c", borderRadius: 10, borderLeft: `3px solid ${r.supheli ? "#f5222d" : "#3ee08a"}`, textDecoration: "none" }}>
                  <Flex align="center" justify="space-between" gap={8}>
                    <Text style={{ color: "#e6eef7", fontSize: 13, fontWeight: 600 }}>{r.reklamveren || "—"}</Text>
                    {r.supheli
                      ? <Tag icon={<WarningOutlined />} color="error" style={{ margin: 0 }}>şüpheli</Tag>
                      : <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0 }}>resmî</Tag>}
                  </Flex>
                  {r.baslik && <Text style={{ display: "block", color: "#c7d6e6", fontSize: 12, marginTop: 2 }}>{r.baslik}</Text>}
                  <Flex align="center" gap={8} style={{ marginTop: 3 }}>
                    {r.hedefAlan && <Text style={{ color: r.supheli ? "#ff9aa4" : "#8fb0d4", fontSize: 11, fontFamily: "monospace" }}>→ {r.hedefAlan}</Text>}
                    {r.platformlar?.length ? <Text style={{ color: "#5b6b7d", fontSize: 10 }}>{r.platformlar.join(", ")}</Text> : null}
                  </Flex>
                </a>
              ))}
            </Flex>
          )}
        </Card>
      )}

      {/* Reklam izleme (Google Ads Transparency) */}
      {greklam && (
        <Card style={KART} styles={{ body: { padding: 18 } }}>
          <Flex align="center" justify="space-between" style={{ marginBottom: greklam.yapilandirildi && greklam.reklamlar.length ? 14 : 0 }}>
            <Baslik ikon={<GoogleOutlined />}>Reklam izleme — Google Ads</Baslik>
            {greklam.yapilandirildi
              ? <Tag color={greklam.supheli ? "error" : "success"} style={{ margin: 0 }}>{greklam.supheli} doğrulanmamış reklamveren</Tag>
              : <Tag style={{ margin: 0 }}>yapılandırılmadı</Tag>}
          </Flex>
          {!greklam.yapilandirildi ? (
            <Text style={{ fontSize: 12, color: "#8fb0d4" }}>{greklam.not}</Text>
          ) : greklam.reklamlar.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text style={{ color: "#5b6b7d", fontSize: 12 }}>{greklam.not}</Text>} />
          ) : (
            <Flex vertical gap={8}>
              {greklam.reklamlar.slice(0, 12).map((r, i) => (
                <div key={i} style={{ padding: "9px 12px", border: "1px solid #17293c", borderRadius: 10, borderLeft: `3px solid ${r.supheli ? "#f5222d" : "#3ee08a"}` }}>
                  <Flex align="center" justify="space-between" gap={8}>
                    <Text style={{ color: "#e6eef7", fontSize: 13, fontWeight: 600 }}>{r.reklamveren || "—"}</Text>
                    {r.supheli
                      ? <Tag icon={<WarningOutlined />} color="error" style={{ margin: 0 }}>doğrulanmamış</Tag>
                      : <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0 }}>doğrulanmış</Tag>}
                  </Flex>
                  <Flex align="center" gap={8} style={{ marginTop: 3 }}>
                    {r.yasal ? <Text style={{ color: "#8fb0d4", fontSize: 11 }}>{r.yasal}</Text> : null}
                    {r.konum ? <Text style={{ color: "#5b6b7d", fontSize: 11 }}>· {r.konum}</Text> : null}
                    {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#4d9fe0", fontSize: 11, marginLeft: "auto" }}>reklamı gör →</a> : null}
                  </Flex>
                </div>
              ))}
            </Flex>
          )}
        </Card>
      )}

      {/* Tespit hızı — çıkış (ilk sertifika) → bizim tespit gecikmesi */}
      {veri.tespitHizi && (
        <Card style={{ ...KART, borderColor: "#123a2a", background: "#0a1a14" }} styles={{ body: { padding: 18 } }}>
          <Baslik ikon={<ClockCircleOutlined />}>Tespit hızı — sahte adres doğduktan ne kadar sonra yakaladık</Baslik>
          <Flex gap={28} wrap align="flex-end">
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#3ee08a", lineHeight: 1 }}>{sure(veri.tespitHizi.enHizli)}</div>
              <div style={{ fontSize: 11, color: "#8fb0d4", marginTop: 3 }}>en hızlı yakalama</div>
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#c7d6e6", lineHeight: 1 }}>{veri.tespitHizi.gunIci}<span style={{ fontSize: 14, color: "#5b6b7d" }}>/{veri.tespitHizi.adet}</span></div>
              <div style={{ fontSize: 11, color: "#8fb0d4", marginTop: 3 }}>aynı gün (24 saat içinde) yakalandı</div>
            </div>
            <Text style={{ fontSize: 12, color: "#7d9cbf", flex: 1, minWidth: 200 }}>
              {veri.tespitHizi.adet} gerçek-zamanlı (CertStream) tespitte, sertifikanın alındığı an (çıkış) ile bizim ilk yakaladığımız an arasındaki süre. Sahte adres yayına çıktığı an — çoğu zaman kurbana ulaşmadan — yakalıyoruz.
            </Text>
          </Flex>
        </Card>
      )}

      {/* Yükselmeler + USOM öndelik */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={16}>
          <Card style={KART} styles={{ body: { padding: 18 } }}>
            <Baslik ikon={<ThunderboltOutlined />}>Eyleme geçenler — park/pasifken canlıya dönenler</Baslik>
            {veri.yukselmeler.length ? (
              <Flex vertical gap={10}>
                {veri.yukselmeler.map((y) => (
                  <Flex key={y.domain} align="center" justify="space-between" style={{ padding: "8px 12px", border: "1px solid #17293c", borderRadius: 8 }}>
                    <Flex vertical><Text style={{ color: "#e6eef7", fontFamily: "monospace" }}>{y.domain}</Text><Text style={{ fontSize: 11, color: "#f6a35c" }}>{y.sebep.join(" · ")}</Text></Flex>
                    <Flex align="center" gap={10}><Tag color="error">risk {y.simdikiRisk}</Tag><Text style={{ fontSize: 11, color: "#5b6b7d" }}>{gecenSure(y.t)}</Text></Flex>
                  </Flex>
                ))}
              </Flex>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text style={{ color: "#5b6b7d", fontSize: 12 }}>Henüz eyleme geçen aday yok — sistem izlemeye devam ediyor. Bir aday park→canlı geçtiğinde burada belirir.</Text>} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card style={KART} styles={{ body: { padding: 18 } }}>
            <Baslik ikon={<SafetyCertificateOutlined />}>USOM'dan öndelik</Baslik>
            <Statistic value={veri.erkenlik.usomdaYok} suffix={`/ ${veri.erkenlik.toplam}`} valueStyle={{ color: "#f2a33c", fontWeight: 700 }} />
            <Text style={{ fontSize: 12, color: "#8fa6bd" }}>tespit ulusal listede (USOM) HİÇ yok — resmî radardan önce yakaladık.</Text>
            <div style={{ height: 14 }} />
            <Progress percent={veri.saglik.intelKapsam} strokeColor="#4d9fe0" trailColor="#17293c" format={(p) => <Text style={{ color: "#8fa6bd", fontSize: 12 }}>%{p} veri kapsamı · son tespit {gecenSure(veri.saglik.sonTespit)}</Text>} />
          </Card>
        </Col>
      </Row>
    </Flex>
  );
}
