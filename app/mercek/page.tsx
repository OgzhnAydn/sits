"use client";

// SİBER MERCEK — marka tehdit istihbarat kokpiti (Ant Design + GERÇEK veri).
// Giriş kapılı + marka kilidi. Sensör/akış ← /api/ct-akis, adaylar ← /api/marka-adaylari,
// seçilen varlık ← /api/osint. antd: Card/Statistic/Progress/Table/Tag/Descriptions/Segmented.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
import { etkinYasam, yasamEtiket, type YasamDurumu } from "@/lib/yasamDongusu";
import AnalitikPanel from "./AnalitikPanel";

const { Text, Title } = Typography;

type AkisSatir = { i: number; kisa: string; domain: string; ca: string; marka: string | null };
type Aday = { domain: string; marka: string; skor: number; durum?: string; zaman?: number; aiTur?: string; aiKimlikAvi?: boolean; aiNot?: string; analizZaman?: number; yasamDurumu?: import("@/lib/yasamDongusu").YasamDurumu };
type Alan = { ad: string; deger: string };
type Kategori = { ad: string; seviye: string; ikon?: string; skor?: number };
type Dedektif = { tur: string; guven: string; hedef?: string; paraYontemi?: string; operasyon?: string; gerekce?: string[] };
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
  const [grafGorunum, setGrafGorunum] = useState<"radyal" | "evren">("radyal"); // radyal kart görünümü (varsayılan) ↔ canvas evren
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
  const [aiTaraniyor, setAiTaraniyor] = useState(false);
  const [aiSonuc, setAiSonuc] = useState<string | null>(null);
  async function topluAiAnaliz() {
    if (!markaFiltre || aiTaraniyor) return;
    setAiTaraniyor(true); setAiSonuc(null);
    try {
      const j = await (await fetch(`/api/marka-analiz?marka=${encodeURIComponent(markaFiltre)}&adet=8`)).json();
      setAiSonuc(j.ok ? `${j.analizEdilen || 0} adres AI ile analiz edildi · ${j.kimlikAviSayisi || 0} kimlik-avı` : (j.hata || "analiz başarısız"));
    } catch { setAiSonuc("analiz başarısız"); }
    finally { setAiTaraniyor(false); }
  }
  const [oturum, setOturum] = useState<boolean | null>(null);
  const [operator, setOperator] = useState(false); // marka="*" → tüm markalara dalabilir
  const [resmiMap, setResmiMap] = useState<Record<string, string>>({});
  const [resmiSaglik, setResmiSaglik] = useState<{ varliklar: VarlikSaglik[]; kesfedilen?: VarlikSaglik[]; ozet: { toplam: number; saglikli: number; dikkat: number; sorunlu: number } } | null>(null);
  const [resmiYuk, setResmiYuk] = useState(false);
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

  // RESMÎ VARLIK SAĞLIĞI — marka seçiliyken çek (panel + grafik iç halkası ORTAK kullanır → tek fetch).
  useEffect(() => {
    if (!markaFiltre) { setResmiSaglik(null); return; }
    let iptal = false; setResmiYuk(true);
    fetch(`/api/resmi-saglik?marka=${encodeURIComponent(markaFiltre)}`).then((r) => r.json()).then((j) => { if (!iptal) setResmiSaglik(j); }).catch(() => {}).finally(() => { if (!iptal) setResmiYuk(false); });
    return () => { iptal = true; };
  }, [markaFiltre]);

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
        {/* SEÇİLİ MARKA KİMLİĞİ — markanın resmi logosu + tam adı (kendi kimliğiyle) */}
        {markaFiltre && (() => {
          const bl = markaLogo(resmiMap[markaFiltre]);
          return (
            <Flex align="center" gap={9} style={{ padding: "3px 12px 3px 5px", borderRadius: 9, background: koyu ? "var(--c-0f1d31)" : "#eef3fb", border: `1px solid ${koyu ? "var(--c-1f3652)" : "#d3e0f0"}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {bl && <img src={bl} alt={markaAdi} style={{ height: 24, width: 24, objectFit: "contain", borderRadius: 5, background: "#fff", padding: 1, flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
              <Text strong style={{ fontSize: 14, color: koyu ? "#e6eef7" : "#0c3557", letterSpacing: ".01em", whiteSpace: "nowrap" }}>{markaAdi}</Text>
            </Flex>
          );
        })()}
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
                  {markaFiltre && (
                    <Button size="small" loading={aiTaraniyor} onClick={topluAiAnaliz} icon={<span className="material-symbols-outlined" style={{ fontSize: 15, lineHeight: 1 }}>smart_toy</span>} style={{ marginTop: 8, marginLeft: 6 }} title="Tespitleri içerik + Gemini görsel analizi ile toplu incele">
                      Tümünü AI Analiz Et
                    </Button>
                  )}
                  {aiSonuc && <div style={{ fontSize: 11, color: "var(--c-8fa6bd)", marginTop: 6 }}>{aiSonuc}</div>}
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
                {markaFiltre && <ResmiVarliklar veri={resmiSaglik} yuk={resmiYuk} onSec={(d) => analizEt({ domain: d, marka: markaFiltre, skor: 0, durum: "canli" })} />}
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
              <div style={{ position: "relative", height: grafGorunum === "radyal" ? 600 : 460, borderRadius: 10, overflow: "hidden",
                backgroundColor: grafGorunum === "evren" ? (koyu ? "#0a1420" : "#f4f7fb") : (koyu ? "#0b1524" : "#f5f7fa"),
                ...(grafGorunum === "radyal" ? { backgroundImage: `radial-gradient(circle, ${koyu ? "#1b2c42" : "#ccd5e2"} 1px, transparent 1.5px)`, backgroundSize: "22px 22px", backgroundPosition: "center" } : {}) }}>
                <div style={{ position: "absolute", top: 8, left: 8, zIndex: 3 }}>
                  <Segmented size="small" value={zaman} onChange={(v) => setZaman(v as "anlik" | "24s" | "7g" | "hepsi")}
                    options={[{ label: "Anlık", value: "anlik" }, { label: "24s", value: "24s" }, { label: "7 gün", value: "7g" }, { label: "Tümü", value: "hepsi" }]} />
                </div>
                <div style={{ position: "absolute", top: 8, right: 8, zIndex: 3 }}>
                  <Segmented size="small" value={grafGorunum} onChange={(v) => setGrafGorunum(v as "radyal" | "evren")}
                    options={[{ label: "Radyal", value: "radyal" }, { label: "Evren", value: "evren" }]} />
                </div>
                {grafGorunum === "radyal"
                  ? <MarkaRadyal marka={markaAdi} adaylar={grafikAdaylar} secili={secili} onSelect={analizEt} logo={markaFiltre ? markaLogo(resmiMap[markaFiltre]) : null} koyu={koyu} resmiVarliklar={markaFiltre ? (resmiSaglik?.varliklar || []) : []} onResmiSec={(d) => markaFiltre && analizEt({ domain: d, marka: markaFiltre, skor: 0, durum: "canli" })} />
                  : <ThreatUniverse marka={markaAdi} adaylar={grafikAdaylar} secili={secili} rapor={rapor} onSelect={analizEt} logo={markaFiltre ? markaLogo(resmiMap[markaFiltre]) : null} koyu={koyu} />}
              </div>
            </Card>
          </Col>

          {/* SAĞ: 4 varlık detayı */}
          <Col xs={24} lg={6}>
            <Card size="small" style={{ height: "100%" }} title={baslik(4, "SEÇİLEN VARLIK DETAYI")}>
              {markaFiltre && <CanliKoruma veri={resmiSaglik} onSec={(d) => analizEt({ domain: d, marka: markaFiltre, skor: 0, durum: "canli" })} />}
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
      {/* FOOTER — seçili markanın resmi logosu + adı (kendi kimliğiyle) + sistem imzası */}
      <Flex align="center" justify="center" gap={10} wrap style={{ padding: "8px 18px", borderTop: "1px solid var(--c-17293c)", background: "var(--c-0a1420)", flexShrink: 0, rowGap: 4 }}>
        {markaFiltre && (() => {
          const bl = markaLogo(resmiMap[markaFiltre]);
          return (
            <Flex align="center" gap={8}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {bl && <img src={bl} alt={markaAdi} style={{ height: 18, width: 18, objectFit: "contain", borderRadius: 4, background: "#fff", padding: 1 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
              <Text strong style={{ fontSize: 12.5, color: koyu ? "#cfe0ef" : "#0c3557" }}>{markaAdi}</Text>
              <Text style={{ fontSize: 11, color: "var(--c-5f7c9c)" }}>marka tehdit koruması</Text>
              <span style={{ width: 1, height: 12, background: "var(--c-1f3652)" }} />
            </Flex>
          );
        })()}
        <Text style={{ fontSize: 11, color: "var(--c-5f7c9c)", fontFamily: "'IBM Plex Mono',monospace" }}>Siber Mercek · MirLeon © {new Date().getFullYear()}</Text>
      </Flex>
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
        {(() => {
          const yd: YasamDurumu = etkinYasam(aday);
          const yc = yd === "DOGRULANDI" ? "red" : yd === "IZLEMEDE" ? "blue" : yd === "PASIF" ? "default" : yd === "ELENDI" ? "green" : "gold";
          return <Tag color={yc} style={{ marginTop: 8 }} title="Yaşam döngüsü durumu">{yasamEtiket(yd)}</Tag>;
        })()}
        <CanlilikRozet v={canliV} yuk={canliYuk} />
      </div>
      <div style={{ borderTop: "1px solid var(--c-17293c)", borderBottom: "1px solid var(--c-17293c)", padding: "10px 0" }}>
        <Statistic title="Güven Skoru" value={yukleniyor && !rapor ? "…" : risk} suffix="/100" valueStyle={{ color: renk, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }} />
        <Progress percent={Math.min(100, risk)} showInfo={false} strokeColor={renk} trailColor="var(--c-17293c)" size={{ height: 6 }} style={{ marginTop: 6, marginBottom: 0 }} />
      </div>

      {(() => {
        // AI içerik verdict'i: önce TAZE rapor (tıklayınca çalışan domainOsint), yoksa stored aday.
        const aiTur = rapor?.alanlar?.find((a) => a.ad === "Görsel analiz (AI)" || a.ad === "İçerik analizi (AI)")?.deger || aday.aiTur;
        const aiKimlikAvi = (rapor?.bulgular || []).some((b) => /kimlik avı \(phishing\)|şifre\/kart\/kimlik bilgisi İSTİYOR|kimlik avı işareti|üçüncü bir tarafa aktar/i.test(b)) || aday.aiKimlikAvi;
        const aiNot = rapor?.alanlar?.find((a) => a.ad === "Görsel notu")?.deger || (rapor?.alanlar?.find((a) => a.ad === "Logo taklidi (görsel)")?.deger ? `Görselde "${rapor.alanlar.find((a) => a.ad === "Logo taklidi (görsel)")?.deger}" logosu/amblemi kullanılıyor` : undefined) || aday.aiNot;
        const cdn = rapor?.alanlar?.find((a) => a.ad === "CDN / koruma katmanı")?.deger;
        if (!aiTur && !aiKimlikAvi && !cdn) return null;
        return (
          <Flex vertical gap={4} style={{ background: aiKimlikAvi ? "var(--c-2a0f12)" : "var(--c-0e1a2e)", border: `1px solid ${aiKimlikAvi ? "var(--c-7a1f28)" : "var(--c-1d3350)"}`, borderRadius: 8, padding: "9px 11px" }}>
            {(aiTur || aiKimlikAvi) && <Flex align="center" gap={7}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: aiKimlikAvi ? "var(--c-ff5468)" : "var(--c-31c8a0)" }}>smart_toy</span>
              <Text strong style={{ fontSize: 12, color: "var(--c-cfe0ef)" }}>AI içerik analizi</Text>
              {aiKimlikAvi && <Tag color="error" style={{ margin: 0, marginLeft: "auto" }}>KİMLİK AVI</Tag>}
            </Flex>}
            {aiTur && <Text style={{ fontSize: 11.5, color: "var(--c-a9c0da)" }}>İçerik: {aiTur}</Text>}
            {aiNot && <Text style={{ fontSize: 10.5, color: "var(--c-8fa6bd)", lineHeight: 1.4 }}>{aiNot}</Text>}
            {cdn && <Text style={{ fontSize: 10.5, color: "var(--c-8fb0d4)", lineHeight: 1.4 }}><Text style={{ fontWeight: 600, color: "var(--c-cfe0ef)" }}>CDN / koruma: </Text>{cdn}</Text>}
          </Flex>
        );
      })()}
      <SucTuruBlok rapor={rapor} />
      <DedektifBlok rapor={rapor} />
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
      <TeknikKunye rapor={rapor} ilk={ilk} son={son} />
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

// SUÇ TÜRÜ DEĞERLENDİRMESİ — tek skor yerine kategori bazlı (phishing/marka/zararlı/
// dolandırıcılık/bahis). Veri rapor.kategoriler'de (API zaten üretiyor); panelde de gösterilir.
const KAT_RENK: Record<string, string> = { "Yüksek": "var(--c-ff5468)", "Şüpheli": "var(--c-fa8c16)", "Belirsiz": "var(--c-faad14)", "Yok": "var(--c-5c748b)" };
function SucTuruBlok({ rapor }: { rapor: Rapor | null }) {
  const kat = rapor?.kategoriler;
  if (!kat || kat.length === 0) return null;
  return (
    <div style={{ border: "1px solid var(--c-17293c)", borderRadius: 8, padding: "10px 11px" }}>
      <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: "var(--c-4a90d9)" }}>fact_check</span>
        <Text strong style={{ fontSize: 11, letterSpacing: ".05em", color: "var(--c-cfe0ef)" }}>Suç Türü Değerlendirmesi</Text>
      </Flex>
      <Flex vertical gap={6}>
        {kat.map((k) => {
          const c = KAT_RENK[k.seviye] || KAT_RENK["Yok"];
          return (
            <Flex key={k.ad} align="center" gap={8}>
              {k.ikon && <span className="material-symbols-outlined" style={{ fontSize: 15, color: c }}>{k.ikon}</span>}
              <Text style={{ fontSize: 12, color: "var(--c-a7bccf)", flex: 1 }}>{k.ad}</Text>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: c }} />
              <Text strong style={{ fontSize: 11.5, color: c, width: 58, textAlign: "right" }}>{k.seviye}</Text>
            </Flex>
          );
        })}
      </Flex>
      <Text style={{ display: "block", marginTop: 8, fontSize: 10, color: "var(--c-5c748b)", lineHeight: 1.4 }}>Her tehdit türü ayrı değerlendirilir. &quot;Belirsiz&quot; = zayıf işaret, insan doğrulaması gerekir.</Text>
    </div>
  );
}

// AI DEDEKTİF HÜKMÜ — gerekçeli uzman değerlendirmesi + Kanıt→Sonuç zinciri (rapor.dedektif).
function DedektifBlok({ rapor }: { rapor: Rapor | null }) {
  const d = rapor?.dedektif;
  if (!d || !d.tur) return null;
  return (
    <div style={{ border: "1px solid var(--c-1d3350)", borderRadius: 8, overflow: "hidden", background: "var(--c-0e1a2e)" }}>
      <Flex align="center" justify="space-between" style={{ padding: "8px 11px", borderBottom: "1px solid var(--c-17293c)" }}>
        <Flex align="center" gap={6}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--c-4a90d9)" }}>neurology</span>
          <Text strong style={{ fontSize: 11, letterSpacing: ".05em", color: "var(--c-8fb0d4)" }}>AI Dedektif Hükmü</Text>
        </Flex>
        <Tag color="blue" style={{ margin: 0 }}>Güven: {d.guven}</Tag>
      </Flex>
      <div style={{ padding: "10px 11px" }}>
        <Text strong style={{ fontSize: 13.5, color: "var(--c-cfe0ef)", display: "block" }}>{d.tur}</Text>
        <Flex wrap gap={6} style={{ marginTop: 7 }}>
          {d.hedef && <span style={{ background: "var(--c-0b1420)", borderRadius: 999, padding: "2px 9px", fontSize: 10.5, color: "var(--c-8fa6bd)" }}>Hedef: <b style={{ color: "var(--c-cfe0ef)" }}>{d.hedef}</b></span>}
          {d.paraYontemi && <span style={{ background: "var(--c-0b1420)", borderRadius: 999, padding: "2px 9px", fontSize: 10.5, color: "var(--c-8fa6bd)" }}>Para: <b style={{ color: "var(--c-cfe0ef)" }}>{d.paraYontemi}</b></span>}
        </Flex>
        {d.operasyon && <Text style={{ display: "block", marginTop: 8, fontSize: 11.5, color: "var(--c-a7bccf)", lineHeight: 1.45 }}><b style={{ color: "var(--c-cfe0ef)" }}>Operasyon:</b> {d.operasyon}</Text>}
        {d.gerekce && d.gerekce.length > 0 && (
          <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--c-17293c)" }}>
            <Text style={{ display: "block", marginBottom: 5, fontSize: 9.5, letterSpacing: ".06em", color: "var(--c-5c748b)", textTransform: "uppercase" }}>Kanıt → Sonuç</Text>
            <Flex vertical gap={5}>
              {d.gerekce.map((g, i) => (
                <Flex key={i} gap={7} align="flex-start">
                  <Text style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, fontWeight: 700, color: "var(--c-4a90d9)", marginTop: 1 }}>{String(i + 1).padStart(2, "0")}</Text>
                  <Text style={{ fontSize: 11.5, color: "var(--c-cfe0ef)", lineHeight: 1.45 }}>{g}</Text>
                </Flex>
              ))}
            </Flex>
          </div>
        )}
        <Text style={{ display: "block", marginTop: 8, fontSize: 9.5, color: "var(--c-5c748b)" }}>Yapay zekâ, toplanan sinyallerden mantık yürüterek üretti — yalnız kanıta dayalı.</Text>
      </div>
    </div>
  );
}

// TAM TEKNİK İSTİHBARAT — rapordaki TÜM açık kaynak alanları (IP/ASN/NS/MX/CA/CT/VirusTotal/
// domain yaşı…) + İlk/Son gözlenme + kardeş domain. Butona gerek yok; hepsi panelde.
function TeknikKunye({ rapor, ilk, son }: { rapor: Rapor | null; ilk?: number; son?: number }) {
  const z = (t?: number) => t ? new Date(t).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  const satirlar: { key: string; label: string; children: React.ReactNode }[] = [];
  if (ilk) satirlar.push({ key: "ilk", label: "İlk Gözlenme", children: z(ilk) });
  if (son) satirlar.push({ key: "son", label: "Son Gözlenme", children: z(son) });
  const alanlar = rapor?.alanlar || [];
  alanlar.forEach((a, i) => { if (a.deger && a.deger !== "—") satirlar.push({ key: `a${i}`, label: a.ad, children: a.deger }); });
  if (rapor?.dna && rapor.dna.eslesenler.length > 0) satirlar.push({ key: "kardes", label: "Kardeş domain", children: `${rapor.dna.eslesenler.length} (kampanya)` });
  if (!satirlar.length) return null;
  return (
    <div>
      <Text strong style={{ fontSize: 11, letterSpacing: ".05em", color: "var(--c-cfe0ef)", display: "block", marginBottom: 6 }}>
        Teknik İstihbarat <Text style={{ fontSize: 10, color: "var(--c-5c748b)" }}>· {satirlar.length} açık kaynak verisi</Text>
      </Text>
      <Descriptions column={1} size="small" colon={false} items={satirlar}
        labelStyle={{ color: "var(--c-5c748b)", fontSize: 11 }}
        contentStyle={{ color: "var(--c-cfe0ef)", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, justifyContent: "flex-end", textAlign: "right", wordBreak: "break-all" }}
      />
    </div>
  );
}

// ETBİS ROZETİ — Ticaret Bakanlığı e-ticaret sicili durumu (resmî meşruiyet sinyali).
// Rapordaki "ETBİS" alanına göre yeşil/kırmızı/nötr rozet. Alan yoksa (banka/kamu gibi
// e-ticaret olmayan → ETBİS beklenmez) hiçbir şey çizme.
// RESMÎ VARLIKLAR — müşterinin izlenmesini istediği resmî adreslerin sağlığı (/api/resmi-saglik).
// Sertifika + DNS temelli DÜRÜST izleme; bizim bulut-IP probumuzun 404'ü resmî sitede alarm değildir.
type VarlikSaglik = { domain: string; durum: string; ip: string | null; certGun: number | null; certVeren: string | null; http: number | null; karaListe: boolean; not: string; aciklama?: string };
const vRenk = (d: string) => d === "saglikli" ? "var(--c-31c8a0)" : d === "sorunlu" ? "var(--c-ff5468)" : "var(--c-faad14)";
const vIk = (d: string) => d === "saglikli" ? "check_circle" : d === "sorunlu" ? "error" : "help";
function VarlikSatir({ v, onSec }: { v: VarlikSaglik; onSec: (d: string) => void }) {
  const c = vRenk(v.durum);
  const cert = v.certGun != null ? (v.certGun <= 0 ? "sertifika DOLMUŞ" : `sertifika ${v.certGun}g`) : (v.durum === "dogrulanamadi" ? "doğrulanamadı" : "sertifika —");
  const sorunlu = v.durum === "sorunlu" || v.durum === "dikkat";
  return (
    <div onClick={() => onSec(v.domain)} title={v.not}
      style={{ cursor: "pointer", padding: "6px 8px", margin: "0 -8px", borderRadius: 8, borderLeft: `2px solid ${c}` }}>
      <Flex align="center" gap={8}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: c }}>{vIk(v.durum)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ display: "block", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: "var(--c-cfe0ef)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.domain}</Text>
          {v.aciklama && <Text style={{ fontSize: 9.5, color: "var(--c-8fa6bd)" }}>{v.aciklama}</Text>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <Text style={{ display: "block", fontSize: 10.5, color: c, whiteSpace: "nowrap" }}>{cert}</Text>
          {v.http != null && <Text style={{ fontSize: 9.5, color: "var(--c-5c748b)" }}>HTTP {v.http}</Text>}
        </div>
      </Flex>
      {sorunlu && <Text style={{ display: "block", fontSize: 9.5, color: c, marginTop: 3, marginLeft: 23, lineHeight: 1.4 }}>{v.not}</Text>}
    </div>
  );
}
function ResmiVarliklar({ veri, yuk, onSec }: { veri: { varliklar: VarlikSaglik[]; kesfedilen?: VarlikSaglik[]; ozet: { toplam: number; saglikli: number; dikkat: number; sorunlu: number } } | null; yuk: boolean; onSec: (d: string) => void }) {
  if (!veri || (!veri.varliklar?.length && !veri.kesfedilen?.length)) return null;
  const kesf = veri.kesfedilen || [];
  const kesfSorun = kesf.filter((k) => k.durum === "sorunlu").length;
  return (
    <div style={{ marginTop: 14 }}>
      <Flex align="center" justify="space-between" style={{ marginBottom: 6 }}>
        <Text style={{ fontSize: 10, color: "var(--c-8fa6bd)", letterSpacing: ".08em", textTransform: "uppercase" }}>Resmî Varlıklar · sizin {yuk && <Spin size="small" />}</Text>
        <Text style={{ fontSize: 10, color: "var(--c-31c8a0)" }}>{veri.ozet.saglikli}/{veri.ozet.toplam} sağlıklı</Text>
      </Flex>
      <Flex vertical gap={2}>
        {veri.varliklar.map((v) => <VarlikSatir key={v.domain} v={v} onSec={onSec} />)}
      </Flex>

      {kesf.length > 0 && (<>
        <Flex align="center" justify="space-between" style={{ marginTop: 12, marginBottom: 6 }}>
          <Text style={{ fontSize: 10, color: "var(--c-8fa6bd)", letterSpacing: ".08em", textTransform: "uppercase" }}>Keşfedilen · CT/DNS</Text>
          {kesfSorun > 0
            ? <Text style={{ fontSize: 10, color: "var(--c-ff5468)" }}>{kesfSorun} bulgu</Text>
            : <Text style={{ fontSize: 10, color: "var(--c-5c748b)" }}>onay bekliyor</Text>}
        </Flex>
        <Flex vertical gap={2}>
          {kesf.map((v) => <VarlikSatir key={v.domain} v={v} onSec={onSec} />)}
        </Flex>
        <Text style={{ fontSize: 9.5, color: "var(--c-5c748b)", display: "block", marginTop: 5, lineHeight: 1.4 }}>Bunları biz keşfettik (müşteri göndermedi) — attack surface. Sertifika dolmuş/riskli olan müşteriye bulgu olarak sunulur.</Text>
      </>)}
    </div>
  );
}

// CANLI KORUMA — sağ kolonun EN ÜSTÜ: müşterinin resmî varlıkları minik ekran görüntüsü +
// "CANLI KORUMA" rozetiyle. "Sitelerinizi aktif koruyoruz" güvencesi. Tıklayınca detayını açar.
function CanliKoruma({ veri, onSec }: { veri: { varliklar: VarlikSaglik[] } | null; onSec: (d: string) => void }) {
  const list = veri?.varliklar || [];
  if (!list.length) return null;
  const ss = (d: string) => `https://image.thum.io/get/wait/6/width/400/https://${d}`;
  return (
    <div style={{ marginBottom: 12 }}>
      <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--c-31c8a0)" }}>verified_user</span>
        <Text strong style={{ fontSize: 11, color: "var(--c-cfe0ef)", letterSpacing: ".05em" }}>CANLI KORUMA</Text>
        <Text style={{ fontSize: 10, color: "var(--c-8fa6bd)", marginLeft: "auto" }}>resmî varlıklarınız</Text>
      </Flex>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {list.map((v) => {
          const c = vRenk(v.durum);
          return (
            <div key={v.domain} onClick={() => onSec(v.domain)} title={`${v.domain} · ${v.not}`}
              style={{ cursor: "pointer", border: `1px solid var(--c-17293c)`, borderRadius: 8, overflow: "hidden", background: "var(--c-0e1a2e)" }}>
              <div style={{ position: "relative", height: 66, background: "var(--c-0b1524)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="material-symbols-outlined" style={{ position: "absolute", fontSize: 22, color: "var(--c-2a4d68)" }}>public</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ss(v.domain)} alt={v.domain} loading="lazy" style={{ position: "relative", width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                <span style={{ position: "absolute", top: 4, left: 4, display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(11,21,36,.85)", borderRadius: 5, padding: "2px 6px" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: c }} />
                  <Text style={{ fontSize: 8, color: "#dbe7f3", fontWeight: 700, letterSpacing: ".03em" }}>CANLI KORUMA</Text>
                </span>
              </div>
              <div style={{ padding: "4px 6px", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: c, flexShrink: 0 }} />
                <Text style={{ fontSize: 9.5, fontFamily: "'IBM Plex Mono',monospace", color: "var(--c-a9c0da)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.domain}</Text>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderBottom: "1px solid var(--c-17293c)", marginTop: 12 }} />
    </div>
  );
}

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
  const canliAd: Record<string, string> = { redirect: "başka adrese yönlendiriyor", parked: "park/satılık (pasif)", dead: "erişilemez/kaldırılmış", erisim_kisitli: "sunucu ayakta ama içerik doğrulanamıyor (erişim kısıtlı / origin hatası)", bilinmiyor: "durumu doğrulanamıyor" };
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
// MARKA RADYAL GRAFİĞİ — merkezde marka logosu, çevresinde her tespit bir KART düğüm
// (durum ikonu + domain + skor rozeti), aradaki ince çizgilerle bağlı; altta özet şeridi
// (Tehlikeli / Şüpheli / Bilgi-Nötr / Toplam). Park kümeleri tek karta toplanır (kalabalık
// yanılsaması yok). Skora göre 3 seviye — kusursuz, canvas'tan crisp ve tıklanabilir.
type RadyalOge = { aday?: Aday; kume?: { tld: string; sayi: number; skor: number; uyeler: Aday[] } };
function radyalSeviye(skor: number, koyu: boolean): { renk: string; ikon: string; grup: "tehlikeli" | "supheli" | "bilgi" } {
  if (skor >= 60) return { renk: "#ff4d5e", ikon: "block", grup: "tehlikeli" };
  if (skor >= 30) return { renk: "#f5921b", ikon: "warning", grup: "supheli" };
  return { renk: koyu ? "#4a90d9" : "#3f7fc4", ikon: "open_in_new", grup: "bilgi" };
}
function MarkaRadyal({ marka, adaylar, secili, onSelect, logo, koyu = true, resmiVarliklar = [], onResmiSec }: { marka: string; adaylar: Aday[]; secili: Aday | null; onSelect: (a: Aday) => void; logo?: string | null; koyu?: boolean; resmiVarliklar?: { domain: string; durum: string }[]; onResmiSec?: (d: string) => void }) {
  const kap = useRef<HTMLDivElement>(null);
  const [boyut, setBoyut] = useState({ w: 900, h: 460 });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  useEffect(() => {
    const el = kap.current; if (!el) return;
    const ro = new ResizeObserver(() => { const b = el.getBoundingClientRect(); setBoyut({ w: b.width, h: b.height }); });
    ro.observe(el); const b = el.getBoundingClientRect(); setBoyut({ w: b.width, h: b.height });
    return () => ro.disconnect();
  }, []);

  // ÖĞELER: tekiller + park kümeleri (aynı TLD ≥6 → tek kart). Önem sırasına diz, sınırla.
  const ogeler = useMemo(() => {
    const tld = (d: string) => { const p = String(d).toLowerCase().replace(/\.$/, "").split("."); return p[p.length - 1] || ""; };
    const park = (a: Aday) => a.durum === "park" || a.durum === "yayinda-degil";
    const grup: Record<string, Aday[]> = {}; const tekil: Aday[] = [];
    for (const a of adaylar) { if (park(a)) (grup[tld(a.domain)] ||= []).push(a); else tekil.push(a); }
    const items: RadyalOge[] = tekil.map((a) => ({ aday: a }));
    for (const [t, u] of Object.entries(grup)) {
      if (u.length >= 6) items.push({ kume: { tld: t, sayi: u.length, skor: Math.max(0, ...u.map((x) => x.skor || 0)), uyeler: u } });
      else for (const a of u) items.push({ aday: a });
    }
    const sk = (o: RadyalOge) => o.kume ? o.kume.skor : (o.aday!.skor || 0);
    return items.sort((a, b) => sk(b) - sk(a)).slice(0, 42);
  }, [adaylar]);

  const { w, h } = boyut;
  const cx = w / 2;
  const araH = h - 46;              // alt özet şeridi için pay
  const cy = araH / 2 + 4;
  const Rx = cx - 118, Ry = cy - 26; // SABİT etiket için yatay pay; ELİPS → tüm yüksekliği kullan
  const spacing = 94;                // sabit etiketler çakışmasın diye açısal pay geniş
  const M = ogeler.length;
  const ringN = M <= 8 ? 1 : M <= 18 ? 2 : 3;
  // İç halka merkez logosuyla ÇAKIŞMASIN diye innermost fraksiyon büyük tutulur.
  const fr = ringN === 1 ? [0.78] : ringN === 2 ? [0.6, 1] : [0.48, 0.74, 1];
  const ringRx = fr.map((f) => Rx * f), ringRy = fr.map((f) => Ry * f);
  const caps = fr.map((_, i) => { const per = 2 * Math.PI * Math.sqrt((ringRx[i] ** 2 + ringRy[i] ** 2) / 2); return Math.max(4, Math.floor(per / spacing)); });
  const kapasite = caps.reduce((a, b) => a + b, 0);
  const goster = ogeler.slice(0, kapasite);
  const N = goster.length;
  const konum: { oge: RadyalOge; x: number; y: number; ang: number }[] = [];
  let idx = 0;
  for (let ri = 0; ri < ringN && idx < N; ri++) {
    const kalanCap = caps.slice(ri).reduce((a, b) => a + b, 0);
    const bu = ri === ringN - 1 ? N - idx : Math.min(caps[ri], Math.round((N - idx) * caps[ri] / kalanCap));
    for (let k = 0; k < bu && idx < N; k++) {
      const ang = -Math.PI / 2 + (k / bu) * Math.PI * 2 + (ri % 2 ? Math.PI / bu : 0);
      konum.push({ oge: goster[idx], x: cx + Math.cos(ang) * ringRx[ri], y: cy + Math.sin(ang) * ringRy[ri], ang });
      idx++;
    }
  }
  const say = { tehlikeli: 0, supheli: 0, bilgi: 0 };
  for (const o of ogeler) { const s = o.kume ? o.kume.skor : (o.aday!.skor || 0); say[radyalSeviye(s, koyu).grup]++; }
  const gizli = ogeler.length - goster.length; // sığmayan düğüm sayısı (dürüst rozet)

  const cardBg = koyu ? "#0f1d31" : "#ffffff";
  const cardBd = koyu ? "#1f3550" : "#e4eaf3";
  const txt = koyu ? "#dbe7f3" : "#1e2a3a";
  const cizgi = koyu ? "#20344d" : "#d5dee9";
  const merkezBd = koyu ? "#2a4d68" : "#cfe0f2";

  return (
    <div ref={kap} style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Bağlantı çizgileri (kartların ALTINDA) */}
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {konum.map((p, idx) => (
          <line key={idx} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={cizgi} strokeWidth={1} />
        ))}
      </svg>
      {/* Merkez marka düğümü */}
      <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%,-50%)", width: 78, height: 78, borderRadius: "50%", background: cardBg, border: `2px solid ${merkezBd}`, boxShadow: koyu ? "0 0 0 5px rgba(58,144,216,.10)" : "0 0 0 5px rgba(58,144,216,.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
        {logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt={marka} style={{ width: 38, height: 38, objectFit: "contain" }} /> : <span className="material-symbols-outlined" style={{ fontSize: 34, color: "#3a90d8" }}>account_balance</span>}
        <Text strong style={{ fontSize: 9, color: txt, marginTop: 1, textAlign: "center", lineHeight: 1, maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{marka}</Text>
      </div>
      {/* Düğümler: daire İÇİNDE skor + SABİT domain etiketi (dışa yaslı, radyal → komşularla ayrışır).
          Hover/seçili olunca vurgulanır (kalın kenar + öne gelir). */}
      {konum.map((p, ki) => {
        const o = p.oge; const kume = o.kume; const aday = o.aday;
        const skor = kume ? kume.skor : (aday!.skor || 0);
        const sv = radyalSeviye(skor, koyu);
        const tam = kume ? `.${kume.tld} kümesi (${kume.sayi})` : aday!.domain;
        const ad = tam.length > 20 ? tam.slice(0, 19) + "…" : tam;
        const isSel = !kume && !!secili && aday!.domain === secili.domain;
        const vurgu = isSel || hoverIdx === ki;
        const sag = Math.cos(p.ang) >= -0.02;
        const cap = 30;
        return (
          <div key={ki} onClick={() => { if (kume) onSelect(kume.uyeler[0]); else onSelect(aday!); }}
            onMouseEnter={() => setHoverIdx(ki)} onMouseLeave={() => setHoverIdx((v) => v === ki ? null : v)} title={tam}
            style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)", zIndex: vurgu ? 6 : 1, cursor: "pointer" }}>
            <div style={{ width: cap, height: cap, borderRadius: "50%", background: sv.renk, border: `2px solid ${koyu ? "#0b1524" : "#fff"}`,
              boxShadow: vurgu ? `0 0 0 4px ${sv.renk}55` : (koyu ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 4px rgba(30,50,80,.25)"),
              display: "flex", alignItems: "center", justifyContent: "center", transition: "box-shadow .12s" }}>
              <Text style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'IBM Plex Mono',monospace" }}>{skor}</Text>
            </div>
            {/* SABİT etiket — radyal dışa yaslı; hover/seçilide kutu + öne çıkar, aksi halde düz yazı */}
            <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", ...(sag ? { left: cap + 4 } : { right: cap + 4 }),
              maxWidth: 116, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none", textAlign: sag ? "left" : "right",
              background: vurgu ? (koyu ? "#0f1d31" : "#ffffff") : "transparent", border: `1px solid ${vurgu ? sv.renk : "transparent"}`, borderRadius: 6, padding: vurgu ? "2px 7px" : "0 2px",
              boxShadow: vurgu ? (koyu ? "0 2px 8px rgba(0,0,0,.5)" : "0 2px 10px rgba(30,50,80,.2)") : "none" }}>
              <Text style={{ fontSize: 10, color: vurgu ? txt : (koyu ? "#9db4cc" : "#425268"), fontWeight: vurgu ? 700 : 500, fontFamily: "'IBM Plex Mono',monospace" }}>{ad}</Text>
            </div>
          </div>
        );
      })}
      {/* İÇ HALKA — resmî varlıklar (senin, korunan): sağlık renkli kalkan, merkeze en yakın */}
      {resmiVarliklar.slice(0, 8).map((rv, ri) => {
        const rN = Math.min(resmiVarliklar.length, 8);
        const ang = -Math.PI / 2 + (ri / rN) * Math.PI * 2;
        const irx = Math.max(64, Rx * 0.33), iry = Math.max(58, Ry * 0.33);
        const x = cx + Math.cos(ang) * irx, y = cy + Math.sin(ang) * iry;
        const c = rv.durum === "saglikli" ? "#31c8a0" : rv.durum === "sorunlu" ? "#ff4d5e" : "#f5a91b";
        const kisa = rv.domain.replace(/\.toki\.gov\.tr$/i, "").replace(/\.gov\.tr$/i, "") || rv.domain;
        const sag = Math.cos(ang) >= -0.02;
        return (
          <div key={"rv" + ri} onClick={() => onResmiSec?.(rv.domain)} title={`${rv.domain} · resmî varlık`}
            style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", zIndex: 3, cursor: "pointer" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: koyu ? "#0b1524" : "#fff", border: `2px solid ${c}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: c }}>verified_user</span>
            </div>
            <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", ...(sag ? { left: 25 } : { right: 25 }), whiteSpace: "nowrap", pointerEvents: "none" }}>
              <Text style={{ fontSize: 9.5, color: c, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace" }}>{rv.domain === "toki.gov.tr" || kisa === rv.domain ? "kök" : kisa}</Text>
            </div>
          </div>
        );
      })}
      {/* Alt özet şeridi */}
      <div style={{ position: "absolute", left: 10, right: 10, bottom: 8, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap",
        background: koyu ? "rgba(10,20,34,.72)" : "rgba(255,255,255,.82)", border: `1px solid ${cardBd}`, borderRadius: 10, padding: "6px 10px", backdropFilter: "blur(4px)" }}>
        <RadyalOzet renk="#ff4d5e" ikon="block" etiket="Tehlikeli / Zararlı" n={say.tehlikeli} koyu={koyu} />
        <RadyalOzet renk="#f5921b" ikon="warning" etiket="Şüpheli" n={say.supheli} koyu={koyu} />
        <RadyalOzet renk={koyu ? "#4a90d9" : "#3f7fc4"} ikon="open_in_new" etiket="Bilgi / Nötr" n={say.bilgi} koyu={koyu} />
        <RadyalOzet renk={koyu ? "#8fb0d4" : "#5c748b"} ikon="hub" etiket="Toplam" n={ogeler.length} koyu={koyu} />
        {gizli > 0 && <Text style={{ fontSize: 10, color: koyu ? "#8fa6bd" : "#5c748b" }}>+{gizli} sığmadı</Text>}
      </div>
    </div>
  );
}
function RadyalOzet({ renk, ikon, etiket, n, koyu }: { renk: string; ikon: string; etiket: string; n: number; koyu: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16, color: renk }}>{ikon}</span>
      <Text style={{ fontSize: 10.5, color: koyu ? "#8fa6bd" : "#5c748b" }}>{etiket}</Text>
      <Text strong style={{ fontSize: 13, color: koyu ? "#dbe7f3" : "#1e2a3a", fontFamily: "'IBM Plex Mono',monospace" }}>{n}</Text>
    </div>
  );
}

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
