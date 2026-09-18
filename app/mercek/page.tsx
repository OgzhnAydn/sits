"use client";

// SİBER MERCEK — marka tehdit istihbarat kokpiti (Ant Design + GERÇEK veri).
// Giriş kapılı + marka kilidi. Sensör/akış ← /api/ct-akis, adaylar ← /api/marka-adaylari,
// seçilen varlık ← /api/osint. antd: Card/Statistic/Progress/Table/Tag/Descriptions/Segmented.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ConfigProvider, theme, Row, Col, Card, Statistic, Progress, Table, Tag, Segmented,
  Button, Descriptions, Avatar, Flex, Badge, Empty, Spin, Typography, Space, Timeline, Alert, Select, Dropdown,
} from "antd";
import {
  EyeOutlined, SafetyCertificateOutlined, SearchOutlined, ClusterOutlined, ThunderboltOutlined,
  ExportOutlined, FileSearchOutlined, LogoutOutlined, BellOutlined, GlobalOutlined,
  WarningOutlined, ClockCircleOutlined, BarChartOutlined, AppstoreOutlined,
} from "@ant-design/icons";
import { markaDinle, cikis } from "@/lib/markaAuth";
import { usePanoTema } from "@/lib/panoTema";
import { markaLogo } from "@/lib/korunanMarkalar";
import AnalitikPanel from "./AnalitikPanel";

const { Text, Title } = Typography;

type AkisSatir = { i: number; kisa: string; domain: string; ca: string; marka: string | null };
type Aday = { domain: string; marka: string; skor: number; durum?: string; zaman?: number };
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
type Filtre = "hepsi" | "aktif" | "park" | "inceleme" | "yeni";

// DURUM = tespit anındaki gerçek yaşam-durumu (grafik ile AYNI kaynak). Sayaçları buna
// göre böleriz — ham skora göre DEĞİL. Yoksa park edilmiş domain "Yüksek Güven" görünür
// (isbank .ph toplu-park vakası): grafik "park" derken sayaç "198 yüksek" diyordu.
const aktifTuzakMi = (a: Aday) => a.durum === "aktif-tuzak" || a.durum === "canli";
const parkPasifMi = (a: Aday) => a.durum === "park" || a.durum === "yayinda-degil";

const fmt = (n: number) => n.toLocaleString("tr-TR");
const buyukHarf = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// 4-seviye güven — "kırmızı=kesin sahte" değil; aday≠kesin ilkesiyle.
function seviye(s: number): { renk: string; etiket: string; tag: string } {
  if (s >= 60) return { renk: "var(--c-f5222d)", etiket: "KRİTİK RİSK", tag: "error" };
  if (s >= 45) return { renk: "var(--c-fa8c16)", etiket: "YÜKSEK GÜVEN", tag: "volcano" };
  if (s >= 30) return { renk: "var(--c-faad14)", etiket: "ŞÜPHELİ", tag: "warning" };
  return { renk: "var(--c-8c8c8c)", etiket: "İZLEMEDE", tag: "default" };
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
  const { tema, koyu, degistir } = usePanoTema();
  return (
    <ConfigProvider
      theme={{
        algorithm: koyu ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: koyu ? "#f2a33c" : "#c06e12", colorInfo: koyu ? "#4d9fe0" : "#2478c9", borderRadius: 12,
          colorBgLayout: koyu ? "#080f1a" : "#eef1f6", colorBgContainer: koyu ? "#0b1726" : "#ffffff", colorBorderSecondary: koyu ? "#17293c" : "#dbe3ee",
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        },
        components: {
          Card: { headerBg: "transparent", headerFontSize: 12, paddingLG: 16 },
          Statistic: { titleFontSize: 12 },
          Table: { headerBg: koyu ? "#0d1b2b" : "#eef2f8", rowHoverBg: koyu ? "#12233a" : "#f1f5fa", borderColor: koyu ? "#152a40" : "#dbe3ee" },
        },
      }}
    >
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
      <Kokpit tema={tema} koyu={koyu} degistir={degistir} />
    </ConfigProvider>
  );
}

