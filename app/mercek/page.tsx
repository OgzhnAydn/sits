"use client";

// SİBER MERCEK — canlı tehdit gözlem kokpiti (GERÇEK veri).
// Sensörler + canlı akış ← /api/ct-akis · yakalanan sahteler ← /api/marka-adaylari
// İnceleme paneli ← /api/osint (gerçek risk/kategori/dedektif/engelleme/why).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { markaDinle, cikis } from "@/lib/markaAuth";

type AkisSatir = { i: number; kisa: string; domain: string; ca: string; marka: string | null };
type LogDurum = { kisa: string; ad: string; op: string; toplam: number; cekildi: number; onFiltre: number; eslesme: number };
type Aday = { domain: string; marka: string; skor: number; durum?: string; kampanya?: unknown };
type Alan = { ad: string; deger: string };
type Kategori = { ad: string; seviye: string };
type Dedektif = { tur: string; guven: string; hedef?: string; gerekce?: string[] };
type Gecmis = { t: number; risk: number; asama: number };
type Rapor = {
  risk: number; riskSeviye?: string; bulgular: string[]; alanlar: Alan[];
  kategoriler?: Kategori[]; dedektif?: Dedektif; durum?: { etiket: string; ikon: string; durum: string };
  ekranGoruntusu?: string; asama?: number; asamalar?: string[]; gecmis?: Gecmis[];
  dna?: { imza: string; parcalar: { k: string; v: string }[]; eslesenler: string[] };
};

const SEV_RENK: Record<string, string> = { Yüksek: "#f0524f", Şüpheli: "#f2a33c", Belirsiz: "#4d9fe0", Yok: "#5c748b" };
function fmt(n: number) { return n.toLocaleString("tr-TR"); }

