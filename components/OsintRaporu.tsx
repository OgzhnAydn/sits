"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Değer metnindeki alan adı/URL'leri TIKLANABİLİR yapar (analist inceleme için).
// Klon kaynağı, alt alanlar, yönlendirme hedefleri, MX/NS gibi keşfedilen adresler
// düz metin değil, yeni sekmede açılan gerçek link olur.
function DegerMetni({ text }: { text: string }): ReactNode {
  const parcalar: ReactNode[] = [];
  const re = /(https?:\/\/[^\s)]+|(?:[a-z0-9-]+\.)+[a-z]{2,})/gi;
  let son = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > son) parcalar.push(text.slice(son, m.index));
    const ham = m[0].replace(/[.,]$/, "");
    const href = /^https?:\/\//i.test(ham) ? ham : `https://${ham}`;
    parcalar.push(
      <a
        key={i++}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid break-all"
      >
        {ham}
      </a>,
    );
    son = m.index + ham.length;
  }
  if (son < text.length) parcalar.push(text.slice(son));
  return <>{parcalar}</>;
}

type Rapor = {
  tip: string;
  deger: string;
  alanlar: { ad: string; deger: string }[];
  bulgular: string[];
  risk: number;
  riskSeviye: "Yüksek" | "Orta" | "Düşük";
  analiz: { ozet: string; yorum: string; neden?: string[]; adimlar: string[]; icerikTuru?: string; ai: boolean };
  baglantilar?: { deger: string; tip: string; sayi: number }[];
  ekranGoruntusu?: string;
  kategoriler?: { ad: string; ikon: string; skor: number; seviye: "Yok" | "Belirsiz" | "Şüpheli" | "Yüksek" }[];
  durum?: { durum: "aktif-tuzak" | "park" | "yayinda-degil" | "canli"; etiket: string; ikon: string };
  dedektif?: { tur: string; hedef: string; paraYontemi: string; operasyon: string; gerekce: string[]; guven: "Yüksek" | "Orta" | "Düşük"; ai: boolean };
};

const DURUM_RENK: Record<string, string> = {
  "aktif-tuzak": "bg-error/12 text-error border-error/20",
  "park": "bg-primary/10 text-primary border-primary/20",
  "yayinda-degil": "bg-on-surface-variant/10 text-on-surface-variant border-outline-variant/30",
  "canli": "bg-secondary/12 text-secondary border-secondary/20",
};

const KAT_RENK: Record<string, { renk: string; nokta: string; ikon: string }> = {
  "Yüksek": { renk: "text-error", nokta: "bg-error", ikon: "gpp_bad" },
  "Şüpheli": { renk: "text-primary", nokta: "bg-primary", ikon: "gpp_maybe" },
  "Belirsiz": { renk: "text-on-surface-variant", nokta: "bg-on-surface-variant/50", ikon: "help" },
  "Yok": { renk: "text-secondary", nokta: "bg-secondary/60", ikon: "check_circle" },
};

const RENK: Record<string, { stroke: string; text: string; ikon: string; chip: string; nokta: string }> = {
  "Yüksek": { stroke: "var(--color-error)", text: "text-error", ikon: "gpp_bad", chip: "bg-error/10 text-error", nokta: "bg-error" },
  "Orta": { stroke: "var(--color-primary)", text: "text-primary", ikon: "gpp_maybe", chip: "bg-primary/10 text-primary", nokta: "bg-primary" },
  "Düşük": { stroke: "var(--color-secondary)", text: "text-secondary", ikon: "verified_user", chip: "bg-secondary/10 text-secondary", nokta: "bg-secondary" },
};

// Panel renk grupları (referans infografik dili)
const YESIL = { panel: "bg-secondary/8", baslikCip: "bg-secondary/15 text-secondary", satir: "bg-secondary/12 text-secondary", nokta: "bg-secondary" };
const MOR = { panel: "bg-primary/8", baslikCip: "bg-primary/15 text-primary", satir: "bg-primary/10 text-primary", nokta: "bg-primary" };
const AMBER = { panel: "bg-warning/10", baslikCip: "bg-warning/20 text-warning", satir: "bg-warning/15 text-warning", nokta: "bg-warning" };