function Kokpit({ tema, koyu, degistir }: { tema: string; koyu: boolean; degistir: () => void }) {
  const [loglar, setLoglar] = useState<Record<string, { toplam: number }>>({});
  const [akis, setAkis] = useState<AkisSatir[]>([]);
  const [toplamCT, setToplamCT] = useState(0);
  const [adaylar, setAdaylar] = useState<Aday[]>([]);
  const [secili, setSecili] = useState<Aday | null>(null);
  const [rapor, setRapor] = useState<Rapor | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("hepsi");
  const [zaman, setZaman] = useState<"anlik" | "24s" | "7g" | "hepsi">("hepsi"); // grafik zaman penceresi (kalabalık azalt)
  const [markaFiltre, setMarkaFiltre] = useState("");
  const [hesapAdi, setHesapAdi] = useState("");
  const [gorunum, setGorunum] = useState<"evren" | "ortak" | "mobilreklam" | "oncelik">("evren"); // kokpit içi menü: grafik ya da analitik bölüm
  const [taraniyor, setTaraniyor] = useState(false);
  const [taraSonuc, setTaraSonuc] = useState<string | null>(null);
  async function markaTara() {
    if (!markaFiltre || taraniyor) return;
    setTaraniyor(true); setTaraSonuc(null);
    try {
      const j = await (await fetch(`/api/marka-tara-tekil?marka=${encodeURIComponent(markaFiltre)}`)).json();
      setTaraSonuc(j.ok ? `${j.yeni || 0} yeni · ${j.taranan || 0} tarandı` : (j.hata || "tarama başarısız"));
    } catch { setTaraSonuc("tarama başarısız"); }
    finally { setTaraniyor(false); }
  }
  const [oturum, setOturum] = useState<boolean | null>(null);
  const [operator, setOperator] = useState(false); // marka="*" → tüm markalara dalabilir
  const [resmiMap, setResmiMap] = useState<Record<string, string>>({});
  const [markaListe, setMarkaListe] = useState<{ anahtar: string; ad: string }[]>([]);
  const gorulen = useRef<Set<number>>(new Set());
  const yeniSet = useRef<Set<string>>(new Set());
  const router = useRouter();

  // marka anahtarı → resmî domain (gerçek-vs-sahte görüntü karşılaştırması için) + marka listesi (operatör değiştirici)
  useEffect(() => {
    fetch("/api/markalar?all=1").then((r) => r.json()).then((j) => {  // ?all=1: TAM liste (marka koruma menüsüyle aynı) — kısa anahtarlı markalar da menüde görünsün
      const m: Record<string, string> = {};
      const liste: { anahtar: string; ad: string }[] = [];
      for (const x of j.markalar || []) {
        if (x.anahtar && x.resmi?.[0]) m[x.anahtar] = x.resmi[0];
        if (x.anahtar) liste.push({ anahtar: String(x.anahtar).toLowerCase(), ad: x.ad || x.anahtar });
      }
      liste.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
      setResmiMap(m); setMarkaListe(liste);
    }).catch(() => {});
  }, []);

  // Operatör bir markaya geçince/temizleyince URL'i de güncelle (paylaşılabilir + geri tutarlı).
  const markaSec = useCallback((anahtar: string) => {
    setMarkaFiltre(anahtar);
    const yeni = anahtar ? `/mercek?marka=${encodeURIComponent(anahtar)}` : "/mercek";
    window.history.replaceState(null, "", yeni);
  }, []);

  useEffect(() => markaDinle((user, hesap) => {
    if (!user) { setOturum(false); router.replace("/marka-giris"); return; }
    setOturum(true);
    const dalinan = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("marka") : null;
    // Kontrol Odası (operatör bağlamı) bir markaya ?marka= ile dalabilir. Faz-2'de bu
    // yalnız operatör (marka="*") hesaplarıyla sınırlanacak (sunucu-tarafı izolasyon).
    // Operatör bağlamı: gerçek operatör (marka="*") VEYA Kontrol'den bir markaya dalınmış →
    // marka değiştirici + "Kontrol'e dön" göster. (Faz-2 sunucu izolasyonunda daraltılacak.)
    setOperator(hesap?.marka === "*" || !!dalinan);
    if (hesap?.marka && hesap.marka !== "*") { setMarkaFiltre((dalinan || hesap.marka).toLowerCase()); setHesapAdi(hesap.ad || hesap.marka); }
    else { if (dalinan) setMarkaFiltre(dalinan.toLowerCase()); setHesapAdi(hesap?.ad || "Analist"); }
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
        // Marka-kilitli hesapta O MARKANIN adaylarını çek (global "en yeni" listesi
        // markayı kaçırabilir). Serbest/analist hesapta global liste.
        const url = markaFiltre ? `/api/marka-adaylari?marka=${encodeURIComponent(markaFiltre)}` : "/api/marka-adaylari";
        const j = await (await fetch(url, { cache: "no-store" })).json();
        if (durdu) return;
        const a: Aday[] = (j.adaylar || []).slice(0, 300);
        setAdaylar(a); a.slice(0, 10).forEach((x) => yeniSet.current.add(x.domain));
      } catch { /* sessiz */ }
    }
    cek(); const t = setInterval(cek, 30000);
    return () => { durdu = true; clearInterval(t); };
  }, [markaFiltre]);

  const analizEt = useCallback(async (a: Aday, taze = false) => {
    setSecili(a); setRapor(null); setYukleniyor(true);
    try {
      const j = await (await fetch("/api/osint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ giris: a.domain, taze }) })).json();
      setRapor(j?.hata ? null : j);
    } catch { setRapor(null); }
    setYukleniyor(false);
  }, []);

  const markaAdaylari = markaFiltre ? adaylar.filter((a) => a.marka === markaFiltre) : adaylar;
  const filtrele = (a: Aday) =>
    filtre === "hepsi" ? true : filtre === "aktif" ? aktifTuzakMi(a) :
    filtre === "park" ? parkPasifMi(a) :
    filtre === "inceleme" ? (!aktifTuzakMi(a) && !parkPasifMi(a)) :
    filtre === "yeni" ? yeniSet.current.has(a.domain) : true;
  const gosterilen = markaAdaylari.filter(filtrele);
  // Grafik için zaman penceresi (kalabalığı azalt) — aday.zaman'a göre süz.
  const zamanPencere = zaman === "anlik" ? 3600e3 : zaman === "24s" ? 24 * 3600e3 : zaman === "7g" ? 7 * 24 * 3600e3 : 0;
  const grafikAdaylar = zamanPencere ? gosterilen.filter((a) => a.zaman && Date.now() - a.zaman < zamanPencere) : gosterilen;

  useEffect(() => {
    if (secili && markaAdaylari.some((a) => a.domain === secili.domain)) return;
    if (markaAdaylari[0]) analizEt(markaAdaylari[0]); else { setSecili(null); setRapor(null); }
  }, [markaFiltre, adaylar]); // eslint-disable-line

  // Sayaçlar DURUMA göre (grafikle tutarlı). toplam = aktif + park + inceleme (MECE);
  // "yeni" bunlara dik bir zaman-kesiti. Ham skor artık tek başına "yüksek" DEMEZ —
  // doğrulanmamış isim-eşleşmesi "İnceleniyor"a düşer, park olan "Park"a; aşırı-iddia biter.
  const sayim = {
    toplam: markaAdaylari.length,
    aktif: markaAdaylari.filter(aktifTuzakMi).length,
    park: markaAdaylari.filter(parkPasifMi).length,
    inceleme: markaAdaylari.filter((a) => !aktifTuzakMi(a) && !parkPasifMi(a)).length,
    yeni: markaAdaylari.filter((a) => yeniSet.current.has(a.domain)).length,
  };
  // Panel başlığı markanın TAM ADINI (ad) göstersin — anahtar değil (ör. "yurtdisiturkler" →
  // "YURTDISITURKLER" yerine "Yurtdışı Türkler ve Akraba Topluluklar Başkanlığı"). Ad yoksa anahtara düş.
  const markaAdi = markaFiltre ? (markaListe.find((m) => m.anahtar === markaFiltre)?.ad || buyukHarf(markaFiltre)) : (hesapAdi || "Tüm Markalar");

  if (oturum !== true) {
    return <Flex vertical align="center" justify="center" gap={14} style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--c-080f1a)", color: "var(--c-8fa6bd)" }}><Spin size="large" /><span>{oturum === false ? "Yönlendiriliyor…" : "Oturum kontrol ediliyor…"}</span></Flex>;
  }

  const baslik = (no: number, t: string, sag?: React.ReactNode) => (
    <Flex align="center" gap={9} style={{ width: "100%" }}>
      <Avatar size={20} style={{ background: "transparent", border: "1.5px solid var(--c-f2a33c)", color: "var(--c-f2a33c)", fontSize: 11, fontWeight: 600, verticalAlign: "middle" }}>{no}</Avatar>
      <Text strong style={{ fontSize: 11.5, letterSpacing: ".08em", color: "var(--c-cfe0ef)" }}>{t}</Text>
      {sag && <div style={{ marginLeft: "auto" }}>{sag}</div>}
    </Flex>
  );

  return (
    <div className="pano" data-tema={tema} style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--c-080f1a)", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'IBM Plex Sans',sans-serif" }}>
      {/* ÜST ÇUBUK */}
      <Flex align="center" gap={16} wrap style={{ padding: "10px 18px", borderBottom: "1px solid var(--c-17293c)", background: "var(--c-0a1420)", rowGap: 8 }}>
        <Flex align="center" gap={10}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={koyu ? "/mirleon-white.svg" : "/mirleon.svg"} alt="MirLeon" style={{ height: 20, width: "auto" }} />
          <span style={{ width: 1, height: 18, background: "var(--c-1f3652)" }} />
          <Text style={{ fontSize: 12, letterSpacing: ".08em", color: "var(--c-5f7c9c)", textTransform: "uppercase" }}>Siber Mercek</Text>
        </Flex>
        <Badge status="processing" color="var(--c-31c8b0)" text={<Text style={{ color: "var(--c-31c8b0)", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>LIVE</Text>} />
        <Text style={{ color: "var(--c-8fa6bd)", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{toplamCT ? `${(toplamCT / 1e9).toFixed(2)}B sertifika` : "—"}</Text>
        {operator && (<>
          <span style={{ width: 1, height: 18, background: "var(--c-1f3652)" }} />
          <Button size="small" icon={<AppstoreOutlined />} onClick={() => router.push("/kontrol")} style={{ color: "var(--c-8fa6bd)" }}>Kontrol</Button>
          <Select
            size="small" value={markaFiltre} onChange={markaSec} showSearch optionFilterProp="label"
            style={{ minWidth: 168 }} placeholder="Marka seç"
            options={[{ value: "", label: "Tüm markalar" }, ...markaListe.map((m) => ({ value: m.anahtar, label: m.ad }))]}
            optionRender={(opt) => {
              const logo = opt.value ? markaLogo(resmiMap[String(opt.value)]) : null;
              return <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo} alt="" width={16} height={16} style={{ borderRadius: 3, background: "#fff", flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} /> : <span style={{ width: 16 }} />}
                <span>{opt.label}</span>
              </span>;
            }}
          />
        </>)}
        <div style={{ flex: 1 }} />
        <Clock />
        <Button size="small" type="text" onClick={degistir} title={koyu ? "Açık temaya geç" : "Koyu temaya geç"} style={{ color: "var(--c-8fa6bd)" }}
          icon={<span className="material-symbols-outlined" style={{ fontSize: 17, lineHeight: 1 }}>{koyu ? "light_mode" : "dark_mode"}</span>} />
        <Badge count={sayim.aktif} size="small" color="var(--c-f5222d)"><BellOutlined style={{ color: "var(--c-8fa6bd)", fontSize: 17 }} /></Badge>
        <Button size="small" icon={gorunum !== "evren" ? <GlobalOutlined /> : <BarChartOutlined />} onClick={() => setGorunum(gorunum !== "evren" ? "evren" : "ortak")} style={{ color: gorunum !== "evren" ? "var(--c-4d9fe0)" : "var(--c-8fa6bd)" }}>{gorunum !== "evren" ? "Tehdit Evreni" : "Analitik Panel"}</Button>
        <Button size="small" icon={<LogoutOutlined />} onClick={() => { cikis(); router.replace("/marka-giris"); }} style={{ color: "var(--c-8fa6bd)" }}>
          <Avatar size={20} style={{ background: "var(--c-1f4b78)", fontSize: 10 }}>{(hesapAdi || "A").charAt(0)}</Avatar> {hesapAdi}
        </Button>
      </Flex>

      {/* GÖVDE */}
      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        <Row gutter={[12, 12]}>
          {/* SOL SÜTUN: 1 marka paneli + 2 filtreler */}
          <Col xs={24} lg={5}>
            <Flex vertical gap={12}>
              <Card size="small" title={baslik(1, "MARKA PANELİ")}>
                <Flex vertical align="center" gap={8} style={{ paddingBottom: 12, borderBottom: "1px solid var(--c-17293c)" }}>
                  {(() => { const logo = markaFiltre ? markaLogo(resmiMap[markaFiltre]) : null; return (
                    <Avatar size={54} shape="square" src={logo || undefined}
                      style={{ background: logo ? "#fff" : "linear-gradient(135deg,var(--c-f2a33c),var(--c-e5772f))", color: "var(--c-0a1420)", fontSize: 20, fontWeight: 700, borderRadius: 14 }}>
                      {markaAdi.slice(0, 2).toUpperCase()}
                    </Avatar>
                  ); })()}
                  <Title level={5} style={{ margin: 0 }}>{markaAdi.toUpperCase()}</Title>
                  <Tag color="blue" bordered style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: ".1em" }}>KORUNAN MARKA</Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>{markaFiltre ? "Marka tehdit panosu" : "Operatör görünümü"}</Text>
                  {markaFiltre && (
                    <Dropdown
                      menu={{
                        items: [
                          { key: "gunluk", label: "Günlük (son 24 saat)" },
                          { key: "haftalik", label: "Haftalık (son 7 gün)" },
                          { key: "aylik", label: "Aylık (son 30 gün)" },
                          { key: "tumu", label: "Tüm zamanlar" },
                        ],
                        onClick: ({ key }) => window.open(`/api/marka-rapor-pdf?marka=${encodeURIComponent(markaFiltre)}&aralik=${key}`, "_blank", "noopener"),
                      }}
                      trigger={["click"]}
                    >
                      <Button size="small" type="primary" icon={<span className="material-symbols-outlined" style={{ fontSize: 15, lineHeight: 1 }}>picture_as_pdf</span>} style={{ marginTop: 8, marginRight: 6 }}>
                        Rapor Al ▾
                      </Button>
                    </Dropdown>
                  )}
                  {markaFiltre && (
                    <Button size="small" loading={taraniyor} onClick={markaTara} icon={<span className="material-symbols-outlined" style={{ fontSize: 15, lineHeight: 1 }}>refresh</span>} style={{ marginTop: 8 }}>
                      Şimdi Tara
                    </Button>
                  )}
                  {taraSonuc && <Text style={{ fontSize: 10, color: "var(--c-8fa6bd)", display: "block", marginTop: 4 }}>{taraSonuc}</Text>}
                </Flex>
                <div style={{ paddingTop: 8 }}>
                  <StatSatir ikon={<EyeOutlined style={{ color: "var(--c-4d9fe0)" }} />} t="Toplam Gözlem" n={sayim.toplam} renk="var(--c-4d9fe0)" aktif={filtre === "hepsi"} onClick={() => setFiltre("hepsi")} />
                  <StatSatir ikon={<WarningOutlined style={{ color: "var(--c-ff5468)" }} />} t="Aktif Tuzak" n={sayim.aktif} renk="var(--c-ff5468)" aktif={filtre === "aktif"} onClick={() => setFiltre("aktif")} />
                  <StatSatir ikon={<ClusterOutlined style={{ color: "var(--c-8fb0d4)" }} />} t="Park · İzlemede" n={sayim.park} renk="var(--c-8fb0d4)" aktif={filtre === "park"} onClick={() => setFiltre("park")} />
                  <StatSatir ikon={<SearchOutlined style={{ color: "var(--c-faad14)" }} />} t="İnceleniyor" n={sayim.inceleme} renk="var(--c-faad14)" aktif={filtre === "inceleme"} onClick={() => setFiltre("inceleme")} />
                  <StatSatir ikon={<ThunderboltOutlined style={{ color: "var(--c-31c8b0)" }} />} t="Yeni Gözlem" n={sayim.yeni} renk="var(--c-31c8b0)" aktif={filtre === "yeni"} onClick={() => setFiltre("yeni")} son />
                </div>
                <Text type="secondary" style={{ fontSize: 10, display: "block", marginTop: 6, textAlign: "center" }}>satıra tıkla → grafiği süz</Text>
                {/* GÖRÜNÜM MENÜSÜ — üstteki filtre satırlarıyla aynı düz menü. Tıklayınca sağdaki
                    alan (grafik) AYNI YERDE değişir; yeni sayfa/yönlendirme yok. */}
                <Text style={{ fontSize: 10, color: "var(--c-8fa6bd)", letterSpacing: ".08em", textTransform: "uppercase", display: "block", marginTop: 14, marginBottom: 2 }}>Görünüm</Text>
                <StatSatir ikon={<GlobalOutlined style={{ color: "var(--c-4d9fe0)" }} />} t="Tehdit Evreni" renk="var(--c-4d9fe0)" aktif={gorunum === "evren"} onClick={() => setGorunum("evren")} />
                <StatSatir ikon={<ClusterOutlined style={{ color: "var(--c-4d9fe0)" }} />} t="Ortak Nokta & Atıf" renk="var(--c-4d9fe0)" aktif={gorunum === "ortak"} onClick={() => setGorunum("ortak")} />
                <StatSatir ikon={<AppstoreOutlined style={{ color: "var(--c-4d9fe0)" }} />} t="Mobil & Reklam" renk="var(--c-4d9fe0)" aktif={gorunum === "mobilreklam"} onClick={() => setGorunum("mobilreklam")} />
                <StatSatir ikon={<ThunderboltOutlined style={{ color: "var(--c-4d9fe0)" }} />} t="Öncelik & USOM" renk="var(--c-4d9fe0)" aktif={gorunum === "oncelik"} onClick={() => setGorunum("oncelik")} son />
              </Card>
            </Flex>
          </Col>

          {gorunum !== "evren" ? (
            <Col xs={24} lg={19}><AnalitikPanel marka={markaFiltre} bolum={gorunum} /></Col>
          ) : (<>
          {/* MERKEZ: 3 grafik */}
          <Col xs={24} lg={13}>
            <Card
              size="small" style={{ height: "100%" }} styles={{ body: { height: "calc(100% - 46px)", padding: 8 } }}
              title={baslik(3, "THREAT UNIVERSE GRAFİĞİ", (
                <Space size={11} wrap>
                  <Efsane renk="var(--c-ff5468)" t="Aktif tuzak" />
                  <Efsane renk="var(--c-e5772f)" t="Canlı" />
                  <Efsane renk="var(--c-faad14)" t="İnceleme" />
                  <Efsane renk="var(--c-8fb0d4)" t="Park · pasif" />
                  <Efsane renk="var(--c-8fb0d4)" halka t="Küme (tıkla→aç)" />
                  <Efsane renk="var(--c-39bdf8)" t="Resmi marka" />
                </Space>
              ))}
            >
              {/* Grafik her iki temada da koyu "radar ekranı" kalır (canvas renkleri koyu; JS ile CSS-var okunamadığından). */}
              <div style={{ position: "relative", height: 460, background: koyu ? "#0a1420" : "#f4f7fb", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 8, left: 8, zIndex: 3 }}>
                  <Segmented size="small" value={zaman} onChange={(v) => setZaman(v as "anlik" | "24s" | "7g" | "hepsi")}
                    options={[{ label: "Anlık", value: "anlik" }, { label: "24s", value: "24s" }, { label: "7 gün", value: "7g" }, { label: "Tümü", value: "hepsi" }]} />
                </div>
                <ThreatUniverse marka={markaAdi} adaylar={grafikAdaylar} secili={secili} rapor={rapor} onSelect={analizEt} logo={markaFiltre ? markaLogo(resmiMap[markaFiltre]) : null} koyu={koyu} />
              </div>
            </Card>
          </Col>

          {/* SAĞ: 4 varlık detayı */}
          <Col xs={24} lg={6}>
            <Card size="small" style={{ height: "100%" }} title={baslik(4, "SEÇİLEN VARLIK DETAYI")}>
              <EntityDetail aday={secili} rapor={rapor} yukleniyor={yukleniyor} markaAdi={markaAdi} resmiDom={secili ? resmiMap[secili.marka] : undefined} onYenile={() => secili && analizEt(secili, true)} />
            </Card>
          </Col>

          {/* ALT SOL: 5 canlı akış */}
          <Col xs={24} lg={18}>
            <Card size="small" title={baslik(5, "CANLI OLAY AKIŞI")}>
              <Table
                size="small" pagination={false} rowKey={(r) => `${r.zaman}-${r.tip}-${r.varlik}`} scroll={{ x: "max-content" }}
                dataSource={olaylar(akis, gosterilen, markaFiltre)}
                locale={{ emptyText: <Empty description="Canlı olay bekleniyor…" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                columns={[
                  { title: "Zaman", dataIndex: "zaman", width: 90, render: (v) => <Text style={{ fontFamily: "'IBM Plex Mono',monospace", color: "var(--c-8fa6bd)", fontSize: 11 }}>{v}</Text> },
                  { title: "Olay Tipi", dataIndex: "tip", width: 170, render: (v, r) => <Text style={{ color: r.renk, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, fontWeight: 600 }}>{v}</Text> },
                  { title: "Açıklama", dataIndex: "aciklama", ellipsis: true, render: (v) => <Text style={{ color: "var(--c-a7bccf)", fontSize: 12 }}>{v}</Text> },
                  { title: "İlişkili Varlık", dataIndex: "varlik", width: 220, ellipsis: true, render: (v) => <Text style={{ fontFamily: "'IBM Plex Mono',monospace", color: "var(--c-8fa6bd)", fontSize: 11 }}>{v}</Text> },
                  { title: "Skor", dataIndex: "skor", width: 60, align: "center", render: (v) => v ? <Tag color={v >= 60 ? "error" : "warning"} style={{ margin: 0, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</Tag> : <Text type="secondary">–</Text> },
                ]}
              />
            </Card>
          </Col>

          {/* ALT SAĞ: 6 küçük istatistikler */}
          <Col xs={24} lg={6}>
            <Card size="small" style={{ height: "100%" }} title={baslik(6, "KÜÇÜK İSTATİSTİKLER")}>
              <Row gutter={[10, 10]}>
                <Col span={12}><MiniStat n={sayim.toplam} t="Toplam Gözlem" renk="var(--c-e9f2fa)" /></Col>
                <Col span={12}><MiniStat n={new Set(markaAdaylari.map((a) => a.marka)).size} t="İzlenen Marka" renk="var(--c-4d9fe0)" /></Col>
                <Col span={12}><MiniStat n={sayim.aktif} t="Aktif Tuzak" renk="var(--c-f5222d)" /></Col>
                <Col span={12}><MiniStat n={sayim.yeni} t="Yeni Gözlem" renk="var(--c-31c8b0)" /></Col>
              </Row>
            </Card>
          </Col>
          </>)}
        </Row>
      </div>
    </div>
  );
}

/* ── Alt bileşenler ── */
function Clock() {
  const [t, setT] = useState("--:--:--");
  useEffect(() => { const f = () => setT(new Date().toTimeString().slice(0, 8)); f(); const id = setInterval(f, 1000); return () => clearInterval(id); }, []);
  return <Text style={{ color: "var(--c-8fa6bd)", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{t}</Text>;
}
// Stat satırı AYNI ZAMANDA filtre — iki ayrı liste (stat + Hızlı Filtre) yerine tek liste.
// Tıklanınca o kovaya süzer; seçili satır vurgulanır. renk = grafik durum rengiyle eş.
function StatSatir({ ikon, t, n, son, renk, aktif, onClick }: { ikon: React.ReactNode; t: string; n?: number; son?: boolean; renk?: string; aktif?: boolean; onClick?: () => void }) {
  return (
    <Flex align="center" gap={10} onClick={onClick} role={onClick ? "button" : undefined}
      style={{ padding: "8px", margin: "0 -8px", borderRadius: 8, cursor: onClick ? "pointer" : "default",
        background: aktif ? "var(--c-152337)" : "transparent",
        boxShadow: aktif && renk ? `inset 2px 0 0 ${renk}` : "none",
        borderBottom: son ? "none" : "1px solid var(--c-12202e)" }}>
      {ikon}<Text style={{ color: aktif ? "var(--c-e9f2fa)" : "var(--c-a7bccf)", fontSize: 12.5, fontWeight: aktif ? 600 : 400 }}>{t}</Text>
      {n === undefined
        ? <span className="material-symbols-outlined" style={{ marginLeft: "auto", fontSize: 18, color: aktif ? (renk || "var(--c-4d9fe0)") : "var(--c-5b6b7d)" }}>chevron_right</span>
        : <Text strong style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, color: aktif && renk ? renk : undefined }}>{fmt(n)}</Text>}
    </Flex>
  );
}
function MiniStat({ n, t, renk }: { n: number; t: string; renk: string }) {
  return <div style={{ background: "rgba(47,111,176,.06)", border: "1px solid var(--c-17293c)", borderRadius: 10, padding: 12 }}><div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 26, fontWeight: 600, color: renk, lineHeight: 1 }}>{fmt(n)}</div><Text type="secondary" style={{ fontSize: 10.5, marginTop: 5, display: "block" }}>{t}</Text></div>;
}
function Efsane({ renk, t, halka }: { renk: string; t: string; halka?: boolean }) {
  return <Flex align="center" gap={5}><span style={{ width: 9, height: 9, borderRadius: "50%", background: halka ? "transparent" : renk, border: halka ? `2px solid ${renk}` : "none" }} /><Text style={{ fontSize: 9.5, color: "var(--c-8fa6bd)" }}>{t}</Text></Flex>;
}

function olaylar(akis: AkisSatir[], adaylar: Aday[], markaFiltre: string) {
  const saat = (d = new Date()) => d.toTimeString().slice(0, 8);
  const out: { zaman: string; tip: string; renk: string; aciklama: string; varlik: string; skor?: number }[] = [];
  // Olay tipi DURUMA göre (ham skora göre değil). Park .ph spam'i "TEHDİT OLUŞTURULDU"
  // diye kırmızı basmak aşırı-iddiaydı; artık durumun dürüst etiketini gösterir.
  for (const a of [...adaylar].sort((x, y) => y.skor - x.skor).slice(0, 3)) {
    const aktif = a.durum === "aktif-tuzak" || a.durum === "canli";
    const park = a.durum === "park" || a.durum === "yayinda-degil";
    out.push({
      zaman: saat(),
      tip: aktif ? "AKTİF TUZAK" : park ? "PARK · İZLEMEDE" : "İNCELEMEDE",
      renk: aktif ? "var(--c-ff5468)" : park ? "var(--c-8fb0d4)" : "var(--c-faad14)",
      aciklama: `${a.domain} · ${buyukHarf(a.marka)} ${aktif ? "taklidi" : "eşleşmesi"}`,
      varlik: a.domain, skor: a.skor,
    });
  }
  for (const e of akis.filter((x) => !markaFiltre || (x.marka || "").toLowerCase() === markaFiltre).slice(0, 4)) {
    out.push({ zaman: saat(), tip: e.marka ? "MARKA EŞLEŞMESİ" : "YENİ SERTİFİKA", renk: e.marka ? "var(--c-faad14)" : "var(--c-4d9fe0)", aciklama: e.marka ? `${e.domain} → ${buyukHarf(e.marka)} ilişkili sertifika` : `${e.domain} · CT sertifikası yayınlandı`, varlik: e.domain });
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

// Taze canlılık damgası — domainin ŞU ANKİ durumu (/api/canlilik). Kesinlik kapısı motorda:
// "KALDIRILMIŞ" ancak NXDOMAIN×2 (iki çözücü) ile; emin değilse "DURUM DOĞRULANAMADI" der,
// asla canlı bir siteyi yanlışlıkla "ölü" damgalamaz. Skor=ciddiyet, bu=güncel durum (ayrı).
function CanlilikRozet({ v, yuk }: { v: { durum: string; kokNeden: string } | null; yuk: boolean }) {
  const M: Record<string, { ad: string; renk: string }> = {
    live: { ad: "CANLI", renk: "#ff5468" },
    redirect: { ad: "YÖNLENDİRİYOR", renk: "#e5772f" },
    parked: { ad: "PARK · PASİF", renk: "#e5a53f" },
    erisim_kisitli: { ad: "ERİŞİM KISITLI (403)", renk: "#e5a53f" },
    dead: { ad: "KALDIRILMIŞ · ERİŞİLEMEZ", renk: "#8fa6bd" },
    bilinmiyor: { ad: "DURUM DOĞRULANAMADI", renk: "#8fa6bd" },
  };
  if (yuk) return <div style={{ marginTop: 6 }}><Text style={{ fontSize: 10.5, color: "var(--c-8fa6bd)" }}>Güncel durum sorgulanıyor </Text><Spin size="small" /></div>;
  if (!v) return null;
  const m = M[v.durum] || M.bilinmiyor;
  return (
    <div style={{ marginTop: 8, background: `${m.renk}1f`, border: `1px solid ${m.renk}55`, borderRadius: 6, padding: "6px 9px" }}>
      <Flex align="center" gap={6}>
        <span style={{ width: 7, height: 7, borderRadius: 4, background: m.renk, flexShrink: 0 }} />
        <Text strong style={{ fontSize: 11, color: m.renk, letterSpacing: 0.5 }}>ŞU AN: {m.ad}</Text>
      </Flex>
      {v.kokNeden && <Text style={{ fontSize: 10, color: "var(--c-8fa6bd)", display: "block", marginTop: 3, lineHeight: 1.4 }}>{v.kokNeden}</Text>}
    </div>
  );
}

// Altyapı İzi (Passive DNS): domainin geçmiş IP'leri + aynı ADANMIŞ IP'yi paylaşan kardeş
// domainler. Paylaşımlı/CDN altyapı kapısı /api/pasif-dns'te → burada yalnız gerçek bağ gösterilir.
function PasifDnsBolum({ domain }: { domain: string }) {
  const [veri, setVeri] = useState<null | { gecmisIpler: { ip: string; sonGorulen?: number }[]; kardesDomainler: { domain: string; pivot: string }[]; paylasimliAltyapi: boolean; pivotSayisi: number; not?: string }>(null);
  const [yuk, setYuk] = useState(false);
  useEffect(() => {
    let iptal = false; setVeri(null); setYuk(true);
    fetch(`/api/pasif-dns?domain=${encodeURIComponent(domain)}`)
      .then((r) => r.json()).then((j) => { if (!iptal) setVeri(j); }).catch(() => {}).finally(() => { if (!iptal) setYuk(false); });
    return () => { iptal = true; };
  }, [domain]);
  const gecmis = veri?.gecmisIpler || [], kardes = veri?.kardesDomainler || [];
  if (!yuk && !gecmis.length && !kardes.length && !veri?.paylasimliAltyapi) return null; // gösterecek gerçek bir şey yoksa hiç çizme
  return (
    <div>
      <Text strong style={{ fontSize: 11, letterSpacing: ".05em" }}>Altyapı İzi (Passive DNS) {yuk && <Spin size="small" />}</Text>
      <Flex vertical gap={5} style={{ marginTop: 8 }}>
        {gecmis.length > 0 && (
          <Flex align="center" gap={8}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--c-5c748b)" }}>dns</span>
            <Text style={{ fontSize: 12, color: "var(--c-a7bccf)" }}>Geçmiş IP çözümlemesi</Text>
            <Text strong style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5 }}>{gecmis.length}</Text>
          </Flex>
        )}
        {kardes.length > 0 ? (
          <>
            <Flex align="center" gap={8}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--c-4d9fe0)" }}>hub</span>
              <Text style={{ fontSize: 12, color: "var(--c-a7bccf)" }}>Aynı altyapıdaki kardeş domain</Text>
              <Text strong style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: "var(--c-4d9fe0)" }}>{kardes.length}</Text>
            </Flex>
            <Flex vertical gap={2} style={{ paddingLeft: 22 }}>
              {kardes.slice(0, 6).map((k, i) => (
                <Text key={i} style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "var(--c-cfe0ef)", wordBreak: "break-all" }} title={`ortak IP: ${k.pivot}`}>· {k.domain}</Text>
              ))}
              {kardes.length > 6 && <Text style={{ fontSize: 10.5, color: "var(--c-5c748b)" }}>+{kardes.length - 6} daha</Text>}
            </Flex>
          </>
        ) : veri?.paylasimliAltyapi ? (
          <Text style={{ fontSize: 11, color: "var(--c-5c748b)" }}>Altyapı paylaşımlı (CDN/ortak barındırma) — aynı IP'deki domainler alakalı sayılmaz.</Text>
        ) : (!yuk && gecmis.length > 0) ? (
          <Text style={{ fontSize: 11, color: "var(--c-5c748b)" }}>Adanmış IP'de başka domain görülmedi.</Text>
        ) : null}
      </Flex>
    </div>
  );
}

