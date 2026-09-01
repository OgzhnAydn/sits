"use client";

// SİBER MERCEK — marka tehdit istihbarat kokpiti (Ant Design + GERÇEK veri).
// Giriş kapılı + marka kilidi. Sensör/akış ← /api/ct-akis, adaylar ← /api/marka-adaylari,
// seçilen varlık ← /api/osint. antd: Card/Statistic/Progress/Table/Tag/Descriptions/Segmented.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ConfigProvider, theme, Row, Col, Card, Statistic, Progress, Table, Tag, Segmented,
  Button, Descriptions, Avatar, Flex, Badge, Empty, Spin, Typography, Space,
} from "antd";
import {
  EyeOutlined, SafetyCertificateOutlined, SearchOutlined, ClusterOutlined, ThunderboltOutlined,
  ExportOutlined, FileSearchOutlined, LogoutOutlined, BellOutlined, GlobalOutlined,
} from "@ant-design/icons";
import { markaDinle, cikis } from "@/lib/markaAuth";

const { Text, Title } = Typography;

type AkisSatir = { i: number; kisa: string; domain: string; ca: string; marka: string | null };
type Aday = { domain: string; marka: string; skor: number; durum?: string };
type Alan = { ad: string; deger: string };
type Kategori = { ad: string; seviye: string };
type Dedektif = { tur: string; guven: string; hedef?: string };
type Gecmis = { t: number; risk: number; asama: number };
type Rapor = {
  risk: number; riskSeviye?: string; bulgular: string[]; alanlar: Alan[];
  kategoriler?: Kategori[]; dedektif?: Dedektif; ekranGoruntusu?: string;
  asama?: number; asamalar?: string[]; gecmis?: Gecmis[];
  dna?: { imza: string; parcalar: { k: string; v: string }[]; eslesenler: string[] };
};
type Filtre = "hepsi" | "yuksek" | "arastiriliyor" | "altyapi" | "yeni";

const fmt = (n: number) => n.toLocaleString("tr-TR");
const buyukHarf = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// 4-seviye güven — "kırmızı=kesin sahte" değil; aday≠kesin ilkesiyle.
function seviye(s: number): { renk: string; etiket: string; tag: string } {
  if (s >= 60) return { renk: "#f5222d", etiket: "AKTİF TEHDİT", tag: "error" };
  if (s >= 45) return { renk: "#fa8c16", etiket: "YÜKSEK GÜVEN", tag: "volcano" };
  if (s >= 30) return { renk: "#faad14", etiket: "ŞÜPHELİ", tag: "warning" };
  return { renk: "#8c8c8c", etiket: "İZLEMEDE", tag: "default" };
}
const skorRenk = (s: number) => seviye(s).renk;
function hexRgba(hex: string, a: number): string {
  const m = /#(..)(..)(..)/.exec(hex); if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}
// Kenar etiketi: markayı NEDEN o siteyle ilişkilendirdik (ilişki türü). Yalnız analiz
// edilmiş (seçili) varlıkta zengin; diğerlerinde isim/skor.
function iliskiEtiket(r: Rapor): string {
  const a = (x: string) => r.alanlar?.find((z) => z.ad === x)?.deger;
  const mg = a("Marka taklidi güveni")?.match(/(\d+)/);
  if (a("Logo taklidi (görsel)")) return "logo" + (mg ? " %" + mg[1] : "");
  if (a("Klon kaynağı")) return "klon";
  if (a("İçerikte kurum taklidi")) return "içerik taklidi";
  const fav = a("Favicon"); if (fav && /aynı/i.test(fav)) return "favicon eş";
  if (a("Görsel analiz (AI)") && mg) return "görsel %" + mg[1];
  if (a("Yönlendirme zinciri")) return "yönlendirme";
  return "%" + (r.risk || 0);
}

// Ekran görüntüsü al (pasif → yoksa aktif tarama poll). Gerçek-vs-sahte karşılaştırma için.
async function ekranAl(domain: string): Promise<string | null> {
  try {
    let j = await (await fetch(`/api/ekran?domain=${encodeURIComponent(domain)}`)).json();
    if (j.durum === "hazir") return j.screenshot;
    for (let i = 0; i < 7 && j.uuid; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      j = await (await fetch(`/api/ekran?uuid=${j.uuid}`)).json();
      if (j.durum === "hazir") return j.screenshot;
    }
  } catch { /* */ }
  return null;
}

export default function MercekKokpit() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#f2a33c", colorInfo: "#4d9fe0", borderRadius: 12,
          colorBgLayout: "#080f1a", colorBgContainer: "#0b1726", colorBorderSecondary: "#17293c",
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        },
        components: {
          Card: { headerBg: "transparent", headerFontSize: 12, paddingLG: 16 },
          Statistic: { titleFontSize: 12 },
          Table: { headerBg: "#0d1b2b", rowHoverBg: "#12233a", borderColor: "#152a40" },
        },
      }}
    >
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
      <Kokpit />
    </ConfigProvider>
  );
}