const ALAN_IKON: Record<string, string> = {
  "IP adresi": "dns", "Sunucu ülkesi": "public", "Barındırma": "cloud", "Kayıt tarihi": "event",
  "Domain yaşı": "schedule", "Kayıt firması": "corporate_fare", "Görsel tarama": "photo_camera",
  "VirusTotal": "verified_user", "Güvenli bağlantı": "lock", "Taklit uyarısı": "warning",
  "Google Safe Browsing": "gpp_bad", "Biçim": "badge", "Operatör (tahsis)": "sim_card",
  "Hat tipi": "smartphone", "Geçerlilik": "check_circle", "Banka": "account_balance",
  "Topluluk bildirimi": "groups", "Tehdit listesi": "gpp_bad",
};
const alanIkon = (ad: string) => ALAN_IKON[ad] || "info";

function Nazar({ size = 16 }: { size?: number }) {
  return (
    <span className="shrink-0" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/casper-wave.webp" alt="" className="h-full w-full object-contain" />
    </span>
  );
}

/* Sol raydaki düğüm + kısa etiket (referans stili) */
function RayDugum({ nokta, etiket }: { nokta: string; etiket: string }) {
  return (
    <div className="absolute -left-14 top-4 flex w-14 flex-col items-center">
      <span className={`h-3 w-3 rounded-full ${nokta}`} style={{ boxShadow: "0 0 0 4px var(--color-background)" }} />
      <span className="mt-1.5 text-center text-[8.5px] font-bold uppercase leading-[1.15] tracking-wide text-on-surface-variant">
        {etiket}
      </span>
    </div>
  );
}

/* Bölüm = ray düğümü + içerik */
function Bolum({ nokta, etiket, children }: { nokta: string; etiket: string; children: React.ReactNode }) {
  return (
    <section className="relative mt-4 first:mt-0">
      <RayDugum nokta={nokta} etiket={etiket} />
      {children}
    </section>
  );
}

/* Pastel grup paneli */
function Panel({
  renk, baslik, alt, ikon, children,
}: {
  renk: typeof YESIL; baslik: string; alt?: string; ikon: string; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-3xl p-4 ${renk.panel}`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${renk.baslikCip}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{ikon}</span>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-on-surface">{baslik}</p>
          {alt && <p className="text-[11px] leading-tight text-on-surface-variant">{alt}</p>}
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RiskHalka({ risk, stroke }: { risk: number; stroke: string }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-[78px] w-[78px] shrink-0 place-items-center">
      <svg viewBox="0 0 78 78" className="absolute inset-0 -rotate-90">
        <circle cx="39" cy="39" r={r} fill="none" stroke="var(--color-surface-high)" strokeWidth="7" />
        <circle
          cx="39" cy="39" r={r} fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${(c * risk) / 100} ${c}`} style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="text-center leading-none">
        <p className="font-display text-xl font-extrabold text-on-surface">{risk}</p>
        <p className="text-[9px] text-on-surface-variant">/100</p>
      </div>
    </div>
  );
}