function EntityDetail({ aday, rapor, yukleniyor, markaAdi, resmiDom, onYenile }: { aday: Aday | null; rapor: Rapor | null; yukleniyor: boolean; markaAdi: string; resmiDom?: string; onYenile?: () => void }) {
  // Taze canlılık ŞU AN durumu — TEK sefer çek; hem "ŞU AN" rozetine hem Saldırı Gelişimi
  // uzlaştırmasına verilir (birikmiş kanıt vs güncel gerçeklik çelişkisini önler).
  const [canliV, setCanliV] = useState<{ durum: string; kokNeden: string } | null>(null);
  const [canliYuk, setCanliYuk] = useState(false);
  const domainZ = aday?.domain;
  useEffect(() => {
    if (!domainZ) { setCanliV(null); return; }
    let iptal = false; setCanliV(null); setCanliYuk(true);
    fetch(`/api/canlilik?domain=${encodeURIComponent(domainZ)}`)
      .then((r) => r.json()).then((j) => { if (!iptal) setCanliV(j); }).catch(() => {}).finally(() => { if (!iptal) setCanliYuk(false); });
    return () => { iptal = true; };
  }, [domainZ]);
  if (!aday) return <Empty description={<span style={{ color: "var(--c-8fa6bd)" }}><b style={{ color: "var(--c-31c8a0)" }}>{markaAdi} için tehdit yok</b><br />Sistem izlemeye devam ediyor.</span>} />;
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
        <Flex align="flex-start" justify="space-between" gap={8}>
          <Text style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, wordBreak: "break-all" }}>{aday.domain}</Text>
          {onYenile && <Button size="small" type="text" loading={yukleniyor} onClick={onYenile} title="Önbelleği atla, siteyi şimdi yeniden tara"
            icon={<span className="material-symbols-outlined" style={{ fontSize: 16, lineHeight: 1 }}>refresh</span>} style={{ color: "var(--c-8fa6bd)", flexShrink: 0 }} />}
        </Flex>
        <Tag color={sev.c as string} style={{ marginTop: 8 }}>{sev.t}</Tag>
        <CanlilikRozet v={canliV} yuk={canliYuk} />
      </div>
      <div style={{ borderTop: "1px solid var(--c-17293c)", borderBottom: "1px solid var(--c-17293c)", padding: "10px 0" }}>
        <Statistic title="Güven Skoru" value={yukleniyor && !rapor ? "…" : risk} suffix="/100" valueStyle={{ color: renk, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }} />
        <Progress percent={Math.min(100, risk)} showInfo={false} strokeColor={renk} trailColor="var(--c-17293c)" size={{ height: 6 }} style={{ marginTop: 6, marginBottom: 0 }} />
      </div>

      <EtbisRozet rapor={rapor} />
      <SaldiriGelisimi rapor={rapor} canli={canliV?.durum} />

      <div>
        <Text strong style={{ fontSize: 11, letterSpacing: ".05em" }}>Neden Tehdit? {yukleniyor && <Spin size="small" />}</Text>
        {neden.length === 0 && !yukleniyor && <div><Text type="secondary" style={{ fontSize: 11 }}>Güçlü sinyal yok — düşük öncelik.</Text></div>}
        <Flex vertical gap={6} style={{ marginTop: 8 }}>
          {neden.map((n, i) => (
            <Flex key={i} align="center" gap={8}>
              <SafetyCertificateOutlined style={{ color: "var(--c-31c8a0)", fontSize: 13 }} />
              <Text style={{ fontSize: 12, color: "var(--c-a7bccf)" }}>{n.t}</Text>
              {n.m && <Text strong style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5 }}>{n.m}</Text>}
            </Flex>
          ))}
        </Flex>
      </div>
      {(() => {
        // Boş "—" satırları GÖSTERME (panel "yarım/bozuk" görünmesin). Yalnız gerçek değeri
        // olanı yaz. IP istisna: "A kaydı yok" anlamlı bir sinyal (site yayında değil) → kalır.
        const cert = alan("En yeni sertifika") || alan("Sertifika (urlscan)");
        const satirlar: { key: string; label: string; children: React.ReactNode }[] = [];
        if (ilk) satirlar.push({ key: "1", label: "İlk Gözlenme", children: zmn(ilk) });
        if (son) satirlar.push({ key: "2", label: "Son Gözlenme", children: zmn(son) });
        if (rapor) satirlar.push({ key: "3", label: "IP Adresi", children: alan("IP adresi") || "A kaydı yok (yayında değil)" });
        if (alan("Ağ (ASN)")) satirlar.push({ key: "4", label: "ASN", children: alan("Ağ (ASN)")! });
        if (cert) satirlar.push({ key: "5", label: "Sertifika", children: cert });
        if (rapor?.dna && rapor.dna.eslesenler.length > 0) satirlar.push({ key: "6", label: "Kardeş domain", children: `${rapor.dna.eslesenler.length} (kampanya)` });
        if (!satirlar.length) return null;
        return (
          <Descriptions column={1} size="small" colon={false} items={satirlar}
            labelStyle={{ color: "var(--c-5c748b)", fontSize: 11.5 }}
            contentStyle={{ color: "var(--c-cfe0ef)", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, justifyContent: "flex-end", textAlign: "right" }}
          />
        );
      })()}
      <PasifDnsBolum domain={aday.domain} />
      <KarsilastirGorsel resmiDom={resmiDom} fakeDom={aday.domain} fakeShot={rapor?.ekranGoruntusu} benzerlik={benzerlik} markaAdi={markaAdi} />

      <Flex vertical gap={8}>
        {/* BİRİNCİL AKSİYON: "izle" değil "yap". USOM resmî ihbar formunu açar (ihbarı
            kullanıcı gönderir — otomatik göndermeyiz; dürüst). Alanı panoya kopyalar. */}
        <Button type="primary" icon={<span className="material-symbols-outlined" style={{ fontSize: 16, lineHeight: 1 }}>flag</span>}
          onClick={() => { try { navigator.clipboard?.writeText(aday.domain); } catch { /* pano yoksa geç */ } window.open("https://www.usom.gov.tr/ihbar", "_blank", "noopener,noreferrer"); }}
          style={{ height: 40, fontWeight: 600 }}>USOM'a Bildir</Button>
        <Text type="secondary" style={{ fontSize: 10, textAlign: "center", marginTop: -2 }}>Alan adı panoya kopyalanır · ihbarı sen gönderirsin</Text>
        <Flex gap={8}>
          <Button block danger icon={<ExportOutlined />} href={`http://${aday.domain}`} target="_blank" rel="noopener noreferrer nofollow">Siteyi Gör</Button>
          <Button block icon={<FileSearchOutlined />} href={`/sorgula?q=${encodeURIComponent(aday.domain)}`}>Tam Rapor</Button>
        </Flex>
        <Button block icon={<span className="material-symbols-outlined" style={{ fontSize: 16, lineHeight: 1 }}>picture_as_pdf</span>}
          href={`/api/marka-rapor-pdf?marka=${encodeURIComponent(aday.marka)}&domain=${encodeURIComponent(aday.domain)}`} target="_blank" rel="noopener">
          Bu tespit için rapor (PDF)
        </Button>
      </Flex>
    </Flex>
  );
}