function Kokpit() {
  const [loglar, setLoglar] = useState<Record<string, { toplam: number }>>({});
  const [akis, setAkis] = useState<AkisSatir[]>([]);
  const [toplamCT, setToplamCT] = useState(0);
  const [adaylar, setAdaylar] = useState<Aday[]>([]);
  const [secili, setSecili] = useState<Aday | null>(null);
  const [rapor, setRapor] = useState<Rapor | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("hepsi");
  const [markaFiltre, setMarkaFiltre] = useState("");
  const [hesapAdi, setHesapAdi] = useState("");
  const [oturum, setOturum] = useState<boolean | null>(null);
  const [resmiMap, setResmiMap] = useState<Record<string, string>>({});
  const gorulen = useRef<Set<number>>(new Set());
  const yeniSet = useRef<Set<string>>(new Set());
  const router = useRouter();

  // marka anahtarı → resmî domain (gerçek-vs-sahte görüntü karşılaştırması için)
  useEffect(() => {
    fetch("/api/markalar").then((r) => r.json()).then((j) => {
      const m: Record<string, string> = {};
      for (const x of j.markalar || []) if (x.anahtar && x.resmi?.[0]) m[x.anahtar] = x.resmi[0];
      setResmiMap(m);
    }).catch(() => {});
  }, []);

  useEffect(() => markaDinle((user, hesap) => {
    if (!user) { setOturum(false); router.replace("/marka-giris"); return; }
    setOturum(true);
    if (hesap?.marka && hesap.marka !== "*") { setMarkaFiltre(hesap.marka.toLowerCase()); setHesapAdi(hesap.ad || hesap.marka); }
    else setHesapAdi(hesap?.ad || "Analist");
  }), [router]);

  useEffect(() => {
    let durdu = false;
    async function cek() {
      try {
        const j = await (await fetch("/api/ct-akis", { cache: "no-store" })).json();
        if (durdu) return;
        if (j.toplam) setToplamCT(j.toplam);
        setLoglar((p) => { const n = { ...p }; for (const l of j.loglar || []) n[l.kisa] = { toplam: l.toplam || n[l.kisa]?.toplam || 0 }; return n; });
        const yeni: AkisSatir[] = [];
        for (const a of j.akis || []) { if (gorulen.current.has(a.i)) continue; gorulen.current.add(a.i); yeni.push(a); }
        if (gorulen.current.size > 3000) gorulen.current = new Set([...gorulen.current].slice(-800));
        if (yeni.length) setAkis((p) => [...yeni.reverse(), ...p].slice(0, 30));
      } catch { /* sessiz */ }
    }
    cek(); const t = setInterval(cek, 5000);
    return () => { durdu = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    let durdu = false;
    async function cek() {
      try {
        const j = await (await fetch("/api/marka-adaylari", { cache: "no-store" })).json();
        if (durdu) return;
        const a: Aday[] = (j.adaylar || []).slice(0, 80);
        setAdaylar(a); a.slice(0, 10).forEach((x) => yeniSet.current.add(x.domain));
      } catch { /* sessiz */ }
    }
    cek(); const t = setInterval(cek, 30000);
    return () => { durdu = true; clearInterval(t); };
  }, []);

  const analizEt = useCallback(async (a: Aday) => {
    setSecili(a); setRapor(null); setYukleniyor(true);
    try {
      const j = await (await fetch("/api/osint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ giris: a.domain }) })).json();
      setRapor(j?.hata ? null : j);
    } catch { setRapor(null); }
    setYukleniyor(false);
  }, []);

  const markaAdaylari = markaFiltre ? adaylar.filter((a) => a.marka === markaFiltre) : adaylar;
  const filtrele = (a: Aday) =>
    filtre === "hepsi" ? true : filtre === "yuksek" ? a.skor >= 60 :
    filtre === "arastiriliyor" ? a.skor >= 30 && a.skor < 60 :
    filtre === "altyapi" ? a.skor >= 45 : filtre === "yeni" ? yeniSet.current.has(a.domain) : true;
  const gosterilen = markaAdaylari.filter(filtrele);

  useEffect(() => {
    if (secili && markaAdaylari.some((a) => a.domain === secili.domain)) return;
    if (markaAdaylari[0]) analizEt(markaAdaylari[0]); else { setSecili(null); setRapor(null); }
  }, [markaFiltre, adaylar]); // eslint-disable-line

  const sayim = {
    toplam: markaAdaylari.length,
    yuksek: markaAdaylari.filter((a) => a.skor >= 60).length,
    arastiriliyor: markaAdaylari.filter((a) => a.skor >= 30 && a.skor < 60).length,
    altyapi: markaAdaylari.filter((a) => a.skor >= 45).length,
    yeni: markaAdaylari.filter((a) => yeniSet.current.has(a.domain)).length,
  };
  const markaAdi = markaFiltre ? buyukHarf(markaFiltre) : (hesapAdi || "Tüm Markalar");

  if (oturum !== true) {
    return <Flex align="center" justify="center" style={{ height: "100vh", background: "#080f1a", color: "#8fa6bd" }}><Spin tip={oturum === false ? "Yönlendiriliyor…" : "Oturum kontrol ediliyor…"}><div style={{ padding: 40 }} /></Spin></Flex>;
  }

  const baslik = (no: number, t: string, sag?: React.ReactNode) => (
    <Flex align="center" gap={9} style={{ width: "100%" }}>
      <Avatar size={20} style={{ background: "transparent", border: "1.5px solid #f2a33c", color: "#f2a33c", fontSize: 11, fontWeight: 600, verticalAlign: "middle" }}>{no}</Avatar>
      <Text strong style={{ fontSize: 11.5, letterSpacing: ".08em", color: "#cfe0ef" }}>{t}</Text>
      {sag && <div style={{ marginLeft: "auto" }}>{sag}</div>}
    </Flex>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#080f1a", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'IBM Plex Sans',sans-serif" }}>
      {/* ÜST ÇUBUK */}
      <Flex align="center" gap={16} style={{ padding: "10px 18px", borderBottom: "1px solid #17293c", background: "#0a1420" }}>
        <Flex align="center" gap={9}>
          <Avatar size={28} style={{ background: "linear-gradient(135deg,#f2a33c,#e5772f)", color: "#0a1420" }} icon={<GlobalOutlined />} />
          <Text strong style={{ fontSize: 15, letterSpacing: ".06em" }}>SİBER MERCEK</Text>
        </Flex>
        <Badge status="processing" color="#31c8b0" text={<Text style={{ color: "#31c8b0", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>LIVE</Text>} />
        <Text style={{ color: "#8fa6bd", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{toplamCT ? `${(toplamCT / 1e9).toFixed(2)}B sertifika` : "—"}</Text>
        <div style={{ flex: 1 }} />
        <Clock />
        <Badge count={sayim.yuksek} size="small" color="#f5222d"><BellOutlined style={{ color: "#8fa6bd", fontSize: 17 }} /></Badge>
        <Button size="small" icon={<LogoutOutlined />} onClick={() => { cikis(); router.replace("/marka-giris"); }} style={{ color: "#8fa6bd" }}>
          <Avatar size={20} style={{ background: "#1f4b78", fontSize: 10 }}>{(hesapAdi || "A").charAt(0)}</Avatar> {hesapAdi}
        </Button>
      </Flex>

      {/* GÖVDE */}
      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        <Row gutter={[12, 12]}>
          {/* SOL SÜTUN: 1 marka paneli + 2 filtreler */}
          <Col xs={24} lg={5}>
            <Flex vertical gap={12}>
              <Card size="small" title={baslik(1, "MARKA PANELİ")}>
                <Flex vertical align="center" gap={8} style={{ paddingBottom: 12, borderBottom: "1px solid #17293c" }}>
                  <Avatar size={54} shape="square" style={{ background: "linear-gradient(135deg,#f2a33c,#e5772f)", color: "#0a1420", fontSize: 20, fontWeight: 700, borderRadius: 14 }}>{markaAdi.slice(0, 2).toUpperCase()}</Avatar>
                  <Title level={5} style={{ margin: 0 }}>{markaAdi.toUpperCase()}</Title>
                  <Tag color="blue" bordered style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: ".1em" }}>KORUNAN MARKA</Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>{markaFiltre ? "Marka tehdit panosu" : "Operatör görünümü"}</Text>
                </Flex>
                <div style={{ paddingTop: 8 }}>
                  <StatSatir ikon={<EyeOutlined style={{ color: "#4d9fe0" }} />} t="Toplam Gözlem" n={sayim.toplam} />
                  <StatSatir ikon={<SafetyCertificateOutlined style={{ color: "#f5222d" }} />} t="Yüksek Güven" n={sayim.yuksek} />
                  <StatSatir ikon={<SearchOutlined style={{ color: "#faad14" }} />} t="Araştırılıyor" n={sayim.arastiriliyor} />
                  <StatSatir ikon={<ClusterOutlined style={{ color: "#8b7de0" }} />} t="Altyapı Bağlantılı" n={sayim.altyapi} />
                  <StatSatir ikon={<ThunderboltOutlined style={{ color: "#31c8b0" }} />} t="Yeni Gözlem" n={sayim.yeni} son />
                </div>
              </Card>

              <Card size="small" title={baslik(2, "HIZLI FİLTRELER")}>
                <Segmented
                  vertical block value={filtre} onChange={(v) => setFiltre(v as Filtre)}
                  options={[
                    { label: <FiltreEt renk="#cfe0ef" t="Tümü" n={sayim.toplam} />, value: "hepsi" },
                    { label: <FiltreEt renk="#f5222d" t="Yüksek Güven" n={sayim.yuksek} />, value: "yuksek" },
                    { label: <FiltreEt renk="#faad14" t="Araştırılıyor" n={sayim.arastiriliyor} />, value: "arastiriliyor" },
                    { label: <FiltreEt renk="#8b7de0" t="Altyapı Bağlantılı" n={sayim.altyapi} />, value: "altyapi" },
                    { label: <FiltreEt renk="#31c8b0" t="Yeni Gözlem" n={sayim.yeni} />, value: "yeni" },
                  ]}
                />
              </Card>
            </Flex>
          </Col>

          {/* MERKEZ: 3 grafik */}
          <Col xs={24} lg={13}>
            <Card
              size="small" style={{ height: "100%" }} styles={{ body: { height: "calc(100% - 46px)", padding: 8 } }}
              title={baslik(3, "THREAT UNIVERSE GRAFİĞİ", (
                <Space size={11}>
                  <Efsane renk="#f5222d" t="Aktif Tehdit" />
                  <Efsane renk="#fa8c16" t="Yüksek Güven" />
                  <Efsane renk="#faad14" halka t="Şüpheli" />
                  <Efsane renk="#8b7de0" t="Altyapı" />
                  <Efsane renk="#39bdf8" t="Resmi Marka" />
                </Space>
              ))}
            >
              <div style={{ height: 460 }}><ThreatUniverse marka={markaAdi} adaylar={gosterilen} secili={secili} rapor={rapor} onSelect={analizEt} /></div>
            </Card>
          </Col>

          {/* SAĞ: 4 varlık detayı */}
          <Col xs={24} lg={6}>
            <Card size="small" style={{ height: "100%" }} title={baslik(4, "SEÇİLEN VARLIK DETAYI")}>
              <EntityDetail aday={secili} rapor={rapor} yukleniyor={yukleniyor} markaAdi={markaAdi} resmiDom={secili ? resmiMap[secili.marka] : undefined} />
            </Card>
          </Col>

          {/* ALT SOL: 5 canlı akış */}
          <Col xs={24} lg={18}>
            <Card size="small" title={baslik(5, "CANLI OLAY AKIŞI")}>
              <Table
                size="small" pagination={false} rowKey={(_, i) => String(i)}
                dataSource={olaylar(akis, gosterilen, markaFiltre)}
                locale={{ emptyText: <Empty description="Canlı olay bekleniyor…" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                columns={[
                  { title: "Zaman", dataIndex: "zaman", width: 90, render: (v) => <Text style={{ fontFamily: "'IBM Plex Mono',monospace", color: "#8fa6bd", fontSize: 11 }}>{v}</Text> },
                  { title: "Olay Tipi", dataIndex: "tip", width: 170, render: (v, r) => <Text style={{ color: r.renk, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, fontWeight: 600 }}>{v}</Text> },
                  { title: "Açıklama", dataIndex: "aciklama", ellipsis: true, render: (v) => <Text style={{ color: "#a7bccf", fontSize: 12 }}>{v}</Text> },
                  { title: "İlişkili Varlık", dataIndex: "varlik", width: 220, ellipsis: true, render: (v) => <Text style={{ fontFamily: "'IBM Plex Mono',monospace", color: "#8fa6bd", fontSize: 11 }}>{v}</Text> },
                  { title: "Skor", dataIndex: "skor", width: 60, align: "center", render: (v) => v ? <Tag color={v >= 60 ? "error" : "warning"} style={{ margin: 0, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</Tag> : <Text type="secondary">–</Text> },
                ]}
              />
            </Card>
          </Col>

          {/* ALT SAĞ: 6 küçük istatistikler */}
          <Col xs={24} lg={6}>
            <Card size="small" style={{ height: "100%" }} title={baslik(6, "KÜÇÜK İSTATİSTİKLER")}>
              <Row gutter={[10, 10]}>
                <Col span={12}><MiniStat n={sayim.toplam} t="Toplam Gözlem" renk="#e9f2fa" /></Col>
                <Col span={12}><MiniStat n={new Set(markaAdaylari.map((a) => a.marka)).size} t="İzlenen Marka" renk="#4d9fe0" /></Col>
                <Col span={12}><MiniStat n={sayim.yuksek} t="Yüksek Güven" renk="#f5222d" /></Col>
                <Col span={12}><MiniStat n={sayim.yeni} t="Yeni Gözlem" renk="#31c8b0" /></Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}

/* ── Alt bileşenler ── */
function Clock() {
  const [t, setT] = useState("--:--:--");
  useEffect(() => { const f = () => setT(new Date().toTimeString().slice(0, 8)); f(); const id = setInterval(f, 1000); return () => clearInterval(id); }, []);
  return <Text style={{ color: "#8fa6bd", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{t}</Text>;
}
function StatSatir({ ikon, t, n, son }: { ikon: React.ReactNode; t: string; n: number; son?: boolean }) {
  return (
    <Flex align="center" gap={10} style={{ padding: "8px 2px", borderBottom: son ? "none" : "1px solid #12202e" }}>
      {ikon}<Text style={{ color: "#a7bccf", fontSize: 12.5 }}>{t}</Text>
      <Text strong style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 15 }}>{fmt(n)}</Text>
    </Flex>
  );
}
function FiltreEt({ renk, t, n }: { renk: string; t: string; n: number }) {
  return <Flex align="center" gap={9} style={{ width: "100%", padding: "2px 2px" }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: renk, flex: "0 0 auto" }} /><span style={{ fontSize: 12.5 }}>{t}</span><b style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace" }}>{fmt(n)}</b></Flex>;
}
function MiniStat({ n, t, renk }: { n: number; t: string; renk: string }) {
  return <div style={{ background: "rgba(47,111,176,.06)", border: "1px solid #17293c", borderRadius: 10, padding: 12 }}><div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 26, fontWeight: 600, color: renk, lineHeight: 1 }}>{fmt(n)}</div><Text type="secondary" style={{ fontSize: 10.5, marginTop: 5, display: "block" }}>{t}</Text></div>;
}
function Efsane({ renk, t, halka }: { renk: string; t: string; halka?: boolean }) {
  return <Flex align="center" gap={5}><span style={{ width: 9, height: 9, borderRadius: "50%", background: halka ? "transparent" : renk, border: halka ? `2px solid ${renk}` : "none" }} /><Text style={{ fontSize: 9.5, color: "#8fa6bd" }}>{t}</Text></Flex>;
}

function olaylar(akis: AkisSatir[], adaylar: Aday[], markaFiltre: string) {
  const saat = (d = new Date()) => d.toTimeString().slice(0, 8);
  const out: { zaman: string; tip: string; renk: string; aciklama: string; varlik: string; skor?: number }[] = [];
  for (const a of [...adaylar].sort((x, y) => y.skor - x.skor).slice(0, 3)) {
    out.push({ zaman: saat(), tip: a.skor >= 60 ? "TEHDİT OLUŞTURULDU" : "MARKA EŞLEŞMESİ", renk: a.skor >= 60 ? "#f5222d" : "#faad14", aciklama: `${a.domain} · ${buyukHarf(a.marka)} taklidi (skor ${a.skor})`, varlik: a.domain, skor: a.skor });
  }
  for (const e of akis.filter((x) => !markaFiltre || (x.marka || "").toLowerCase() === markaFiltre).slice(0, 4)) {
    out.push({ zaman: saat(), tip: e.marka ? "MARKA EŞLEŞMESİ" : "YENİ SERTİFİKA", renk: e.marka ? "#faad14" : "#4d9fe0", aciklama: e.marka ? `${e.domain} → ${buyukHarf(e.marka)} ilişkili sertifika` : `${e.domain} · CT sertifikası yayınlandı`, varlik: e.domain });
  }
  return out.slice(0, 6);
}

function nedenTehdit(r: Rapor | null) {
  if (!r) return [] as { t: string; m?: string }[];
  const alan = (ad: string) => r.alanlar?.find((a) => a.ad === ad)?.deger;
  const has = (re: RegExp) => (r.bulgular || []).some((b) => re.test(b));
  const out: { t: string; m?: string }[] = [];
  const mg = alan("Marka taklidi güveni")?.match(/(\d+)\s*\/\s*100/); if (mg) out.push({ t: "Marka taklidi güveni", m: "%" + mg[1] });
  if (alan("Logo taklidi (görsel)")) out.push({ t: "Logo benzerliği", m: alan("Logo taklidi (görsel)") });
  if (alan("Görsel analiz (AI)")) out.push({ t: "Görsel analiz", m: alan("Görsel analiz (AI)") });
  if (alan("İçerikte kurum taklidi")) out.push({ t: "İçerik/kurum taklidi" });
  if (alan("Klon kaynağı")) out.push({ t: "Klon kaynağı", m: alan("Klon kaynağı")?.split(" ")[0] });
  const fav = alan("Favicon"); if (fav && /aynı/i.test(fav)) out.push({ t: "Favicon benzerliği", m: "eş" });
  if (alan("Taklit uyarısı")) out.push({ t: "Marka adı taşıyor, resmî değil" });
  if (has(/ŞİFRE|KART|kimlik av/i)) out.push({ t: "Kimlik bilgisi toplama" });
  if (alan("Kara liste")) out.push({ t: "Kara listede", m: alan("Kara liste") });
  return out.slice(0, 6);
}

function EntityDetail({ aday, rapor, yukleniyor, markaAdi, resmiDom }: { aday: Aday | null; rapor: Rapor | null; yukleniyor: boolean; markaAdi: string; resmiDom?: string }) {
  if (!aday) return <Empty description={<span style={{ color: "#8fa6bd" }}><b style={{ color: "#31c8a0" }}>{markaAdi} için tehdit yok</b><br />Sistem izlemeye devam ediyor.</span>} />;
  const risk = rapor?.risk ?? aday.skor;
  const sv = seviye(risk);
  const renk = sv.renk;
  const sev = { t: sv.etiket, c: sv.tag };
  const neden = nedenTehdit(rapor);
  const mgv = rapor?.alanlar?.find((a) => a.ad === "Marka taklidi güveni")?.deger?.match(/(\d+)\s*\/\s*100/);
  const benzerlik = mgv ? Number(mgv[1]) : undefined;
  const alan = (ad: string) => rapor?.alanlar?.find((a) => a.ad.startsWith(ad))?.deger;
  const zmn = (t?: number) => t ? new Date(t).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  const ilk = rapor?.gecmis?.[0]?.t, son = rapor?.gecmis?.[rapor.gecmis.length - 1]?.t;
  return (
    <Flex vertical gap={12}>
      <div>
        <Text style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, wordBreak: "break-all" }}>{aday.domain}</Text>
        <br /><Tag color={sev.c as string} style={{ marginTop: 8 }}>{sev.t}</Tag>
      </div>
      <Flex align="center" justify="space-between" style={{ borderTop: "1px solid #17293c", borderBottom: "1px solid #17293c", padding: "10px 0" }}>
        <Statistic title="Güven Skoru" value={yukleniyor && !rapor ? "…" : risk} suffix="/100" valueStyle={{ color: renk, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }} />
        <Progress type="dashboard" percent={Math.min(100, risk)} size={70} strokeColor={renk} format={() => ""} />
      </Flex>
      <div>
        <Text strong style={{ fontSize: 11, letterSpacing: ".05em" }}>Neden Tehdit? {yukleniyor && <Spin size="small" />}</Text>
        {neden.length === 0 && !yukleniyor && <div><Text type="secondary" style={{ fontSize: 11 }}>Güçlü sinyal yok — düşük öncelik.</Text></div>}
        <Flex vertical gap={6} style={{ marginTop: 8 }}>
          {neden.map((n, i) => (
            <Flex key={i} align="center" gap={8}>
              <SafetyCertificateOutlined style={{ color: "#31c8a0", fontSize: 13 }} />
              <Text style={{ fontSize: 12, color: "#a7bccf" }}>{n.t}</Text>
              {n.m && <Text strong style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5 }}>{n.m}</Text>}
            </Flex>
          ))}
        </Flex>
      </div>
      <Descriptions
        column={1} size="small" colon={false}
        items={[
          { key: "1", label: "İlk Gözlenme", children: zmn(ilk) },
          { key: "2", label: "Son Gözlenme", children: zmn(son) },
          { key: "3", label: "IP Adresi", children: alan("IP adresi") || "A kaydı yok" },
          { key: "4", label: "ASN", children: alan("Ağ (ASN)") || "—" },
          { key: "5", label: "Sertifika", children: alan("En yeni sertifika") || alan("Sertifika (urlscan)") || "—" },
          ...(rapor?.dna && rapor.dna.eslesenler.length > 0 ? [{ key: "6", label: "Kardeş domain", children: `${rapor.dna.eslesenler.length} (kampanya)` }] : []),
        ]}
        labelStyle={{ color: "#5c748b", fontSize: 11.5 }}
        contentStyle={{ color: "#cfe0ef", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, justifyContent: "flex-end", textAlign: "right" }}
      />
      <KarsilastirGorsel resmiDom={resmiDom} fakeDom={aday.domain} fakeShot={rapor?.ekranGoruntusu} benzerlik={benzerlik} markaAdi={markaAdi} />

      <Flex vertical gap={8}>
        <Button danger type="primary" icon={<ExportOutlined />} href={`http://${aday.domain}`} target="_blank" rel="noopener noreferrer nofollow">Siteyi Ziyaret Et</Button>
        <Button icon={<FileSearchOutlined />} href={`/sorgula?q=${encodeURIComponent(aday.domain)}`}>Tam Raporu Aç</Button>
      </Flex>
    </Flex>
  );
}

// GERÇEK vs SAHTE — resmî markanın ekran görüntüsü yanında sahtenin görüntüsü + benzerlik.
function KarsilastirGorsel({ resmiDom, fakeDom, fakeShot, benzerlik, markaAdi }: { resmiDom?: string; fakeDom: string; fakeShot?: string; benzerlik?: number; markaAdi: string }) {
  const [gercek, setGercek] = useState<string | null>(null);
  const [sahte, setSahte] = useState<string | null>(fakeShot || null);
  const [gYuk, setGYuk] = useState(false);
  const [sYuk, setSYuk] = useState(false);
  useEffect(() => {
    let iptal = false; setGercek(null);
    if (resmiDom) { setGYuk(true); ekranAl(resmiDom).then((s) => { if (!iptal) { setGercek(s); setGYuk(false); } }); }
    return () => { iptal = true; };
  }, [resmiDom]);
  useEffect(() => {
    let iptal = false;
    if (fakeShot) { setSahte(fakeShot); return; }
    setSahte(null); setSYuk(true);
    ekranAl(fakeDom).then((s) => { if (!iptal) { setSahte(s); setSYuk(false); } });
    return () => { iptal = true; };
  }, [fakeDom, fakeShot]);

  const kutu = (baslik: string, alt: string, src: string | null, yuk: boolean, kenar: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, letterSpacing: ".06em", color: "#8fa6bd", marginBottom: 4, textTransform: "uppercase" }}>{baslik}</div>
      <div style={{ aspectRatio: "16/10", borderRadius: 8, border: `1px solid ${kenar}`, overflow: "hidden", background: "#0a1420", display: "grid", placeItems: "center" }}>
        {yuk ? <Spin size="small" /> : src
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt={alt} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          : <span style={{ fontSize: 10, color: "#5c748b" }}>görüntü yok</span>}
      </div>
      <div style={{ fontSize: 9.5, color: "#8fa6bd", marginTop: 3, fontFamily: "'IBM Plex Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alt}</div>
    </div>
  );

  return (
    <div style={{ borderTop: "1px solid #17293c", paddingTop: 12 }}>
      <Text strong style={{ fontSize: 11, letterSpacing: ".05em" }}>Gerçek vs Sahte</Text>
      <Flex gap={10} style={{ marginTop: 8 }}>
        {kutu("GERÇEK MARKA", resmiDom || markaAdi, gercek, gYuk, "#1f4b78")}
        {kutu("ŞÜPHELİ SİTE", fakeDom, sahte, sYuk, "#5a2226")}
      </Flex>
      {typeof benzerlik === "number" && (
        <Flex align="center" gap={8} style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 10.5, color: "#8fa6bd" }}>GÖRSEL BENZERLİK</Text>
          <Progress percent={benzerlik} size="small" strokeColor={seviye(benzerlik).renk} style={{ flex: 1, margin: 0 }} format={(p) => <span style={{ color: "#e9f2fa", fontFamily: "'IBM Plex Mono',monospace" }}>%{p}</span>} />
        </Flex>
      )}
    </div>
  );
}

/* THREAT UNIVERSE — marka merkezli force-graph + seçilenin altyapı alt-grafiği */
function ThreatUniverse({ marka, adaylar, secili, rapor, onSelect }: { marka: string; adaylar: Aday[]; secili: Aday | null; rapor: Rapor | null; onSelect: (a: Aday) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const st = useRef<{ nodes: any[]; merkez: any; altyapi: any[] }>({ nodes: [], merkez: null, altyapi: [] });
  const adRef = useRef(adaylar); adRef.current = adaylar;
  const selRef = useRef(secili); selRef.current = secili;
  const rapRef = useRef(rapor); rapRef.current = rapor;
  const markaRef = useRef(marka); markaRef.current = marka;

  useEffect(() => {
    const canvas = cv.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!; const DPR = Math.min(2, devicePixelRatio || 1);
    let W = 0, H = 0, raf = 0; const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const resize = () => { const b = canvas.getBoundingClientRect(); W = b.width; H = b.height; canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

    function kur() {
      const cx = W / 2, cy = H * 0.4; const merkez = { x: cx, y: cy, r: 32 };
      const ad = adRef.current.slice(0, 9);
      const nodes = ad.map((a, i) => {
        const ang = -Math.PI / 2 + (i / Math.max(1, ad.length)) * Math.PI * 2;
        const R = Math.min(W, H) * 0.34;
        return { aday: a, x: cx + Math.cos(ang) * R + (Math.random() - .5) * 20, y: cy + Math.sin(ang) * R + (Math.random() - .5) * 20, vx: 0, vy: 0, r: a.skor >= 60 ? 15 : 13, ang };
      });
      const r = rapRef.current; const alt: any[] = [];
      if (r) {
        const alan = (x: string) => r.alanlar?.find((a) => a.ad.startsWith(x))?.deger;
        const ip = alan("IP adresi"), ns = alan("Ad sunucusu"), asn = alan("Ağ (ASN)"), cert = alan("En yeni sertifika") || alan("Sertifika (urlscan)");
        const iy = cy + Math.min(W, H) * 0.36;
        const hub = { label: ip || "IP", x: cx, y: iy, r: 13, hub: true };
        alt.push(hub);
        if (ns) alt.push({ label: (ns.split(",")[0] || "").trim().slice(0, 16), x: cx - 120, y: iy + 44, r: 11, bagli: hub });
        if (cert) alt.push({ label: "cert", x: cx, y: iy + 66, r: 11, bagli: hub });
        if (asn) alt.push({ label: asn.replace(/\s.*/, "").slice(0, 12) || "ASN", x: cx + 120, y: iy + 44, r: 11, bagli: hub });
      }
      st.current = { nodes, merkez, altyapi: alt };
    }
    kur(); const kurT = setInterval(kur, 3500);

    canvas.onclick = (e) => {
      const b = canvas.getBoundingClientRect(); const mx = e.clientX - b.left, my = e.clientY - b.top;
      let best: any = null, bd = 520;
      for (const n of st.current.nodes) { const d = (n.x - mx) ** 2 + (n.y - my) ** 2; if (d < bd) { bd = d; best = n; } }
      if (best) onSelect(best.aday);
    };

    let t = 0;
    function frame() {
      t += 0.015;
      const { nodes, merkez, altyapi } = st.current;
      for (const n of nodes) {
        const R = Math.min(W, H) * 0.34;
        const tx = merkez.x + Math.cos(n.ang) * R, ty = merkez.y + Math.sin(n.ang) * R;
        n.vx += (tx - n.x) * 0.02; n.vy += (ty - n.y) * 0.02;
        for (const o of nodes) { if (o === n) continue; const dx = n.x - o.x, dy = n.y - o.y, ds = dx * dx + dy * dy + 1; if (ds < 4000) { const f = 120 / ds; n.vx += dx * f; n.vy += dy * f; } }
        n.vx *= 0.8; n.vy *= 0.8; n.x += n.vx; n.y += n.vy;
      }
      ctx.clearRect(0, 0, W, H);
      const sel = selRef.current, rap = rapRef.current;
      for (const n of nodes) {
        const c = seviye(n.aday.skor).renk; const aktif = n.aday.skor >= 45;
        ctx.beginPath(); ctx.moveTo(merkez.x, merkez.y); ctx.lineTo(n.x, n.y);
        ctx.strokeStyle = hexRgba(c, aktif ? 0.5 : 0.32); ctx.lineWidth = aktif ? 1.4 : 1; ctx.setLineDash(aktif ? [] : [4, 4]);
        ctx.stroke(); ctx.setLineDash([]);
        const mx = merkez.x + (n.x - merkez.x) * 0.5, my = merkez.y + (n.y - merkez.y) * 0.5;
        // kenar etiketi = ilişki türü (seçili varlıkta zengin; diğerinde skor)
        const et = (sel && rap && sel.domain === n.aday.domain) ? iliskiEtiket(rap) : "%" + n.aday.skor;
        ctx.font = "600 10px 'IBM Plex Mono',monospace"; ctx.fillStyle = c; ctx.textAlign = "center"; ctx.fillText(et, mx, my - 2);
      }
      for (const a of altyapi) if (a.bagli) { ctx.beginPath(); ctx.moveTo(a.bagli.x, a.bagli.y); ctx.lineTo(a.x, a.y); ctx.strokeStyle = "rgba(139,125,224,.4)"; ctx.lineWidth = 1; ctx.stroke(); }
      if (altyapi[0]) { ctx.beginPath(); ctx.moveTo(merkez.x, merkez.y); ctx.lineTo(altyapi[0].x, altyapi[0].y); ctx.strokeStyle = "rgba(139,125,224,.25)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.beginPath(); ctx.arc(merkez.x, merkez.y, merkez.r + 12, 0, 6.28); ctx.strokeStyle = "rgba(57,189,248," + (.2 + .12 * Math.sin(t * 2)) + ")"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(merkez.x, merkez.y, merkez.r, 0, 6.28); const g = ctx.createRadialGradient(merkez.x, merkez.y - 8, 2, merkez.x, merkez.y, merkez.r); g.addColorStop(0, "#0e3a5a"); g.addColorStop(1, "#0a2740"); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#39bdf8"; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = "700 12px 'IBM Plex Sans',sans-serif"; ctx.fillStyle = "#e9f2fa"; ctx.textAlign = "center"; ctx.fillText(markaRef.current.toUpperCase().slice(0, 12), merkez.x, merkez.y + 3);
      ctx.font = "600 7px 'IBM Plex Mono',monospace"; ctx.fillStyle = "#5aa9e0"; ctx.fillText("KORUNAN MARKA", merkez.x, merkez.y + 15);
      for (const n of nodes) {
        const c = seviye(n.aday.skor).renk;
        const isSel = selRef.current && selRef.current.domain === n.aday.domain;
        const gl = (Math.sin(t * 3 + n.x) + 1) / 2;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5 + gl * 3, 0, 6.28); ctx.fillStyle = hexRgba(c, 0.05 + gl * 0.06); ctx.fill();
        if (isSel) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 6, 0, 6.28); ctx.strokeStyle = "#e9f2fa"; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.28); ctx.fillStyle = "#12202e"; ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = c; ctx.fillRect(n.x - 5, n.y - 4, 10, 8); ctx.fillStyle = "#12202e"; ctx.fillRect(n.x - 5, n.y - 4, 10, 2.2);
        ctx.font = "500 9.5px 'IBM Plex Mono',monospace"; ctx.fillStyle = "#b9cbdc"; ctx.textAlign = "center";
        const dom = n.aday.domain.length > 22 ? n.aday.domain.slice(0, 21) + "…" : n.aday.domain;
        ctx.fillText(dom, n.x, n.y + n.r + 12);
        ctx.font = "600 9px 'IBM Plex Mono',monospace"; ctx.fillStyle = c; ctx.fillText("%" + n.aday.skor, n.x, n.y + n.r + 23);
      }
      for (const a of altyapi) {
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.28); ctx.fillStyle = "#1a1830"; ctx.fill(); ctx.strokeStyle = "#8b7de0"; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.font = "500 8.5px 'IBM Plex Mono',monospace"; ctx.fillStyle = "#b3a9e0"; ctx.textAlign = "center"; ctx.fillText(a.label, a.x, a.y + a.r + 11);
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    if (reduce) frame(); else frame();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); clearInterval(kurT); };
  }, [onSelect]);

  return <canvas ref={cv} style={{ width: "100%", height: "100%", cursor: "pointer" }} />;
}