// Ekran görüntüsü yoksa CANLI çeker: /api/ekran domain'i urlscan'e aktif taratır, hazır olunca gösterir.
function EkranYakala({ domain }: { domain: string }) {
  const [shot, setShot] = useState<string | null>(null);
  const [durum, setDurum] = useState<"taraniyor" | "yok">("taraniyor");
  useEffect(() => {
    let iptal = false;
    let tur = 0;
    async function tik(uuid?: string) {
      if (iptal) return;
      try {
        const q = uuid ? `uuid=${uuid}` : `domain=${encodeURIComponent(domain)}`;
        const j = await (await fetch(`/api/ekran?${q}`)).json();
        if (iptal) return;
        if (j.durum === "hazir" && j.screenshot) { setShot(j.screenshot); return; }
        if (j.durum === "taraniyor" && j.uuid && tur < 12) { tur++; setTimeout(() => tik(j.uuid), 4500); return; }
        setDurum("yok");
      } catch { if (!iptal) setDurum("yok"); }
    }
    tik();
    return () => { iptal = true; };
  }, [domain]);

  if (shot) return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>photo_camera</span>
        Sitenin görünümü <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">CANLI ÇEKİM</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot} alt="Sitenin ekran görüntüsü" loading="lazy" className="w-full rounded-2xl border border-outline-variant/30" />
    </div>
  );
  if (durum === "yok") return null;
  return (
    <div className="mt-5 flex items-center gap-2 rounded-2xl border border-outline-variant/30 bg-surface-lowest px-4 py-3 text-[13px] text-on-surface-variant">
      <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 18 }}>progress_activity</span>
      Ekran görüntüsü canlı olarak alınıyor… (birkaç saniye sürebilir)
    </div>
  );
}

// Kayıtlı urlscan görüntüsünü gösterir; dosya 404 ise (eski/başarısız tarama) kırık
// <img> yerine CANLI ÇEKİM'e (aktif tarama) düşer.
function EkranGoruntu({ url, domain }: { url: string; domain: string }) {
  const [kirik, setKirik] = useState(false);
  if (kirik) return <EkranYakala domain={domain} />;
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>photo_camera</span>
        Sitenin görünümü (urlscan.io)
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Sitenin ekran görüntüsü" loading="lazy" onError={() => setKirik(true)} className="w-full rounded-2xl border border-outline-variant/30" />
    </div>
  );
}