// ETBİS ROZETİ — Ticaret Bakanlığı e-ticaret sicili durumu (resmî meşruiyet sinyali).
// Rapordaki "ETBİS" alanına göre yeşil/kırmızı/nötr rozet. Alan yoksa (banka/kamu gibi
// e-ticaret olmayan → ETBİS beklenmez) hiçbir şey çizme.
function EtbisRozet({ rapor }: { rapor: Rapor | null }) {
  const deger = rapor?.alanlar?.find((a) => a.ad === "ETBİS")?.deger;
  if (!deger) return null;
  const dogrulanmis = /doğrulanmış/i.test(deger);
  const kayitsiz = /değil/i.test(deger);
  const teyitsiz = /teyit edilemedi/i.test(deger);
  const kayitli = !kayitsiz && !teyitsiz;
  const stil = kayitli
    ? { bg: "var(--c-0e2f1e)", bd: "var(--c-31c8a0)", fg: "var(--c-3ee08a)", ikon: "verified", baslik: dogrulanmis ? "ETBİS · Kayıtlı ve doğrulanmış" : "ETBİS · Kayıtlı", alt: "Ticaret Bakanlığı e-ticaret sicilinde" }
    : kayitsiz
      ? { bg: "var(--c-2a0d13)", bd: "var(--c-ff5468)", fg: "var(--c-ff9aa4)", ikon: "gpp_bad", baslik: "ETBİS · Kayıt YOK", alt: "E-ticaret görünümlü ama sicilde kayıtlı değil" }
      : { bg: "var(--c-1a1206)", bd: "var(--c-faad14)", fg: "var(--c-f6c877)", ikon: "help", baslik: "ETBİS · Teyit edilemedi", alt: "Sicil sorgusuna şu an ulaşılamadı" };
  return (
    <Flex align="center" gap={10} style={{ background: stil.bg, border: `1px solid ${stil.bd}`, borderRadius: 10, padding: "9px 11px" }}>
      <span className="material-symbols-outlined" style={{ fontSize: 20, color: stil.fg, lineHeight: 1 }}>{stil.ikon}</span>
      <div style={{ minWidth: 0 }}>
        <Text strong style={{ color: stil.fg, fontSize: 12, display: "block", lineHeight: 1.2 }}>{stil.baslik}</Text>
        <Text style={{ color: "var(--c-8fa6bd)", fontSize: 10.5 }}>{stil.alt}</Text>
      </div>
    </Flex>
  );
}