export default function MercekKokpit() {
  const [loglar, setLoglar] = useState<Record<string, LogDurum>>({});
  const [akis, setAkis] = useState<AkisSatir[]>([]);
  const [toplam, setToplam] = useState(0);
  const [bagli, setBagli] = useState(false);
  const [adaylar, setAdaylar] = useState<Aday[]>([]);
  const [taranan, setTaranan] = useState(0);
  const [sayac, setSayac] = useState({ akan: 0, eslesme: 0 });
  const [secili, setSecili] = useState<Aday | null>(null);
  const [rapor, setRapor] = useState<Rapor | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [intro, setIntro] = useState(false);
  const [gorunum, setGorunum] = useState<"liste" | "harita">("liste");
  const [markaFiltre, setMarkaFiltre] = useState<string>(""); // "" = tüm markalar (operatör); dolu = tek marka
  const [kilitli, setKilitli] = useState(false); // marka hesabı → seçici kilitli
  const [oturum, setOturum] = useState<boolean | null>(null); // null=yükleniyor, false=yok, true=var
  const [hesapAdi, setHesapAdi] = useState("");
  const router = useRouter();
  const gorulen = useRef<Set<number>>(new Set());

  // GİRİŞ KAPISI: oturum yoksa giriş sayfasına; marka hesabı → kendi markasına kilit.
  useEffect(() => markaDinle((user, hesap) => {
    if (!user) { setOturum(false); router.replace("/marka-giris"); return; }
    setOturum(true);
    if (hesap && hesap.marka && hesap.marka !== "*") {
      setMarkaFiltre(hesap.marka.toLowerCase()); setKilitli(true); setHesapAdi(hesap.ad || hesap.marka);
    } else {
      setKilitli(false); setHesapAdi(hesap?.ad || "Operatör"); // marka="*" → tüm markalar
    }
  }), [router]);

  useEffect(() => { try { if (!localStorage.getItem("mercek_intro")) setIntro(true); } catch { setIntro(true); } }, []);
  const introKapat = () => { setIntro(false); try { localStorage.setItem("mercek_intro", "1"); } catch { /* */ } };

  // ── CT akışı (gerçek) ──
  useEffect(() => {
    let durdu = false;
    async function cek() {
      try {
        const j = await (await fetch("/api/ct-akis", { cache: "no-store" })).json();
        if (durdu) return;
        setBagli(Boolean(j.ok));
        if (j.toplam) setToplam(j.toplam);
        setLoglar((prev) => {
          const n = { ...prev };
          for (const l of j.loglar || []) {
            const o = n[l.kisa] || { kisa: l.kisa, ad: l.ad, op: l.op, toplam: 0, cekildi: 0, onFiltre: 0, eslesme: 0 };
            n[l.kisa] = { ...o, ad: l.ad, op: l.op, toplam: l.toplam || o.toplam, cekildi: o.cekildi + l.cekildi, onFiltre: o.onFiltre + l.onFiltre, eslesme: o.eslesme + l.eslesme };
          }
          return n;
        });
        const yeni: AkisSatir[] = [];
        for (const a of j.akis || []) {
          if (gorulen.current.has(a.i)) continue;
          gorulen.current.add(a.i);
          yeni.push(a);
        }
        if (gorulen.current.size > 4000) gorulen.current = new Set([...gorulen.current].slice(-1000));
        if (yeni.length) {
          setAkis((p) => [...yeni.reverse(), ...p].slice(0, 40));
          setSayac((s) => ({ akan: s.akan + yeni.length, eslesme: s.eslesme + yeni.filter((x) => x.marka).length }));
        }
      } catch { if (!durdu) setBagli(false); }
    }
    cek(); const t = setInterval(cek, 3000);
    return () => { durdu = true; clearInterval(t); };
  }, []);

  // ── yakalanan adaylar (gerçek) ──
  useEffect(() => {
    let durdu = false;
    async function cek() {
      try {
        const j = await (await fetch("/api/marka-adaylari", { cache: "no-store" })).json();
        if (durdu) return;
        const a: Aday[] = (j.adaylar || []).slice(0, 60);
        setAdaylar(a); setTaranan(j.taranan || a.length);
      } catch { /* sessiz */ }
    }
    cek(); const t = setInterval(cek, 30000);
    return () => { durdu = true; clearInterval(t); };
  }, []);

  // ── seçilen adayı gerçek analiz et ──
  const analizEt = useCallback(async (a: Aday) => {
    setSecili(a); setRapor(null); setYukleniyor(true);
    try {
      const j = await (await fetch("/api/osint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ giris: a.domain }) })).json();
      setRapor(j?.hata ? null : j);
    } catch { setRapor(null); }
    setYukleniyor(false);
  }, []);
  // TEK seçim kaynağı — HER ZAMAN kapsam içi: seçili tehdit görünen havuzda değilse
  // havuzun ilkini seç; havuz boşsa paneli TEMİZLE (başka markanın verisi sızmasın).
  useEffect(() => {
    const havuz = markaFiltre ? adaylar.filter((a) => a.marka === markaFiltre) : adaylar;
    if (secili && havuz.some((a) => a.domain === secili.domain)) return;
    if (havuz[0]) analizEt(havuz[0]);
    else if (secili) { setSecili(null); setRapor(null); }
  }, [markaFiltre, adaylar]); // eslint-disable-line

  const logList = Object.values(loglar);
  const eslesmeToplam = logList.reduce((s, l) => s + l.eslesme, 0);
  // ── MARKA KAPSAMI: seçili marka varsa yalnız onun tehditleri gösterilir ──
  const tumMarkalar = [...new Set(adaylar.map((a) => a.marka))].sort();
  const gosterilen = markaFiltre ? adaylar.filter((a) => a.marka === markaFiltre) : adaylar;
  const akisGoster = markaFiltre ? akis.filter((a) => (a.marka || "").toLowerCase() === markaFiltre) : akis;
  const markaAdi = markaFiltre ? markaFiltre.charAt(0).toUpperCase() + markaFiltre.slice(1) : "";

  // Giriş kapısı — oturum doğrulanana kadar hiçbir tehdit verisi gösterme.
  if (oturum !== true) {
    return (
      <div className="mercek" style={{ display: "grid", placeItems: "center" }}>
        <MStyle />
        <div style={{ textAlign: "center", color: "#8fa6bd", fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 }}>
          {oturum === false ? "Giriş sayfasına yönlendiriliyor…" : "Oturum kontrol ediliyor…"}
        </div>
      </div>
    );
  }

  return (
    <div className="mercek">
      <MStyle />
      {/* ÜST ÇUBUK */}
      <header className="mtop">
        <Link href="/" className="mbrand">
          <span className="mmark">
            <svg width="28" height="28" viewBox="0 0 30 30" fill="none">
              <circle cx="15" cy="15" r="13" stroke="#2f6fb0" strokeWidth="1.4" />
              <circle cx="15" cy="15" r="7" stroke="#4d9fe0" strokeWidth="1.1" />
              <circle cx="15" cy="15" r="2.4" fill="#39bdf8" />
            </svg>
          </span>
          <span><b>Siber Mercek</b><i>Sürekli İnternet Gözlemi</i></span>
        </Link>
        <span className={`mlive ${bagli ? "on" : "off"}`}><span className="mdot" /> {bagli ? "CANLI" : "BAĞLANIYOR"}</span>
        <span className="mclock"><Clock /></span>
        {markaAdi && <span className="mscope"><b>{markaAdi}</b> tehdit panosu</span>}
        <div className="mfunnel">
          <FStep n={toplam} lab="sertifika olayı" />
          <FStep n={gosterilen.length} lab={markaFiltre ? "size ait aday" : "aday varlık"} />
          <FStep n={markaFiltre ? akisGoster.length : sayac.eslesme + eslesmeToplam} lab="canlı eşleşme" cls="warn" />
          <FStep n={gosterilen.filter((a) => a.skor >= 60).length} lab="yüksek risk" cls="crit" />
        </div>
        <button className="mcikis" onClick={() => { cikis(); router.replace("/marka-giris"); }} title="Çıkış yap">
          <span className="ha">{hesapAdi}</span> çıkış
        </button>
      </header>

      {intro && (
        <div className="mintro">
          <div className="mi-body">
            <div className="mi-h">Bu ekran ne işe yarar?</div>
            <div className="mi-steps">
              <span><b>1.</b> Sistem 7/24 interneti tarar — markalara açılan sahte siteleri <b>sen aramadan</b> yakalar.</span>
              <span><b>2.</b> Ortadaki her <b>satır = gerçek bir tehdit</b> (riske göre sıralı). Ne olduğu düz Türkçe yazıyor. Bir satıra <b>tıkla.</b></span>
              <span><b>3.</b> Sağ panel her şeyi anlatır: risk, neden şüphelendik, <b>saldırı aşaması</b>, <b>altyapı DNA'sı + kardeş kampanya.</b></span>
            </div>
            <div className="mi-note">Vatandaş değil, <b>operatör</b> ekranı — "markama şu an kim saldırıyor?" sorusunun canlı cevabı.</div>
            <button className="mi-close" onClick={introKapat}>Anladım, başla →</button>
          </div>
        </div>
      )}

      <div className="mmain">
        {/* SOL RAY */}
        <nav className="mrail">
          <RailItem on label="CANLI" />
          <RailItem label="TEHDİTLER" n={adaylar.length} />
          <RailItem label="MARKALAR" />
          <RailItem label="İNCELE" />
          <div className="mspacer" />
          <RailItem label="SENSÖRLER" n={logList.length} />
        </nav>

        {/* MERKEZ */}
        <section className="mcenter">
          {/* Sade başlık + görünüm seçici */}
          <div className="mtoolbar">
            <div className="mtitle">
              <b>{gosterilen.filter((a) => a.skor >= 60).length}</b> yüksek riskli tehdit
              <span> · {markaAdi ? `${markaAdi} markasına` : `${gosterilen.length} aday · ${tumMarkalar.length} marka`}</span>
            </div>
            {!kilitli && (
              <select className="mmarka" value={markaFiltre} onChange={(e) => setMarkaFiltre(e.target.value)}>
                <option value="">Tüm markalar</option>
                {tumMarkalar.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            )}
            <div className="mtoggle">
              <button className={gorunum === "liste" ? "on" : ""} onClick={() => setGorunum("liste")}>Liste</button>
              <button className={gorunum === "harita" ? "on" : ""} onClick={() => setGorunum("harita")}>Harita</button>
            </div>
          </div>

          {gorunum === "liste" ? (
            <ThreatList adaylar={gosterilen} secili={secili} onSelect={analizEt} />
          ) : (
            <div className="muniverse">
              <ThreatUniverse adaylar={gosterilen} secili={secili} onSelect={analizEt} />
              <div className="mlegend">
                <span><i style={{ background: "#f0524f" }} />yüksek</span>
                <span><i style={{ background: "#f2a33c" }} />orta</span>
                <span><i style={{ background: "#4d9fe0" }} />izlemede</span>
                <span className="hint">bir noktaya tıkla → gerçek analiz</span>
              </div>
            </div>
          )}

          {/* CANLI OLAY AKIŞI (gerçek CT domainleri) */}
          <div className="mstream">
            <div className="msh"><span className="mdot" /><span className="t">Canlı Olay Akışı</span>
              <span className="rate">{bagli ? `${fmt(sayac.akan)} sertifika örneklendi` : "—"}</span></div>
            <div className="mevlist">
              {akisGoster.length === 0 && <div className="mempty">{markaAdi ? `${markaAdi} markasına ait canlı eşleşme bekleniyor…` : "CT akışı örnekleniyor… (her 3 sn'de gerçek sertifikalar)"}</div>}
              {akisGoster.map((a) => (
                <div className={`mev ${a.marka ? "hit" : ""}`} key={a.i}>
                  <span className="src">{a.kisa}</span>
                  {a.marka
                    ? <span className="tag crit">MARKA · {a.marka}</span>
                    : <span className="tag">YENİ SERTİFİKA</span>}
                  <span className="dom">{a.domain}</span>
                  <span className="ca">{a.ca}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SAĞ İNCELEME PANELİ (gerçek) */}
        <aside className="minvest">
          <Investigation aday={secili} rapor={rapor} yukleniyor={yukleniyor} markaAdi={markaAdi} />
        </aside>
      </div>

      {/* SENSÖR ŞERİDİ (gerçek 2-worker CT) */}
      <footer className="msensors">
        {logList.length === 0 && <span className="sload">Sensörler bağlanıyor…</span>}
        {logList.map((l) => (
          <div className="msensor" key={l.kisa}>
            <span className="st" /><span className="nm">{l.op || l.kisa}</span>
            <span className="rt">{fmt(l.toplam)}</span>
            {l.eslesme > 0 && <span className="mt">{l.eslesme} eşleşme</span>}
          </div>
        ))}
        <div className="msensor meta"><span className="k">TOPLAM CT</span><span className="v">{fmt(toplam)}</span></div>
      </footer>
    </div>
  );
}

/* ── Alt bileşenler ── */
function Clock() {
  const [t, setT] = useState("--:--:--");
  useEffect(() => { const f = () => setT(new Date().toTimeString().slice(0, 8)); f(); const id = setInterval(f, 1000); return () => clearInterval(id); }, []);
  return <>{t}</>;
}
function FStep({ n, lab, cls }: { n: number; lab: string; cls?: string }) {
  return <div className={`mfstep ${cls || ""}`}><span className="fn">{fmt(n)}</span><span className="fl">{lab}</span></div>;
}
function RailItem({ label, on, n }: { label: string; on?: boolean; n?: number }) {
  return <div className={`mnav ${on ? "on" : ""}`}><span>{label}</span>{typeof n === "number" && <b>{n}</b>}</div>;
}

function Investigation({ aday, rapor, yukleniyor, markaAdi }: { aday: Aday | null; rapor: Rapor | null; yukleniyor: boolean; markaAdi?: string }) {
  if (!aday) return (
    <div className="miv-empty">
      {markaAdi
        ? <><b style={{ color: "#31c8a0", display: "block", marginBottom: 6 }}>{markaAdi} için tehdit yok</b>Şu an markanıza yönelik yakalanmış bir sahte site yok. Sistem 7/24 izlemeye devam ediyor — yeni bir tehdit çıkarsa burada görünür.</>
        : "Soldaki listeden bir tehdit seç."}
    </div>
  );
  const sev = rapor?.riskSeviye || (aday.skor >= 60 ? "Yüksek" : aday.skor >= 30 ? "Orta" : "Düşük");
  const risk = rapor?.risk ?? aday.skor;
  const renk = risk >= 60 ? "#f0524f" : risk >= 30 ? "#f2a33c" : "#4d9fe0";
  const why = whyCikar(rapor);
  const engel = rapor?.alanlar?.find((a) => a.ad === "Engelleme durumu")?.deger;
  const C = 207, off = C - (C * Math.min(100, risk)) / 100;
  return (
    <div className="miv">
      <div className="eyebrow">İnceleme · gerçek OSINT</div>
      <div className="ivdom">{aday.domain}</div>
      <div className="ivrisk">
        <div className="gauge">
          <svg width="76" height="76" viewBox="0 0 78 78">
            <circle cx="39" cy="39" r="33" fill="none" stroke="#15283a" strokeWidth="7" />
            <circle cx="39" cy="39" r="33" fill="none" stroke={renk} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 39 39)" style={{ transition: "stroke-dashoffset .6s" }} />
          </svg>
          <div className="gval"><b>{yukleniyor && !rapor ? "…" : risk}</b><span>/ 100</span></div>
        </div>
        <div className="ivverdict">
          <span className="badge" style={{ color: renk, borderColor: renk + "55", background: renk + "1f" }}>{sev.toUpperCase()} RİSK</span>
          <div className="bl">Hedef marka · <b>{aday.marka}</b></div>
          {aday.durum && <div className="durum">{aday.durum}</div>}
        </div>
      </div>

      {engel && <div className={`engel ${/Zaten/.test(engel) ? "known" : "new"}`}>{/Zaten/.test(engel) ? "ZATEN ENGELLİ" : "YENİ TEHDİT — açık listelerde yok"}<i>{engel}</i></div>}

      <div className="ivsect">
        <div className="lbl">Neden şüphelendik? {yukleniyor && <span className="ld">analiz…</span>}{why.length > 0 && <span className="n">{why.length} sinyal</span>}</div>
        {why.length === 0 && !yukleniyor && <div className="miv-empty sm">Bu varlık için güçlü sinyal yok — düşük öncelik.</div>}
        <div className="why">
          {why.map((w, i) => (
            <div className="wrow" key={i}><span className="ck"></span><b>{w.t}</b>{w.m && <span className="m">{w.m}</span>}</div>
          ))}
        </div>
        {why.length >= 2 && <div className="consensus"><b>{why.length}</b> bağımsız sinyal aynı varlığı işaret ediyor</div>}
      </div>

      {rapor?.kategoriler && rapor.kategoriler.some((k) => k.seviye !== "Yok") && (
        <div className="ivsect">
          <div className="lbl">Suç türü değerlendirmesi</div>
          <div className="kats">
            {rapor.kategoriler.filter((k) => k.seviye !== "Yok").map((k) => (
              <span className="kat" key={k.ad} style={{ color: SEV_RENK[k.seviye], borderColor: SEV_RENK[k.seviye] + "44" }}>{k.ad} · {k.seviye}</span>
            ))}
          </div>
        </div>
      )}

      {rapor?.dedektif && (
        <div className="ivsect">
          <div className="lbl">AI Dedektif · güven {rapor.dedektif.guven}</div>
          <div className="dedektif"><b>{rapor.dedektif.tur}</b>{rapor.dedektif.hedef && <span> · hedef: {rapor.dedektif.hedef}</span>}</div>
        </div>
      )}

      {rapor?.asamalar && typeof rapor.asama === "number" && (
        <div className="ivsect">
          <div className="lbl">Saldırı olgunlaşması <span className="n">aşama {rapor.asama + 1}/{rapor.asamalar.length}</span></div>
          <div className="ladder">
            {rapor.asamalar.map((s, i) => (
              <div className={`rung ${i < rapor.asama! ? "done" : i === rapor.asama ? "active" : ""}`} key={s}><i />{s}</div>
            ))}
          </div>
        </div>
      )}

      {rapor?.gecmis && rapor.gecmis.length >= 2 ? (
        <div className="ivsect">
          <div className="lbl">Risk gelişimi <span className="n">{rapor.gecmis.length} gözlem</span></div>
          <TrajSpark gecmis={rapor.gecmis} />
        </div>
      ) : rapor?.gecmis ? (
        <div className="ivsect"><div className="lbl">Risk gelişimi</div>
          <div className="miv-empty sm">İlk gözlem kaydedildi — yörünge, domain yeniden tarandıkça büyüyecek.</div></div>
      ) : null}

      {rapor?.dna && rapor.dna.parcalar.length >= 2 && (
        <div className="ivsect">
          <div className="lbl">Altyapı DNA {rapor.dna.eslesenler.length > 0 && <span className="n">{rapor.dna.eslesenler.length} kardeş</span>}</div>
          <div className="dna">{rapor.dna.parcalar.map((p) => <span className="dnachip" key={p.k}><i>{p.k}</i>{p.v}</span>)}</div>
          {rapor.dna.eslesenler.length > 0
            ? <div className="dnahit">Aynı altyapı parmak izi → <b>{rapor.dna.eslesenler.length} kardeş domain</b> · muhtemel kampanya: {rapor.dna.eslesenler.slice(0, 3).join(", ")}</div>
            : <div className="dnanote">Parmak izi kaydedildi — aynısını taşıyan yeni domainler kampanya olarak bağlanacak.</div>}
        </div>
      )}

      {rapor?.ekranGoruntusu && (
        <div className="ivsect">
          <div className="lbl">Sitenin görünümü</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ivshot" src={rapor.ekranGoruntusu} alt="ekran görüntüsü" loading="lazy" />
        </div>
      )}

      <Link href={`/sorgula?q=${encodeURIComponent(aday.domain)}`} className="ivexplore">Tam raporu aç →</Link>
    </div>
  );
}

// rapor.alanlar/bulgular'dan "neden şüphelendik" sinyalleri çıkar (gerçek).
function whyCikar(r: Rapor | null): { t: string; m?: string }[] {
  if (!r) return [];
  const out: { t: string; m?: string }[] = [];
  const alan = (ad: string) => r.alanlar?.find((a) => a.ad === ad)?.deger;
  const has = (re: RegExp) => (r.bulgular || []).some((b) => re.test(b));
  const yas = alan("Domain yaşı"); if (yas && /^([0-9]|[1-2][0-9]|30) gün/.test(yas)) out.push({ t: "Yeni domain", m: yas });
  if (alan("En yeni sertifika (CT)") || alan("Sertifika geçmişi")) out.push({ t: "Yeni sertifika (CT)" });
  if (alan("Taklit uyarısı")) out.push({ t: "Marka adı taşıyor", m: "resmi değil" });
  const mg = alan("Marka taklidi güveni")?.match(/(\d+)\s*\/\s*100/); if (mg) out.push({ t: "Marka taklidi güveni", m: "%" + mg[1] });
  if (alan("Logo taklidi (görsel)")) out.push({ t: "Logo taklidi (görsel)", m: alan("Logo taklidi (görsel)") });
  if (alan("İçerikte kurum taklidi")) out.push({ t: "İçerikte kurum taklidi" });
  if (alan("Klon kaynağı")) out.push({ t: "Klon kaynağı", m: alan("Klon kaynağı")?.split(" ")[0] });
  if (alan("Yönlendirme zinciri") && has(/BAŞKA bir siteye/)) out.push({ t: "Şüpheli yönlendirme" });
  if (has(/ŞİFRE|KART bilgisi|kimlik avı/i)) out.push({ t: "Kimlik/kart formu" });
  const fav = alan("Favicon"); if (fav && /aynı/i.test(fav)) out.push({ t: "Aynı favicon ailesi" });
  if (alan("Kara liste")) out.push({ t: "Kara listede", m: alan("Kara liste") });
  const ip = alan("Aynı IP'de"); if (ip) out.push({ t: "Bağlı altyapı", m: ip });
  if (has(/SSL sertifikası geçersiz/)) out.push({ t: "Geçersiz SSL" });
  return out.slice(0, 9);
}

/* Risk gelişimi sparkline — gerçek gecmis noktalarından */
function TrajSpark({ gecmis }: { gecmis: Gecmis[] }) {
  const w = 300, h = 54, pad = 4, max = 100;
  const n = gecmis.length;
  const pts = gecmis.map((g, i) => [pad + (i * (w - 2 * pad)) / Math.max(1, n - 1), h - pad - (Math.min(max, g.risk) / max) * (h - 2 * pad)] as [number, number]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L${pts[n - 1][0].toFixed(1)} ${h} L${pad} ${h} Z`;
  const last = gecmis[n - 1];
  const renk = last.risk >= 60 ? "#f0524f" : last.risk >= 30 ? "#f2a33c" : "#4d9fe0";
  const zaman = (t: number) => new Date(t).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
  return (
    <div className="traj">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs><linearGradient id="tgs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={renk} stopOpacity=".35" /><stop offset="1" stopColor={renk} stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#tgs)" />
        <path d={line} fill="none" stroke={renk} strokeWidth="2" strokeLinejoin="round" />
        <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r="3" fill={renk} />
      </svg>
      <div className="tax"><span>{zaman(gecmis[0].t)}</span><span>şimdi · {last.risk}/100</span></div>
    </div>
  );
}

/* SADE tehdit listesi — düz Türkçe, ne olduğu + ne yapmalı bir bakışta */
function ThreatList({ adaylar, secili, onSelect }: { adaylar: Aday[]; secili: Aday | null; onSelect: (a: Aday) => void }) {
  const sirali = [...adaylar].sort((a, b) => b.skor - a.skor);
  const cumle = (a: Aday) => {
    if (a.skor >= 60) return `"${a.marka}" taklidi — sahte/tuzak site olması çok muhtemel. İnceleyip bildir.`;
    if (a.skor >= 30) return `"${a.marka}" adını taşıyor ama resmi adresi değil — şüpheli, doğrulanmalı.`;
    return `"${a.marka}" ile zayıf benzerlik — izlemede, düşük öncelik.`;
  };
  const renk = (s: number) => (s >= 60 ? "#f0524f" : s >= 30 ? "#f2a33c" : "#4d9fe0");
  const etiket = (s: number) => (s >= 60 ? "YÜKSEK" : s >= 30 ? "ORTA" : "İZLEMEDE");
  if (!adaylar.length) return <div className="mempty" style={{ padding: 40 }}>Yakalama bekleniyor — sistem interneti tarıyor…</div>;
  return (
    <div className="tlist">
      {sirali.map((a) => (
        <button className={`trow ${secili?.domain === a.domain ? "sel" : ""}`} key={a.domain} onClick={() => onSelect(a)}>
          <span className="tbadge" style={{ color: renk(a.skor), borderColor: renk(a.skor) + "55", background: renk(a.skor) + "1a" }}>
            <b>{a.skor}</b>{etiket(a.skor)}
          </span>
          <span className="tmain">
            <span className="tdom">{a.domain}</span>
            <span className="tcumle">{cumle(a)}</span>
          </span>
          <span className="tbrand">{a.marka}</span>
          <span className="tarrow">›</span>
        </button>
      ))}
    </div>
  );
}

/* Tehdit Evreni — gerçek adaylardan force-graph (canvas) */
function ThreatUniverse({ adaylar, secili, onSelect }: { adaylar: Aday[]; secili: Aday | null; onSelect: (a: Aday) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const state = useRef<{ nodes: any[]; markalar: any[] }>({ nodes: [], markalar: [] });
  const adayRef = useRef(adaylar); adayRef.current = adaylar;
  const seciliRef = useRef(secili); seciliRef.current = secili;

  useEffect(() => {
    const canvas = cv.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!; const DPR = Math.min(2, devicePixelRatio || 1);
    let W = 0, H = 0, raf = 0;
    const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const resize = () => { const b = canvas.getBoundingClientRect(); W = b.width; H = b.height; canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

    function rebuild() {
      const ad = adayRef.current;
      const markaAdlari = [...new Set(ad.map((a) => a.marka))];
      const mk = markaAdlari.map((m, i) => {
        const ang = (i / Math.max(1, markaAdlari.length)) * Math.PI * 2;
        return { marka: m, x: W / 2 + Math.cos(ang) * Math.min(W, H) * 0.24, y: H / 2 + Math.sin(ang) * Math.min(W, H) * 0.24, r: 15, pin: true };
      });
      const mkMap: Record<string, any> = {}; mk.forEach((m) => (mkMap[m.marka] = m));
      const nodes = ad.map((a) => {
        const p = mkMap[a.marka] || { x: W / 2, y: H / 2 };
        return { aday: a, marka: a.marka, x: p.x + (Math.random() - 0.5) * 120, y: p.y + (Math.random() - 0.5) * 120, vx: 0, vy: 0, r: a.skor >= 60 ? 8 : 6 };
      });
      state.current = { nodes, markalar: mk };
    }
    rebuild();
    const rebuildT = setInterval(rebuild, 4000);

    canvas.onclick = (e) => {
      const b = canvas.getBoundingClientRect(); const mx = e.clientX - b.left, my = e.clientY - b.top;
      let best: any = null, bd = 400;
      for (const n of state.current.nodes) { const d = (n.x - mx) ** 2 + (n.y - my) ** 2; if (d < bd) { bd = d; best = n; } }
      if (best) onSelect(best.aday);
    };

    let t = 0;
    function frame() {
      t += 0.02;
      const { nodes, markalar } = state.current;
      // fizik
      for (const n of nodes) {
        const mk = markalar.find((m) => m.marka === n.marka);
        if (mk) { n.vx += (mk.x - n.x) * 0.006; n.vy += (mk.y - n.y) * 0.006; }
        for (const o of nodes) { if (o === n) continue; const dx = n.x - o.x, dy = n.y - o.y, ds = dx * dx + dy * dy + 0.1; if (ds < 2600) { const f = 60 / ds; n.vx += dx * f; n.vy += dy * f; } }
        n.vx *= 0.8; n.vy *= 0.8; n.x += n.vx; n.y += n.vy;
        n.x = Math.max(10, Math.min(W - 10, n.x)); n.y = Math.max(10, Math.min(H - 10, n.y));
      }
      ctx.clearRect(0, 0, W, H);
      // marka→aday bağları
      for (const n of nodes) { const mk = markalar.find((m) => m.marka === n.marka); if (!mk) continue;
        ctx.beginPath(); ctx.moveTo(mk.x, mk.y); ctx.lineTo(n.x, n.y);
        ctx.strokeStyle = "rgba(77,159,224,0.10)"; ctx.lineWidth = 0.6; ctx.stroke(); }
      // marka düğümleri
      for (const m of markalar) {
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 8, 0, 6.28); ctx.strokeStyle = "rgba(57,189,248,0.18)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.28); ctx.fillStyle = "#12283c"; ctx.fill();
        ctx.strokeStyle = "#39bdf8"; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.font = "600 10px 'IBM Plex Mono',monospace"; ctx.fillStyle = "#cfe0ef"; ctx.textAlign = "center";
        ctx.fillText(String(m.marka).slice(0, 12), m.x, m.y + m.r + 13);
      }
      // aday düğümleri
      for (const n of nodes) {
        const risk = n.aday.skor; const c = risk >= 60 ? "#f0524f" : risk >= 30 ? "#f2a33c" : "#4d9fe0";
        const isSel = seciliRef.current && seciliRef.current.domain === n.aday.domain;
        if (risk >= 60) { const g = (Math.sin(t * 3) + 1) / 2; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5 + g * 3, 0, 6.28); ctx.fillStyle = "rgba(240,82,79," + (0.05 + g * 0.07) + ")"; ctx.fill(); }
        if (isSel) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 6, 0, 6.28); ctx.strokeStyle = "#e9f2fa"; ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.28); ctx.fillStyle = c; ctx.fill();
        ctx.strokeStyle = "rgba(8,16,25,0.9)"; ctx.lineWidth = 1.2; ctx.stroke();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    if (reduce) { for (let i = 0; i < 60; i++) frame(); } else frame();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); clearInterval(rebuildT); };
  }, [onSelect]);

  return <canvas ref={cv} className="mcanvas" />;
}

/* Kokpit stilleri (ops-konsol, IBM Plex + lacivert, altın yok) */
function MStyle() {
  return (
    <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@500&display=swap');
    .mercek{position:fixed;inset:0;z-index:90;display:grid;grid-template-rows:auto 1fr auto;
      background:radial-gradient(1000px 600px at 60% -10%,#0f2740 0,transparent 60%),linear-gradient(#070e16,#081019);
      color:#e9f2fa;font-family:'IBM Plex Sans',system-ui,sans-serif;font-variant-numeric:tabular-nums;overflow:hidden}
    .mtop{display:flex;align-items:center;gap:20px;padding:10px 18px;border-bottom:1px solid #1c3346;background:rgba(8,16,25,.7)}
    .mbrand{display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit;padding-right:18px;border-right:1px solid #1c3346}
    .mbrand b{font-family:'IBM Plex Serif',serif;font-weight:500;font-size:15px;display:block;line-height:1}
    .mbrand i{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#5c748b;letter-spacing:.14em;text-transform:uppercase;font-style:normal}
    .mlive{display:flex;align-items:center;gap:7px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em}
    .mlive.on{color:#31c8b0}.mlive.off{color:#f2a33c}
    .mdot{width:8px;height:8px;border-radius:50%;background:currentColor;box-shadow:0 0 0 0 rgba(49,200,176,.6);animation:mp 2s infinite}
    .mlive.on .mdot{background:#31c8b0}.mstream .mdot,.msh .mdot{background:#31c8b0;color:#31c8b0}
    @keyframes mp{0%{box-shadow:0 0 0 0 rgba(49,200,176,.5)}70%{box-shadow:0 0 0 8px rgba(49,200,176,0)}100%{box-shadow:0 0 0 0 rgba(49,200,176,0)}}
    .mclock{font-family:'IBM Plex Mono',monospace;font-size:12px;color:#8fa6bd}
    .mcikis{margin-left:14px;padding:6px 12px;border:1px solid #234561;border-radius:8px;background:transparent;color:#8fa6bd;font-family:'IBM Plex Sans',sans-serif;font-size:11px;cursor:pointer;white-space:nowrap}
    .mcikis:hover{border-color:#f0524f;color:#f0524f}
    .mcikis .ha{color:#e9f2fa;font-weight:600}
    .mscope{font-size:12.5px;color:#8fa6bd;padding:4px 12px;border:1px solid #234561;border-radius:20px;background:rgba(57,189,248,.08)}
    .mscope b{color:#39bdf8;font-family:'IBM Plex Serif',serif;font-size:14px}
    .mmarka{margin-left:auto;background:#0d1b28;color:#e9f2fa;border:1px solid #234561;border-radius:8px;padding:6px 12px;font-family:'IBM Plex Sans',sans-serif;font-size:12px;cursor:pointer}
    .mmarka+.mtoggle{margin-left:12px}
    .mfunnel{display:flex;margin-left:auto}
    .mfstep{display:flex;flex-direction:column;gap:2px;padding:0 14px;border-left:1px solid #15283a}
    .mfstep:first-child{border-left:none}
    .mfstep .fn{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:16px;line-height:1}
    .mfstep .fl{font-size:8.5px;letter-spacing:.11em;text-transform:uppercase;color:#5c748b}
    .mfstep.warn .fn{color:#f2a33c}.mfstep.crit .fn{color:#f0524f}
    .mintro{position:absolute;inset:0;z-index:200;display:grid;place-items:center;background:rgba(5,10,16,.72);backdrop-filter:blur(3px);padding:20px}
    .mi-body{max-width:560px;background:linear-gradient(180deg,#0f2033,#0b1622);border:1px solid #234561;border-radius:16px;padding:24px 26px;box-shadow:0 30px 80px -30px rgba(0,0,0,.8)}
    .mi-h{font-family:'IBM Plex Serif',serif;font-size:19px;color:#e9f2fa;margin-bottom:16px}
    .mi-steps{display:flex;flex-direction:column;gap:11px}
    .mi-steps span{font-size:13.5px;color:#a7bccf;line-height:1.5}
    .mi-steps b{color:#e9f2fa;font-weight:600}
    .mi-note{margin-top:16px;padding-top:14px;border-top:1px solid #1c3346;font-size:12.5px;color:#8fa6bd;line-height:1.5}
    .mi-note b{color:#39bdf8}
    .mi-close{position:relative;z-index:201;margin-top:18px;padding:12px 22px;border:none;border-radius:10px;cursor:pointer;background:linear-gradient(180deg,#2f6fb0,#204d80);color:#fff;font-family:'IBM Plex Sans',sans-serif;font-weight:600;font-size:13px;letter-spacing:.03em}
    .mi-close:hover{filter:brightness(1.12)}
    .mmain{display:grid;grid-template-columns:118px 1fr 360px;min-height:0}
    .mrail{border-right:1px solid #1c3346;padding:12px 0;display:flex;flex-direction:column;gap:1px;background:rgba(8,16,25,.5)}
    .mnav{display:flex;align-items:center;padding:9px 16px;color:#8fa6bd;font-size:11.5px;font-weight:500;letter-spacing:.05em;cursor:pointer;border-left:2px solid transparent}
    .mnav b{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10px;color:#4d9fe0;font-weight:600}
    .mnav.on{color:#e9f2fa;border-left-color:#39bdf8;background:linear-gradient(90deg,rgba(57,189,248,.1),transparent)}
    .mnav:hover{color:#e9f2fa;background:rgba(47,111,176,.06)}
    .mspacer{flex:1}
    .mcenter{display:grid;grid-template-rows:auto 1fr 170px;min-height:0;min-width:0}
    .mtoolbar{display:flex;align-items:center;gap:14px;padding:12px 18px;border-bottom:1px solid #1c3346}
    .mtitle{font-size:14px;color:#8fa6bd}
    .mtitle b{color:#f0524f;font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:600}
    .mtitle span{color:#5c748b;font-size:12.5px}
    .mtoggle{margin-left:auto;display:flex;border:1px solid #234561;border-radius:8px;overflow:hidden}
    .mtoggle button{padding:6px 16px;border:none;background:transparent;color:#8fa6bd;font-family:'IBM Plex Sans',sans-serif;font-size:12px;font-weight:600;cursor:pointer}
    .mtoggle button.on{background:#2f6fb0;color:#fff}
    .tlist{overflow-y:auto;padding:6px 8px}
    .tlist::-webkit-scrollbar{width:9px}.tlist::-webkit-scrollbar-thumb{background:#1c3346;border-radius:5px}
    .trow{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:12px 14px;margin:3px 0;border:1px solid transparent;border-radius:11px;background:rgba(47,111,176,.04);cursor:pointer;transition:.15s}
    .trow:hover{background:rgba(47,111,176,.1);border-color:#234561}
    .trow.sel{background:rgba(57,189,248,.1);border-color:#39bdf8}
    .tbadge{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:58px;padding:6px 4px;border:1px solid;border-radius:9px;font-size:8px;font-weight:700;letter-spacing:.06em;flex:0 0 auto}
    .tbadge b{font-family:'IBM Plex Mono',monospace;font-size:19px;font-weight:600;line-height:1}
    .tmain{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
    .tdom{font-family:'IBM Plex Mono',monospace;font-size:14px;color:#e9f2fa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tcumle{font-size:12.5px;color:#8fa6bd;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tbrand{flex:0 0 auto;font-family:'IBM Plex Serif',serif;font-size:13px;color:#cfe0ef;background:rgba(139,125,224,.1);border:1px solid rgba(139,125,224,.22);padding:4px 10px;border-radius:7px}
    .tarrow{flex:0 0 auto;color:#5c748b;font-size:22px;line-height:1}
    .muniverse{position:relative;min-height:0;overflow:hidden}
    .muniverse{position:relative;min-height:0;overflow:hidden}
    .mcanvas{position:absolute;inset:0;width:100%;height:100%;cursor:pointer}
    .muhead{position:absolute;top:12px;left:16px;pointer-events:none}
    .muhead .t{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#8fa6bd}
    .muhead .b{font-family:'IBM Plex Serif',serif;font-size:16px;margin-top:3px}
    .mlegend{position:absolute;bottom:10px;left:16px;display:flex;gap:12px;align-items:center;pointer-events:none}
    .mlegend span{display:flex;align-items:center;gap:5px;font-family:'IBM Plex Mono',monospace;font-size:9px;color:#5c748b}
    .mlegend i{width:8px;height:8px;border-radius:50%}
    .mlegend .hint{color:#4d9fe0;margin-left:6px}
    .mstream{border-top:1px solid #1c3346;background:rgba(8,16,25,.55);display:flex;flex-direction:column;min-height:0}
    .msh{display:flex;align-items:center;gap:9px;padding:8px 14px;border-bottom:1px solid #15283a}
    .msh .t{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8fa6bd}
    .msh .rate{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10px;color:#31c8b0}
    .mevlist{flex:1;overflow-y:auto;padding:3px 0}
    .mevlist::-webkit-scrollbar{width:7px}.mevlist::-webkit-scrollbar-thumb{background:#1c3346;border-radius:4px}
    .mempty,.miv-empty{padding:16px;color:#5c748b;font-size:12px;text-align:center}
    .miv-empty.sm{padding:8px;font-size:11px;text-align:left}
    .mev{display:flex;align-items:center;gap:10px;padding:3px 14px;font-family:'IBM Plex Mono',monospace;font-size:11px;animation:mevin .4s}
    @keyframes mevin{from{opacity:0;transform:translateY(-5px)}to{opacity:1}}
    .mev.hit{background:rgba(240,82,79,.06)}
    .mev .src{color:#5c748b;font-size:9.5px;flex:0 0 62px;overflow:hidden;text-overflow:ellipsis}
    .mev .tag{font-size:8.5px;letter-spacing:.06em;padding:2px 6px;border-radius:4px;flex:0 0 auto;background:rgba(77,159,224,.12);color:#8fa6bd}
    .mev .tag.crit{background:rgba(240,82,79,.16);color:#f0524f;font-weight:600}
    .mev .dom{color:#cfe0ef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
    .mev .ca{color:#5c748b;font-size:9.5px;flex:0 0 auto;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .minvest{border-left:1px solid #1c3346;background:rgba(8,16,25,.5);overflow-y:auto}
    .minvest::-webkit-scrollbar{width:8px}.minvest::-webkit-scrollbar-thumb{background:#1c3346;border-radius:4px}
    .miv{padding:15px 15px 24px}
    .miv .eyebrow{font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;color:#5c748b}
    .ivdom{font-family:'IBM Plex Mono',monospace;font-size:14px;margin-top:6px;word-break:break-all;line-height:1.35}
    .ivrisk{display:flex;align-items:center;gap:13px;margin-top:13px}
    .gauge{position:relative;width:76px;height:76px;flex:0 0 auto}
    .gauge .gval{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .gauge .gval b{font-family:'IBM Plex Mono',monospace;font-size:21px;font-weight:600;line-height:1}
    .gauge .gval span{font-size:8px;letter-spacing:.1em;color:#5c748b;margin-top:2px}
    .ivverdict{flex:1}
    .badge{display:inline-block;padding:4px 9px;border-radius:6px;font-size:10.5px;font-weight:600;border:1px solid}
    .ivverdict .bl{font-size:11.5px;color:#8fa6bd;margin-top:8px}
    .ivverdict .bl b{color:#e9f2fa;font-family:'IBM Plex Serif',serif}
    .ivverdict .durum{font-size:10.5px;color:#5c748b;margin-top:4px}
    .engel{margin-top:12px;padding:8px 10px;border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;line-height:1.5}
    .engel i{display:block;color:#8fa6bd;font-style:normal;margin-top:3px;font-size:9px}
    .engel.known{background:rgba(240,82,79,.1);color:#f0524f;border:1px solid rgba(240,82,79,.25)}
    .engel.new{background:rgba(47,111,176,.1);color:#4d9fe0;border:1px solid rgba(47,111,176,.25)}
    .ivsect{margin-top:18px}
    .ivsect .lbl{display:flex;align-items:center;gap:8px;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:#8fa6bd;margin-bottom:9px}
    .ivsect .lbl .n{margin-left:auto;font-family:'IBM Plex Mono',monospace;color:#39bdf8;letter-spacing:0}
    .ivsect .lbl .ld{margin-left:auto;color:#f2a33c;font-family:'IBM Plex Mono',monospace}
    .why{display:flex;flex-direction:column;gap:1px}
    .wrow{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;font-size:11px;color:#8fa6bd;background:rgba(47,111,176,.04)}
    .wrow .ck{color:#31c8a0;font-weight:700;flex:0 0 auto}
    .wrow b{color:#e9f2fa;font-weight:500}
    .wrow .m{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#cfe0ef}
    .consensus{margin-top:9px;font-size:10.5px;color:#8fa6bd;text-align:center;padding:7px;border:1px dashed #1c3346;border-radius:7px}
    .consensus b{color:#39bdf8;font-family:'IBM Plex Mono',monospace}
    .kats{display:flex;flex-wrap:wrap;gap:6px}
    .kat{font-size:10px;padding:4px 8px;border-radius:5px;border:1px solid;font-family:'IBM Plex Mono',monospace}
    .dedektif{font-size:12px;color:#cfe0ef}.dedektif b{color:#e9f2fa}
    .ladder{display:flex;flex-direction:column}
    .rung{display:flex;align-items:center;gap:9px;font-size:10.5px;color:#5c748b;padding:3px 0;position:relative}
    .rung::before{content:"";position:absolute;left:4.5px;top:-5px;height:11px;width:1px;background:#1c3346}
    .rung:first-child::before{display:none}
    .rung i{width:10px;height:10px;border-radius:50%;border:1.5px solid #1c3346;background:#0d1b28;flex:0 0 auto;z-index:1;transition:.4s}
    .rung.done{color:#8fa6bd}.rung.done i{background:#31c8b0;border-color:#31c8b0}
    .rung.active{color:#f0524f;font-weight:600}.rung.active i{background:#f0524f;border-color:#f0524f;box-shadow:0 0 0 4px rgba(240,82,79,.16)}
    .dna{display:flex;flex-wrap:wrap;gap:6px}
    .dnachip{display:inline-flex;align-items:center;gap:5px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:#cfe0ef;background:rgba(139,125,224,.1);border:1px solid rgba(139,125,224,.28);border-radius:5px;padding:4px 8px}
    .dnachip i{color:#8b7de0;font-style:normal;font-size:8.5px;letter-spacing:.06em;text-transform:uppercase}
    .dnahit{margin-top:9px;font-size:11px;color:#8b7de0;background:rgba(139,125,224,.08);border:1px solid rgba(139,125,224,.22);border-radius:7px;padding:8px 10px;line-height:1.5}
    .dnahit b{color:#e9f2fa}
    .dnanote{margin-top:8px;font-size:10px;color:#5c748b;line-height:1.5}
    .traj svg{width:100%;height:54px;display:block}
    .traj .tax{display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:9px;color:#5c748b;margin-top:3px}
    .ivshot{width:100%;border-radius:8px;border:1px solid #1c3346}
    .ivexplore{display:block;margin-top:18px;text-align:center;padding:11px;border-radius:9px;background:linear-gradient(180deg,#2f6fb0,#204d80);color:#fff;font-weight:600;font-size:12px;letter-spacing:.04em;text-decoration:none}
    .ivexplore:hover{filter:brightness(1.12)}
    .msensors{display:flex;align-items:center;border-top:1px solid #1c3346;background:rgba(8,16,25,.85);padding:0 4px;overflow-x:auto}
    .sload{padding:9px 14px;color:#5c748b;font-family:'IBM Plex Mono',monospace;font-size:10px}
    .msensor{display:flex;align-items:center;gap:8px;padding:8px 14px;border-right:1px solid #15283a;white-space:nowrap}
    .msensor .st{width:6px;height:6px;border-radius:50%;background:#31c8b0;animation:mp 2.4s infinite}
    .msensor .nm{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#8fa6bd}
    .msensor .rt{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#cfe0ef}
    .msensor .mt{font-size:8.5px;color:#f0524f;letter-spacing:.04em}
    .msensor.meta{margin-left:auto;border-right:none}
    .msensor.meta .k{font-size:8.5px;letter-spacing:.1em;color:#5c748b}
    .msensor.meta .v{font-family:'IBM Plex Mono',monospace;font-size:11px;color:#39bdf8;margin-left:5px}
    @media (max-width:1080px){.mmain{grid-template-columns:1fr}.minvest,.mrail{display:none}}
    @media (prefers-reduced-motion:reduce){.mdot,.msensor .st{animation:none}}
    `}</style>
  );
}