export default function OsintRaporu({ giris, onDurum }: { giris: string; onDurum?: (seviye: "Yüksek" | "Orta" | "Düşük") => void }) {
  const [rapor, setRapor] = useState<Rapor | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [pdfYukleniyor, setPdfYukleniyor] = useState(false);
  const [teknikAcik, setTeknikAcik] = useState(false); // teknik detaylar varsayılan KAPALI (sade)
  const kapRef = useRef<HTMLDivElement>(null);
  const hamRef = useRef<HTMLDivElement>(null);
  const hamIcRef = useRef<HTMLDivElement>(null);
  const sonAktifRef = useRef<number>(-1);

  async function pdfIndir() {
    if (!rapor || pdfYukleniyor) return;
    setPdfYukleniyor(true);
    try {
      const r = await fetch("/api/rapor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rapor }),
      });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const ad = (rapor.deger || "rapor").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MirLeon-OSINT-${ad}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // sessiz geç
    } finally {
      setPdfYukleniyor(false);
    }
  }

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    setRapor(null);
    fetch("/api/osint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giris }),
    })
      .then((r) => r.json())
      .then((d) => { if (!iptal) { setRapor(d); if (d?.riskSeviye) onDurum?.(d.riskSeviye); } })
      .catch(() => {})
      .finally(() => { if (!iptal) setYukleniyor(false); });
    return () => { iptal = true; };
  }, [giris]);

  // Kaydırdıkça Nazar'ı sol ray boyunca aşağı-yukarı süzdür
  useEffect(() => {
    const el = kapRef.current;
    const ham = hamRef.current;
    if (!el || !ham) return;
    let raf = 0;
    const guncelle = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      let p = (vh * 0.5 - rect.top) / (rect.height || 1);
      p = Math.max(0, Math.min(1, p));
      const menzil = Math.max(0, el.clientHeight - ham.offsetHeight);
      const ty = p * menzil;
      ham.style.transform = `translateY(${ty}px)`;

      // Casper hangi maddeye en yakın? Ona geldiğinde eliyle işaret etsin.
      const hamsiMerkez = rect.top + ty + ham.offsetHeight / 2;
      const satirlar = el.querySelectorAll<HTMLElement>("[data-madde]");
      let enYakin = -1;
      let enMesafe = Infinity;
      satirlar.forEach((row, i) => {
        const rr = row.getBoundingClientRect();
        const d = Math.abs(rr.top + rr.height / 2 - hamsiMerkez);
        if (d < enMesafe) { enMesafe = d; enYakin = i; }
      });
      satirlar.forEach((row, i) => row.classList.toggle("madde-aktif", i === enYakin));
      if (enYakin >= 0 && enYakin !== sonAktifRef.current) {
        sonAktifRef.current = enYakin;
        const ic = hamIcRef.current;
        if (ic) {
          ic.classList.remove("hamsi-isaret");
          void ic.offsetWidth; // reflow -> animasyonu yeniden tetikle
          ic.classList.add("hamsi-isaret");
        }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(guncelle); };
    guncelle();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [rapor]);

  if (yukleniyor) {
    return (
      <div className="surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 16 }}>progress_activity</span>
          Nazar açık kaynakları tarıyor…
        </div>
        <div className="skeleton h-4 w-1/2" />
        <div className="mt-3 space-y-2">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-5/6" />
          <div className="skeleton h-3 w-4/6" />
        </div>
      </div>
    );
  }
  if (!rapor || rapor.alanlar?.length === undefined) return null;

  const renk = RENK[rapor.riskSeviye];
  const nedenler = rapor.analiz?.neden?.length ? rapor.analiz.neden : rapor.bulgular;

  return (
    <div ref={kapRef} className="fade-up relative mt-4 pl-14">
      {/* Sol ray çizgisi */}
      <div className="pointer-events-none absolute bottom-5 left-[27px] top-5 w-0.5 rounded-full bg-outline-variant/40" />
      {/* Kaydırmayla süzülen Nazar */}
      <div ref={hamRef} className="pointer-events-none absolute left-3 top-0 z-[3] w-8 will-change-transform">
        <div ref={hamIcRef}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="" className="w-full drop-shadow-[0_6px_10px_oklch(0.35_0.14_265_/_0.35)]" />
        </div>
      </div>

      {/* Özet */}
      <Bolum nokta={renk.nokta} etiket="Özet">
        <div className="surface rounded-3xl p-5">
          <div className="flex items-center gap-4">
            <RiskHalka risk={rapor.risk} stroke={renk.stroke} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-on-surface-variant">OSINT Risk Değerlendirmesi</p>
              <p className={`mt-0.5 font-display text-xl font-extrabold ${renk.text}`}>{rapor.riskSeviye} risk</p>
              <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${renk.chip}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{renk.ikon}</span>
                Açık kaynak taraması
              </span>
              <p className="mt-1.5 text-[11px] leading-snug text-on-surface-variant">
                <b className="text-on-surface">{rapor.risk}/100</b> —{" "}
                {rapor.riskSeviye === "Yüksek"
                  ? "ciddi risk işaretleri, işlem yapma."
                  : rapor.riskSeviye === "Orta"
                  ? "kesin zararlı değil ama dikkatli ol."
                  : "belirgin tehlike yok, yine de temkinli ol."}
                <span className="opacity-60"> (0–30 düşük · 30–60 orta · 60+ yüksek)</span>
              </p>
            </div>
          </div>

          {/* Canlı Durum rozeti — aktif tuzak / park / yayında değil (riskten ayrı) */}
          {rapor.durum && (
            <div className={`mt-4 flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 ${DURUM_RENK[rapor.durum.durum] || DURUM_RENK["canli"]}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{rapor.durum.ikon}</span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Sitenin şu anki durumu</div>
                <div className="text-[13px] font-semibold">{rapor.durum.etiket}</div>
              </div>
            </div>
          )}

          {/* Engelleme durumu rozeti — zaten biliniyor/engelli mi, yoksa YENİ mi (biz erken bulduk) */}
          {(() => {
            const ed = rapor.alanlar?.find((a) => a.ad === "Engelleme durumu")?.deger;
            if (!ed) return null;
            const zaten = /Zaten biliniyor|engelli →/i.test(ed);
            const kaldirilmis = /Kaldırılmış|çözülmüyor/i.test(ed);
            const stil = zaten
              ? "bg-error/12 text-error border-error/20"
              : kaldirilmis
                ? "bg-on-surface-variant/10 text-on-surface-variant border-outline-variant/30"
                : "bg-primary/10 text-primary border-primary/20";
            const ikon = zaten ? "gpp_bad" : kaldirilmis ? "cloud_off" : "new_releases";
            const etiket = zaten ? "ZATEN ENGELLİ" : kaldirilmis ? "KALDIRILMIŞ OLABİLİR" : "YENİ TEHDİT — açık listelerde yok";
            return (
              <div className={`mt-3 flex items-start gap-2 rounded-2xl border px-3.5 py-2.5 ${stil}`}>
                <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18 }}>{ikon}</span>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">{etiket}</div>
                  <div className="text-[12px] font-medium leading-snug">{ed}</div>
                </div>
              </div>
            );
          })()}

          {/* Suç Türü Skor Kartı — tek skor yerine kategori bazlı değerlendirme */}
          {rapor.kategoriler && rapor.kategoriler.length > 0 && (
            <div className="mt-4 rounded-2xl border border-outline-variant/30 bg-surface-lowest p-4">
              <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>fact_check</span>
                Suç Türü Değerlendirmesi
              </div>
              <div className="space-y-1.5">
                {rapor.kategoriler.map((k) => {
                  const kr = KAT_RENK[k.seviye] || KAT_RENK["Yok"];
                  return (
                    <div key={k.ad} className="flex items-center gap-2.5 text-[13px]">
                      <span className={`material-symbols-outlined ${kr.renk}`} style={{ fontSize: 16 }}>{k.ikon}</span>
                      <span className="flex-1 text-on-surface">{k.ad}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${kr.nokta}`} />
                      <span className={`w-16 text-right text-[12px] font-semibold ${kr.renk}`}>{k.seviye}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2.5 text-[10.5px] leading-snug text-on-surface-variant/70">
                Tek skor yerine her tehdit türü ayrı değerlendirilir. &quot;Belirsiz&quot; = zayıf işaret, insan doğrulaması gerekir.
              </p>
            </div>
          )}

          {/* AI Dedektif Hükmü — gerekçeli uzman değerlendirmesi */}
          {rapor.dedektif && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/8 to-transparent">
              <div className="flex items-center justify-between border-b border-primary/15 px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-[12px] font-bold text-primary">
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>neurology</span>
                  AI Dedektif Hükmü
                </span>
                <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold text-primary">Güven: {rapor.dedektif.guven}</span>
              </div>
              <div className="p-4">
                <div className="font-display text-[15px] font-bold text-on-surface">{rapor.dedektif.tur}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-surface-lowest px-2.5 py-1 text-[11px] text-on-surface-variant">Hedef: <b className="text-on-surface">{rapor.dedektif.hedef}</b></span>
                  <span className="rounded-full bg-surface-lowest px-2.5 py-1 text-[11px] text-on-surface-variant">Para: <b className="text-on-surface">{rapor.dedektif.paraYontemi}</b></span>
                </div>
                {rapor.dedektif.operasyon && (
                  <p className="mt-2.5 text-[12px] leading-snug text-on-surface-variant"><b className="text-on-surface">Operasyon:</b> {rapor.dedektif.operasyon}</p>
                )}
                {rapor.dedektif.gerekce?.length > 0 && (
                  <div className="mt-3 border-t border-outline-variant/20 pt-3">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">Kanıt → Sonuç</div>
                    <ul className="space-y-1.5">
                      {rapor.dedektif.gerekce.map((g, i) => (
                        <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-on-surface">
                          <span className="mt-0.5 shrink-0 font-mono text-[10px] font-bold text-primary">{String(i + 1).padStart(2, "0")}</span>
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-2.5 text-[10px] text-on-surface-variant/60">Yapay zekâ, toplanan sinyallerden mantık yürüterek üretti — bir uzmanın çıkarımı gibi, yalnız kanıta dayalı.</p>
              </div>
            </div>
          )}

          {rapor.ekranGoruntusu ? (
            <EkranGoruntu url={rapor.ekranGoruntusu} domain={rapor.deger} />
          ) : rapor.tip === "url" ? (
            <EkranYakala domain={rapor.deger} />
          ) : null}

          {rapor.analiz?.ozet && (
            <div className="mt-5 flex items-start gap-1">
              <div className="h-16 w-16 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
              </div>
              {/* Maskotun ağzından çıkan konuşma balonu */}
              <div className="relative mt-3 flex-1 rounded-[22px] rounded-tl-md border border-primary/15 bg-primary-container/25 p-4 text-sm text-on-surface shadow-[var(--shadow-card)]">
                <span className="absolute -left-[7px] top-4 h-3.5 w-3.5 rotate-45 rounded-[3px] border-b border-l border-primary/15 bg-primary-container/25" />
                {rapor.analiz.icerikTuru && (
                  <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>description</span>
                    {rapor.analiz.icerikTuru}
                  </span>
                )}
                <p className="font-semibold">{rapor.analiz.ozet}</p>
                {rapor.analiz.yorum && <p className="mt-1 leading-relaxed text-on-surface-variant">{rapor.analiz.yorum}</p>}
              </div>
            </div>
          )}
        </div>
      </Bolum>

      {/* Neden */}
      {nedenler.length > 0 && (
        <Bolum nokta={MOR.nokta} etiket="Gerekçe">
          <Panel renk={MOR} ikon="psychology" baslik="Neden böyle değerlendirdik?" alt="Sonuca götüren sade gerekçeler">
            {nedenler.map((n, i) => (
              <div key={i} data-madde className="flex items-start gap-3 rounded-2xl bg-surface-lowest px-3 py-2.5 transition-shadow duration-200">
                <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${MOR.satir}`}>
                  <Nazar size={15} />
                </span>
                <span className="flex-1 text-[13px] leading-relaxed text-on-surface">{n}</span>
              </div>
            ))}
          </Panel>
        </Bolum>
      )}

      {/* İstihbarat — teknik detaylar, VARSAYILAN KAPALI (normal kullanıcıyı boğmasın) */}
      {rapor.alanlar.length > 0 && (
        <Bolum nokta={YESIL.nokta} etiket="İstihbarat">
          <div className={`rounded-3xl p-4 ${YESIL.panel}`}>
            <button onClick={() => setTeknikAcik((v) => !v)} className="flex w-full items-center gap-2.5 text-left">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${YESIL.baslikCip}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>travel_explore</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-on-surface">Teknik istihbarat</p>
                <p className="text-[11px] leading-tight text-on-surface-variant">
                  {rapor.alanlar.length} açık kaynak verisi — {teknikAcik ? "gizle" : "meraklısına, göster"}
                </p>
              </div>
              <span className="material-symbols-outlined shrink-0 text-on-surface-variant" style={{ fontSize: 24 }}>
                {teknikAcik ? "expand_less" : "expand_more"}
              </span>
            </button>
            {teknikAcik && (
              <div className="mt-3 space-y-2">
                {rapor.alanlar.map((a, i) => (
                  <div key={i} data-madde className="flex items-center gap-3 rounded-2xl bg-surface-lowest px-3 py-2.5 transition-shadow duration-200">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${YESIL.satir}`}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{alanIkon(a.ad)}</span>
                    </span>
                    <span className="text-[13px] font-semibold text-on-surface">{a.ad}</span>
                    <span className="ml-auto text-right text-[13px] font-medium text-on-surface-variant"><DegerMetni text={a.deger} /></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Bolum>
      )}

      {/* Bağlar */}
      {rapor.baglantilar && rapor.baglantilar.length > 0 && (
        <Bolum nokta={MOR.nokta} etiket="Bağlar">
          <Panel renk={MOR} ikon="hub" baslik="Birlikte bildirilen göstergeler" alt="Aynı kampanyada geçen diğer izler">
            {rapor.baglantilar.map((b, i) => (
              <div key={i} data-madde className="flex items-center gap-3 rounded-2xl bg-surface-lowest px-3 py-2.5 transition-shadow duration-200">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${MOR.satir}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {b.tip === "iban" ? "account_balance" : b.tip === "telefon" ? "call" : "link"}
                  </span>
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-on-surface"><DegerMetni text={b.deger} /></span>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{b.sayi}× birlikte</span>
              </div>
            ))}
          </Panel>
        </Bolum>
      )}

      {/* Aksiyon */}
      {rapor.analiz?.adimlar?.length > 0 && (
        <Bolum nokta={AMBER.nokta} etiket="Aksiyon">
          <Panel renk={AMBER} ikon="checklist" baslik="Ne yapmalısın?" alt="Somut, uygulanabilir adımlar">
            {rapor.analiz.adimlar.map((a, i) => (
              <div key={i} data-madde className="flex items-start gap-3 rounded-2xl bg-surface-lowest px-3 py-2.5 transition-shadow duration-200">
                <span className={`relative mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${AMBER.satir}`}>
                  <Nazar size={15} />
                  <span className="absolute -bottom-1 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-primary text-[9px] font-bold text-on-primary">{i + 1}</span>
                </span>
                <span className="flex-1 text-[13px] leading-relaxed text-on-surface">{a}</span>
              </div>
            ))}
          </Panel>
        </Bolum>
      )}

      {/* ETBİS resmî doğrulama — YALNIZCA alışveriş/e-ticaret türü sitede göster.
          Yabancı SaaS/haber/blog için "ETBİS'te yok = risk" demek yanıltıcıdır. */}
      {rapor.tip === "url" &&
        /ticaret|alışveriş|alisveris|mağaza|magaza|\bshop|store|market|satış|satis|sipariş|siparis/i.test(
          rapor.analiz?.icerikTuru || ""
        ) && (
        <div className="mt-4 rounded-2xl border border-outline-variant/40 bg-surface-lowest p-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>verified</span>
            <span className="text-sm font-semibold text-on-surface">Bu bir alışveriş sitesi mi?</span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
            Yasal e-ticaret siteleri T.C. Ticaret Bakanlığı&apos;nın <b>ETBİS</b> sistemine kayıtlıdır.
            Alışveriş yapmadan önce <b>{rapor.deger}</b> adresinin kaydını resmî kaynaktan doğrula — kayıtlı değilse büyük risk.
          </p>
          <a
            href="https://etbis.ticaret.gov.tr/tr/SiteSorgulama"
            target="_blank"
            rel="noopener noreferrer"
            className="press mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-primary py-2.5 text-sm font-semibold text-primary"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>open_in_new</span>
            ETBİS&apos;te resmî kaydını sorgula
          </a>
        </div>
      )}

      {/* PDF + not */}
      <div className="mt-4">
        <button
          onClick={pdfIndir}
          disabled={pdfYukleniyor}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-on-primary shadow-glow disabled:opacity-60"
          style={{ background: "var(--gradient-primary)" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            {pdfYukleniyor ? "progress_activity" : "picture_as_pdf"}
          </span>
          {pdfYukleniyor ? "Rapor hazırlanıyor…" : "Profesyonel OSINT raporunu PDF indir"}
        </button>
        <p className="mt-3 text-center text-[11px] text-on-surface-variant">
          {rapor.analiz?.ai
            ? "Değerlendirme yapay zeka ile açık kaynak verilerden üretildi."
            : "Açık kaynak verilerden üretildi. Kesin hüküm değildir."}
        </p>
      </div>
    </div>
  );
}