// SALDIRI GELİŞİMİ — "saldırıyı doğmadan yakala": olgunlaşma aşaması + gerçek zaman
// damgaları + durum bannerı ("SALDIRI GELİŞİYOR") + risk tırmanış çizgisi.
function SaldiriGelisimi({ rapor, canli }: { rapor: Rapor | null; canli?: string }) {
  if (!rapor || !rapor.asamalar?.length) return null;
  const asamalar = rapor.asamalar; const asama = rapor.asama ?? 0;
  const alan = (x: string) => rapor.alanlar?.find((a) => a.ad.startsWith(x))?.deger;
  // ── CANLILIK UZLAŞTIRMASI (aşırı-iddia yok) ──
  // Saldırı aşaması BİRİKMİŞ kanıttan gelir; ama "canlı tehdit / şu an burada" iddiası ancak
  // adres ŞU AN gerçekten CANLI içerik sunuyorsa doğrudur. Yönlendiriyor/park/ölü/erişim-kısıtlı
  // ise kill-chain bu adreste ŞU AN doğrulanamaz → banner ve işaretçi dürüstçe düşürülür.
  const canliServis = canli === "live";
  const canliBilgiVar = Boolean(canli);
  const celiski = asama >= 4 && canliBilgiVar && !canliServis; // yüksek kanıt ama canlı içerik yok
  const canliAd: Record<string, string> = { redirect: "başka adrese yönlendiriyor", parked: "park/satılık (pasif)", dead: "erişilemez/kaldırılmış", erisim_kisitli: "erişim kısıtlı (HTTP 403)", bilinmiyor: "durumu doğrulanamıyor" };
  const durum = celiski
    ? { t: "CANLI İÇERİK DOĞRULANMADI", d: `Geçmiş taramalarda "${asamalar[Math.min(asama, asamalar.length - 1)]}" aşamasına dek işaretler gözlendi; ancak adres ŞU AN ${canliAd[canli!] || canli} — bu adreste canlı kimlik/kart toplama şu an DOĞRULANAMIYOR.`, type: "warning" as const, ikon: <ClockCircleOutlined /> }
    : asama >= 6
      ? { t: "AKTİF SALDIRI", d: "Kimlik/kart toplama aşamasında — canlı tehdit.", type: "error" as const, ikon: <WarningOutlined /> }
      : asama >= 4
        ? { t: "SALDIRI GELİŞİYOR", d: "Sahte marka varlığı/form sitede doğrulandı — olaya dönüşmeden yakalandı.", type: "warning" as const, ikon: <ThunderboltOutlined /> }
        : asama === 3
          ? { t: "YAYINDA — İZLEMEDE", d: "Site yayında ama taklit içerik/marka varlığı henüz doğrulanmadı.", type: "info" as const, ikon: <ClockCircleOutlined /> }
          : { t: "İZLEMEDE — HAZIRLIK", d: "Altyapı hazır (domain + sertifika); yayın içeriği doğrulanamadı (park/bot-duvarı olabilir).", type: "info" as const, ikon: <ClockCircleOutlined /> };
  const kayit = alan("Kayıt tarihi");
  const certGecmis = alan("Sertifika geçmişi");
  const certIlk = certGecmis?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || alan("En yeni sertifika")?.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const zaman = (i: number) => (i === 0 ? kayit : i === 2 ? certIlk : undefined);
  return (
    <div>
      <Alert showIcon icon={durum.ikon} type={durum.type} banner message={<b>{durum.t}</b>} description={<span style={{ fontSize: 11.5 }}>{durum.d}</span>} style={{ marginBottom: 10, borderRadius: 8 }} />
      <Text strong style={{ fontSize: 11, letterSpacing: ".05em" }}>Saldırı Olgunlaşması</Text>
      <Timeline
        style={{ marginTop: 12, marginBottom: 0 }}
        items={asamalar.map((s, i) => ({
          color: i < asama ? "green" : i === asama ? (celiski ? "blue" : asama >= 6 ? "red" : "orange") : "gray",
          dot: i === asama ? <ThunderboltOutlined style={{ fontSize: 12 }} /> : undefined,
          children: (
            <Flex justify="space-between" gap={8}>
              <Text style={{ fontSize: 12, color: i <= asama ? "var(--c-cfe0ef)" : "var(--c-5c748b)", fontWeight: i === asama ? 600 : 400 }}>{s}{i === asama ? (celiski ? " · gözlendi (şu an canlı değil)" : " · şu an burada") : ""}</Text>
              {zaman(i) && <Text style={{ fontSize: 10, color: "var(--c-8fa6bd)", fontFamily: "'IBM Plex Mono',monospace", whiteSpace: "nowrap" }}>{zaman(i)}</Text>}
            </Flex>
          ),
        }))}
      />
      {rapor.gecmis && rapor.gecmis.length >= 2 && <RiskCizgi gecmis={rapor.gecmis} />}
    </div>
  );
}
function RiskCizgi({ gecmis }: { gecmis: Gecmis[] }) {
  const w = 260, h = 42, pad = 3, n = gecmis.length;
  const pts = gecmis.map((g, i) => [pad + (i * (w - 2 * pad)) / Math.max(1, n - 1), h - pad - (Math.min(100, g.risk) / 100) * (h - 2 * pad)] as [number, number]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const renk = seviye(gecmis[n - 1].risk).renk;
  return (
    <div style={{ marginTop: 4 }}>
      <Text style={{ fontSize: 10, color: "var(--c-8fa6bd)" }}>Risk gelişimi · {gecmis[0].risk} → {gecmis[n - 1].risk} ({n} gözlem)</Text>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 42, display: "block" }} preserveAspectRatio="none">
        <path d={`${line} L${pts[n - 1][0].toFixed(1)} ${h} L${pad} ${h} Z`} fill={renk} fillOpacity={0.15} />
        <path d={line} fill="none" stroke={renk} strokeWidth="2" strokeLinejoin="round" />
        <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r="3" fill={renk} />
      </svg>
    </div>
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
      <div style={{ fontSize: 9, letterSpacing: ".06em", color: "var(--c-8fa6bd)", marginBottom: 4, textTransform: "uppercase" }}>{baslik}</div>
      <div style={{ aspectRatio: "16/10", borderRadius: 8, border: `1px solid ${kenar}`, overflow: "hidden", background: "var(--c-0a1420)", display: "grid", placeItems: "center" }}>
        {yuk ? <Spin size="small" /> : src
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt={alt} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          : <span style={{ fontSize: 10, color: "var(--c-5c748b)" }}>görüntü yok</span>}
      </div>
      <div style={{ fontSize: 9.5, color: "var(--c-8fa6bd)", marginTop: 3, fontFamily: "'IBM Plex Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alt}</div>
    </div>
  );

  return (
    <div style={{ borderTop: "1px solid var(--c-17293c)", paddingTop: 12 }}>
      <Text strong style={{ fontSize: 11, letterSpacing: ".05em" }}>Gerçek vs Sahte</Text>
      <Flex gap={10} style={{ marginTop: 8 }}>
        {kutu("GERÇEK MARKA", resmiDom || markaAdi, gercek, gYuk, "var(--c-1f4b78)")}
        {kutu("ŞÜPHELİ SİTE", fakeDom, sahte, sYuk, "var(--c-5a2226)")}
      </Flex>
      {typeof benzerlik === "number" && (
        <Flex align="center" gap={8} style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 10.5, color: "var(--c-8fa6bd)" }}>GÖRSEL BENZERLİK</Text>
          <Progress percent={benzerlik} size="small" strokeColor={seviye(benzerlik).renk} style={{ flex: 1, margin: 0 }} format={(p) => <span style={{ color: "var(--c-e9f2fa)", fontFamily: "'IBM Plex Mono',monospace" }}>%{p}</span>} />
        </Flex>
      )}
    </div>
  );
}

/* THREAT UNIVERSE — marka merkezli force-graph + seçilenin altyapı alt-grafiği */
function ThreatUniverse({ marka, adaylar, secili, rapor, onSelect, logo, koyu = true }: { marka: string; adaylar: Aday[]; secili: Aday | null; rapor: Rapor | null; onSelect: (a: Aday) => void; logo?: string | null; koyu?: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const st = useRef<{ nodes: any[]; merkez: any; altyapi: any[] }>({ nodes: [], merkez: null, altyapi: [] });
  const adRef = useRef(adaylar); adRef.current = adaylar;
  const selRef = useRef(secili); selRef.current = secili;
  const rapRef = useRef(rapor); rapRef.current = rapor;
  const markaRef = useRef(marka); markaRef.current = marka;
  const logoRef = useRef(logo); logoRef.current = logo;
  const koyuRef = useRef(koyu); koyuRef.current = koyu;
  const acikKume = useRef<Set<string>>(new Set()); // tıklanınca açılan park kümeleri (TLD)

  useEffect(() => {
    const canvas = cv.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!; const DPR = Math.min(2, devicePixelRatio || 1);
    // Canvas CSS değişkenini çözemez → "var(--c-xxxxxx)"'i çizim anında gerçek renge çevir (tema değişince otomatik).
    // Değişkeni .pano kökünden oku; okunamazsa --c-<hex> zaten #<hex> demek → koyu hex'e düş (asla çıplak var dönme, çökme yok).
    const coz = (v: string): string => {
      const m = /var\(--c-([0-9a-fA-F]{6})\)/.exec(v); if (!m) return v;
      const kok = canvas.closest(".pano") || document.documentElement;
      return getComputedStyle(kok).getPropertyValue("--c-" + m[1]).trim() || ("#" + m[1]);
    };
    // Tema-duyarlı yapısal renk (zemin/dolgu/etiket) — canvas CSS-var okuyamadığından koyu/açık
    // gerçek hex'i koyuRef'ten seçer. Aksanlar (kırmızı/turuncu) coz ile aynı kalır.
    const T = (dark: string, light: string) => (koyuRef.current ? dark : light);
    let W = 0, H = 0, raf = 0; const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const resize = () => { const b = canvas.getBoundingClientRect(); W = b.width; H = b.height; canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
    // Merkez marka logosu (favicon) — canvas'a çizilir; şeffaf/CORS olsa da GÖRÜNTÜLEME serbest
    // (piksel OKUMAYIZ → tainting sorun değil). Marka değişince kur()'da src güncellenir.
    const logoImg = new Image();

    function kur() {
      if (logoRef.current && logoImg.src !== logoRef.current) logoImg.src = logoRef.current;
      // ÖĞELER = tekil sahteler + park KÜMELERİ (aynı TLD, ≥6, kapalıyken tek düğüm). Böylece
      // "225 canlı sahte" yanılsaması yok: aktif/canlı tek tek, dormant park'lar toplu.
      const acik = acikKume.current;
      const tld = (d: string) => { const p = String(d).toLowerCase().replace(/\.$/, "").split("."); return p[p.length - 1] || ""; };
      const parkMi = (a: any) => a.durum === "park" || a.durum === "yayinda-degil";
      const grup: Record<string, any[]> = {}; const tekiller: any[] = [];
      for (const a of adRef.current) { if (parkMi(a)) (grup[tld(a.domain)] ||= []).push(a); else tekiller.push(a); }
      const items: any[] = tekiller.map((a) => ({ aday: a }));
      for (const [t, uyeler] of Object.entries(grup)) {
        if (uyeler.length >= 6 && !acik.has(t)) items.push({ kume: { tld: t, uyeler, sayi: uyeler.length, skor: Math.max(0, ...uyeler.map((u) => u.skor || 0)) } });
        else for (const a of uyeler) items.push({ aday: a });
      }
      const skorOf = (it: any) => it.kume ? it.kume.skor : (it.aday.skor || 0);
      // HALKA = ÖNEM: en iç halka en tehlikeli. aktif-tuzak(iç) → canlı → park → küme/pasif(dış).
      const katman = (it: any) => it.kume ? 0 : (it.aday.durum === "aktif-tuzak" ? 3 : it.aday.durum === "canli" ? 2 : it.aday.durum === "park" ? 1 : 0);
      items.sort((x, y) => (katman(y) - katman(x)) || (skorOf(y) - skorOf(x)));
      const secilenler = items.slice(0, 140);
      const N = secilenler.length, cok = N;
      const cx = W / 2, cy = H * (cok > 18 ? 0.5 : 0.42); const merkez = { x: cx, y: cy, r: cok > 40 ? 26 : 30 };
      const nr = N > 60 ? 5 : N > 36 ? 6.5 : N > 18 ? 8.5 : N > 9 ? 11 : 13; // düğüm yarıçapı (çoksa küçülür)
      const baseR = Math.min(W, H) * (N > 24 ? 0.17 : 0.24);
      const step = Math.min(W, H) * (N > 60 ? 0.085 : N > 24 ? 0.11 : 0.14);
      const Rmax = Math.min(cx, cy) - nr - 14; // canvas'a sığan en dış yarıçap
      const nodes: any[] = [];
      let idx = 0, ring = 0;
      while (idx < N) {
        const R = baseR + ring * step;
        if (R > Rmax && ring > 0) break; // canvas dışına taşma → dur
        const cap = Math.max(6, Math.floor((2 * Math.PI * R) / (nr * 2 + 26)));
        const bu = Math.min(cap, N - idx);
        for (let k = 0; k < bu; k++) {
          const ang = -Math.PI / 2 + (k / bu) * Math.PI * 2 + (ring % 2 ? Math.PI / bu : 0);
          const it = secilenler[idx];
          // BOYUT = ÖNEM: aktif tuzak en büyük, canlı orta, inceleme baz, park en küçük.
          // Göz otomatik gerçek tehdide gitsin (eskiden hepsi ~aynı boyuttaydı).
          const du = it.aday?.durum;
          const rr = it.kume ? nr + 5 : du === "aktif-tuzak" ? nr + 4 : du === "canli" ? nr + 2 : du === "park" || du === "yayinda-degil" ? Math.max(3.5, nr - 1.5) : nr;
          // Hedef = tam halka konumu (rastgele sapma YOK). İlk kur'da uzaktan başlat → yumuşak otur.
          const tx = cx + Math.cos(ang) * R, ty = cy + Math.sin(ang) * R;
          const eski = st.current?.nodes?.find((o: any) => (o.aday?.domain && o.aday.domain === it.aday?.domain) || (o.kume && it.kume && o.kume.tld === it.kume.tld));
          nodes.push({ item: it, aday: it.aday, kume: it.kume, hx: tx, hy: ty, x: eski ? eski.x : tx, y: eski ? eski.y : ty, r: rr, ang, R });
          idx++;
        }
        ring++;
      }
      st.current = { nodes, merkez, altyapi: [] } as any;
      (st.current as any).nr = nr;
      // Altyapı alt-grafiği yalnız az düğümde (çok sahtede ekran zaten dolu) — seçilenin IP/NS/ASN'i.
      const r = rapRef.current; const alt: any[] = [];
      if (r && N <= 14) {
        const alan = (x: string) => r.alanlar?.find((a) => a.ad.startsWith(x))?.deger;
        const ip = alan("IP adresi"), ns = alan("Ad sunucusu"), asn = alan("Ağ (ASN)"), cert = alan("En yeni sertifika") || alan("Sertifika (urlscan)");
        const iy = cy + Math.min(W, H) * 0.36;
        const hub = { label: ip || "IP", x: cx, y: iy, r: 13, hub: true };
        alt.push(hub);
        if (ns) alt.push({ label: (ns.split(",")[0] || "").trim().slice(0, 16), x: cx - 120, y: iy + 44, r: 11, bagli: hub });
        if (cert) alt.push({ label: "cert", x: cx, y: iy + 66, r: 11, bagli: hub });
        if (asn) alt.push({ label: asn.replace(/\s.*/, "").slice(0, 12) || "ASN", x: cx + 120, y: iy + 44, r: 11, bagli: hub });
      }
      (st.current as any).altyapi = alt;
    }
    kur(); const kurT = setInterval(kur, 3500);

    canvas.onclick = (e) => {
      const b = canvas.getBoundingClientRect(); const mx = e.clientX - b.left, my = e.clientY - b.top;
      let best: any = null, bd = 520;
      for (const n of st.current.nodes) { const d = (n.x - mx) ** 2 + (n.y - my) ** 2; if (d < bd) { bd = d; best = n; } }
      if (!best) return;
      if (best.kume) { // KÜME düğümü → aç/kapa (üyeleri tek tek göster/topla)
        if (acikKume.current.has(best.kume.tld)) acikKume.current.delete(best.kume.tld);
        else acikKume.current.add(best.kume.tld);
        kur();
      } else if (best.aday) onSelect(best.aday);
    };

    let t = 0;
    function frame() {
      t += 0.015;
      const { nodes, merkez, altyapi } = st.current;
      const nr = (st.current as any).nr || 12;
      // RENK = DURUM (canlılık) — "hepsi kırmızı=aktif" yanılsamasını önler: aktif kırmızı,
      // canlı turuncu, park/pasif SOLUK gri; küme soluk gri.
      // TEHDİT RENGİ = REZERVE KIRMIZI AİLESİ. Marka aksanı (altın/turuncu) ile ÇAKIŞMASIN
      // diye "canlı" artık turuncu değil kırmızı-ateş; böylece grafikteki turuncu "marka"
      // değil "tehlike" demek. park/pasif nötr mavi-gri, inceleme (durumsuz) sönük gri.
      const durumRengi = (n: any): string => {
        const park = T("#8fb0d4", "#7089a3"); // park/pasif — nötr, tehdit değil (sayaç/efsane ile eş)
        const inceleme = T("#faad14", "#b4811d"); // inceleme — sarı (dikkat), "İnceleniyor" sayacıyla eş
        if (n.kume) return park;
        const d = n.aday.durum;
        return d === "aktif-tuzak" ? T("#ff5468", "#de374b") : d === "canli" ? T("#e5772f", "#b95b1e") : d === "park" || d === "yayinda-degil" ? park : inceleme;
      };
      // Sakin yerleşim: her düğüm SABİT halka konumuna (hx,hy) yumuşak oturur, sonra durur.
      // İtme/hız yok → titreme yok, kullanıcı rahat tıklar. (Tek hareket: seçili/aktif hafif nabız.)
      let hareket = false;
      for (const n of nodes) {
        const dx = n.hx - n.x, dy = n.hy - n.y;
        if (dx * dx + dy * dy > 0.4) { n.x += dx * 0.14; n.y += dy * 0.14; hareket = true; }
        else { n.x = n.hx; n.y = n.hy; }
      }
      (st.current as any).hareket = hareket;
      ctx.clearRect(0, 0, W, H);
      const sel = selRef.current, rap = rapRef.current;
      // SAHTE ÇİZGİLER KALDIRILDI: merkeze giden ışınlar "bunlar birbiriyle/merkezle bağlantılı
      // bir kampanya" yalanını ima ediyordu. Değiller — bağımsız tespitler. Konum (iç halka =
      // daha tehlikeli) grubu zaten kodluyor; çizgiye gerek yok. GERÇEK ilişki = seçilenin
      // altyapısı (IP/NS/ASN) → yalnız o çizilir (aşağıda), çünkü o gerçek bir bağ.
      if (sel && rap) {
        const isSel0 = (n: any) => n.aday && sel.domain === n.aday.domain;
        for (const n of nodes) if (isSel0(n)) {
          const c = coz(durumRengi(n));
          const mx = merkez.x + (n.x - merkez.x) * 0.5, my = merkez.y + (n.y - merkez.y) * 0.5;
          ctx.beginPath(); ctx.moveTo(merkez.x, merkez.y); ctx.lineTo(n.x, n.y);
          ctx.strokeStyle = hexRgba(c, 0.5); ctx.lineWidth = 1.4; ctx.stroke();
          ctx.font = "600 10px 'IBM Plex Mono',monospace"; ctx.fillStyle = c; ctx.textAlign = "center"; ctx.fillText(iliskiEtiket(rap), mx, my - 2);
        }
      }
      for (const a of altyapi) if (a.bagli) { ctx.beginPath(); ctx.moveTo(a.bagli.x, a.bagli.y); ctx.lineTo(a.x, a.y); ctx.strokeStyle = "rgba(139,125,224,.4)"; ctx.lineWidth = 1; ctx.stroke(); }
      if (altyapi[0]) { ctx.beginPath(); ctx.moveTo(merkez.x, merkez.y); ctx.lineTo(altyapi[0].x, altyapi[0].y); ctx.strokeStyle = "rgba(139,125,224,.25)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.beginPath(); ctx.arc(merkez.x, merkez.y, merkez.r + 12, 0, 6.28); ctx.strokeStyle = "rgba(57,189,248," + (.2 + .12 * Math.sin(t * 2)) + ")"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(merkez.x, merkez.y, merkez.r, 0, 6.28); const g = ctx.createRadialGradient(merkez.x, merkez.y - 8, 2, merkez.x, merkez.y, merkez.r); g.addColorStop(0, T("#0e3a5a", "#dbeafe")); g.addColorStop(1, T("#0a2740", "#bfdbfe")); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = coz("var(--c-39bdf8)"); ctx.lineWidth = 2; ctx.stroke();
      if (logoRef.current && logoImg.complete && logoImg.naturalWidth > 0) {
        // MERKEZE LOGO — beyaz zeminde (favicon şeffaf olabilir), daireye kırp; ad altına.
        ctx.save();
        ctx.beginPath(); ctx.arc(merkez.x, merkez.y, merkez.r - 3, 0, 6.28); ctx.clip();
        ctx.fillStyle = "#ffffff"; ctx.fillRect(merkez.x - merkez.r, merkez.y - merkez.r, merkez.r * 2, merkez.r * 2);
        const s = (merkez.r - 5) * 2;
        ctx.drawImage(logoImg, merkez.x - s / 2, merkez.y - s / 2, s, s);
        ctx.restore();
        ctx.font = "700 8px 'IBM Plex Sans',sans-serif"; ctx.fillStyle = T("#e9f2fa", "#0f172a"); ctx.textAlign = "center"; ctx.fillText(markaRef.current.toUpperCase().slice(0, 16), merkez.x, merkez.y + merkez.r + 11);
      } else {
        ctx.font = "700 12px 'IBM Plex Sans',sans-serif"; ctx.fillStyle = T("#e9f2fa", "#0f172a"); ctx.textAlign = "center"; ctx.fillText(markaRef.current.toUpperCase().slice(0, 12), merkez.x, merkez.y + 3);
        ctx.font = "600 7px 'IBM Plex Mono',monospace"; ctx.fillStyle = T("#5aa9e0", "#2563eb"); ctx.fillText("KORUNAN MARKA", merkez.x, merkez.y + 15);
      }
      const lf0 = Math.max(7, Math.min(9.5, nr * 0.92));
      for (const n of nodes) {
        const c = coz(durumRengi(n));
        const isSel = selRef.current && n.aday && selRef.current.domain === n.aday.domain;
        const aktif = n.aday && (n.aday.durum === "aktif-tuzak" || n.aday.durum === "canli");
        const gl = (Math.sin(t * 3 + n.x) + 1) / 2;
        if (aktif || n.kume) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5 + gl * 3, 0, 6.28); ctx.fillStyle = hexRgba(c, 0.05 + gl * 0.06); ctx.fill(); } // yalnız aktif/küme nabız; park soluk kalsın
        if (isSel) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 6, 0, 6.28); ctx.strokeStyle = T("#e9f2fa", "#0f172a"); ctx.lineWidth = 2; ctx.stroke(); }
        if (n.kume) {
          // KÜME düğümü — "istifli" daireler + üye sayısı; tıkla=aç.
          ctx.fillStyle = T("#12202e", "#ffffff"); ctx.strokeStyle = c; ctx.lineWidth = 1.4;
          for (const off of [5, 2.5, 0]) { ctx.beginPath(); ctx.arc(n.x + off, n.y - off, n.r, 0, 6.28); ctx.fill(); ctx.stroke(); }
          ctx.font = `700 ${Math.max(9, n.r * 0.8)}px 'IBM Plex Mono',monospace`; ctx.fillStyle = c; ctx.textAlign = "center"; ctx.fillText(String(n.kume.sayi), n.x, n.y + n.r * 0.32);
          const lf = Math.max(8, Math.min(10.5, nr * 1.05));
          ctx.font = `600 ${lf}px 'IBM Plex Mono',monospace`; ctx.fillStyle = T("#8fb0d4", "#475569"); ctx.fillText(`.${n.kume.tld} ×${n.kume.sayi} park`, n.x, n.y + n.r + lf + 6);
          ctx.font = `500 ${lf - 1.5}px 'IBM Plex Sans',sans-serif`; ctx.fillStyle = T("#5b6b7d", "#94a3b8"); ctx.fillText("tıkla → aç", n.x, n.y + n.r + lf * 2 + 8);
          continue;
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.28); ctx.fillStyle = T("#12202e", "#ffffff"); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
        const ik = Math.max(3, n.r * 0.42);
        ctx.fillStyle = c; ctx.fillRect(n.x - ik, n.y - ik * 0.8, ik * 2, ik * 1.6); ctx.fillStyle = T("#12202e", "#ffffff"); ctx.fillRect(n.x - ik, n.y - ik * 0.8, ik * 2, ik * 0.44);
        // ETİKET SEYRELTME: adı yalnız SEÇİLİ veya AKTİF tehdit düğümü taşır. İnceleme/park
        // düğümleri sade nokta kalır → "saç yumağı" biter, göz gerçek tehdide odaklanır.
        // (Sayısı "İnceleniyor" sayacında; tıklayınca detay açılır — bilgi kaybı yok.)
        if (isSel || aktif) {
          const lf = lf0, maxc = nr < 7 ? 15 : nr < 9 ? 20 : 24;
          const dom = n.aday.domain.length > maxc ? n.aday.domain.slice(0, maxc - 1) + "…" : n.aday.domain;
          ctx.font = `${isSel ? 600 : 500} ${lf}px 'IBM Plex Mono',monospace`; ctx.fillStyle = isSel ? T("#e9f2fa", "#0f172a") : T("#d3e2f5", "#1e293b"); ctx.textAlign = "center";
          ctx.fillText(dom, n.x, n.y + n.r + lf + 2);
          ctx.font = `600 ${lf - 0.5}px 'IBM Plex Mono',monospace`; ctx.fillStyle = c; ctx.fillText("%" + n.aday.skor, n.x, n.y + n.r + lf * 2 + 4);
        }
      }
      for (const a of altyapi) {
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.28); ctx.fillStyle = coz("var(--c-1a1830)"); ctx.fill(); ctx.strokeStyle = coz("var(--c-8b7de0)"); ctx.lineWidth = 1.6; ctx.stroke();
        ctx.font = "500 8.5px 'IBM Plex Mono',monospace"; ctx.fillStyle = coz("var(--c-b3a9e0)"); ctx.textAlign = "center"; ctx.fillText(a.label, a.x, a.y + a.r + 11);
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    if (reduce) frame(); else frame();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); clearInterval(kurT); };
  }, [onSelect]);

  return <canvas ref={cv} style={{ width: "100%", height: "100%", cursor: "pointer" }} />;
}
