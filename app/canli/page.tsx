"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePanoTema } from "@/lib/panoTema";

type AkisSatir = { id: number; ts: string; kisa: string; domain: string; ca: string; marka: string | null };
type LogDurum = { kisa: string; ad: string; op: string; toplam: number; cekildi: number; onFiltre: number; eslesme: number; canli: boolean };
type Tespit = { domain: string; markaAdi: string; skor: number; seviye: string; durum?: string; zaman: number };

function saat(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}
function kisaZaman(ms: number): string {
  const dk = Math.floor((Date.now() - ms) / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk}dk`;
  const s = Math.floor(dk / 60);
  return s < 24 ? `${s}sa` : `${Math.floor(s / 24)}g`;
}
const mr = (n: number) => (n / 1e9).toFixed(2);
const MONO = { fontFamily: "'IBM Plex Mono',ui-monospace,monospace" } as const;
// İnce, soluk kaydırma çubuğu — "çok belli" olmasın.
const SCROLL = "[scrollbar-width:thin] [scrollbar-color:var(--c-152337)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--c-152337)] hover:[&::-webkit-scrollbar-thumb]:bg-[var(--c-1e3252)]";

// Tehdit rengi — TEK anlam: kırmızı=tehlike şiddeti, sadece skora göre.
function skorRenk(s: number): string {
  if (s >= 60) return "var(--c-ff5468)";
  if (s >= 45) return "var(--c-ff9f45)";
  return "var(--c-ffcf5c)";
}
const DURUM_ET: Record<string, { ad: string; renk: string }> = {
  "aktif-tuzak": { ad: "aktif tuzak", renk: "var(--c-ff5468)" },
  "canli": { ad: "canlı", renk: "var(--c-3ee08a)" },
  "park": { ad: "park", renk: "var(--c-8fb0d4)" },
  "yayinda-degil": { ad: "pasif", renk: "var(--c-5b7695)" },
};

export default function CanliPanel() {
  const router = useRouter();
  const { tema, koyu, degistir } = usePanoTema();
  const [akis, setAkis] = useState<AkisSatir[]>([]);
  const [loglar, setLoglar] = useState<Record<string, LogDurum>>({});
  const [tespitler, setTespitler] = useState<Tespit[]>([]);
  const [toplam, setToplam] = useState<number | null>(null);
  const [bagli, setBagli] = useState<boolean | null>(null);
  const [sayac, setSayac] = useState({ akan: 0, eslesme: 0 });
  const [altta, setAltta] = useState(true);
  // Mobilde 3 kolon tek ekrana sığmaz + sol akış sonsuz kaydığından alt bölümlere
  // ulaşılamıyordu → mobilde sekme (masaüstünde 3 kolon aynen). "en iyi UX" gereği.
  const [sekme, setSekme] = useState<"akis" | "loglar" | "tespit">("akis");
  const gorulen = useRef<Set<number>>(new Set());
  const kutu = useRef<HTMLDivElement>(null);
  const basT = useRef<number>(Date.now());

  // CT akışı + log aşamaları
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
            const o = n[l.kisa] || { kisa: l.kisa, ad: l.ad, op: l.op, toplam: 0, cekildi: 0, onFiltre: 0, eslesme: 0, canli: false };
            n[l.kisa] = { ...o, ad: l.ad, op: l.op, toplam: l.toplam || o.toplam, cekildi: o.cekildi + l.cekildi, onFiltre: o.onFiltre + l.onFiltre, eslesme: o.eslesme + l.eslesme, canli: l.cekildi > 0 };
          }
          return n;
        });
        const yeni: AkisSatir[] = [];
        for (const a of j.akis || []) {
          if (gorulen.current.has(a.i)) continue;
          gorulen.current.add(a.i);
          yeni.push({ id: a.i, ts: saat(), kisa: a.kisa, domain: a.domain, ca: a.ca, marka: a.marka });
        }
        if (gorulen.current.size > 4000) gorulen.current = new Set([...gorulen.current].slice(-1000));
        if (yeni.length) {
          setAkis((p) => [...p, ...yeni].slice(-60));
          setSayac((s) => ({ akan: s.akan + yeni.length, eslesme: s.eslesme + yeni.filter((x) => x.marka).length }));
        }
      } catch { if (!durdu) setBagli(false); }
    }
    cek();
    const t = setInterval(cek, 2500);
    return () => { durdu = true; clearInterval(t); };
  }, []);

  // Tespit edilenler
  useEffect(() => {
    let durdu = false;
    async function cek() {
      try {
        const j = await (await fetch("/api/marka-adaylari", { cache: "no-store" })).json();
        if (!durdu && Array.isArray(j.adaylar)) setTespitler(j.adaylar.slice(0, 40));
      } catch { /* boş geç */ }
    }
    cek();
    const t = setInterval(cek, 12000);
    return () => { durdu = true; clearInterval(t); };
  }, []);

  // AKILLI kaydırma — yalnız kullanıcı zaten alttaysa takip et (yukarı okurken çekme).
  useEffect(() => {
    if (altta) kutu.current?.scrollTo({ top: kutu.current.scrollHeight });
  }, [akis, altta]);
  function onScroll() {
    const el = kutu.current; if (!el) return;
    setAltta(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  }

  const logDizi = useMemo(() => Object.values(loglar).sort((a, b) => b.toplam - a.toplam), [loglar]);
  const maxLog = Math.max(1, ...logDizi.map((l) => l.toplam));
  const canliLog = logDizi.filter((l) => l.canli).length;
  const gecenDk = Math.max(1, (Date.now() - basT.current) / 60000);
  const hiz = Math.round(sayac.akan / gecenDk);

  return (
    <div className="pano fixed inset-0 z-[80] flex flex-col bg-[var(--c-05090f)] text-[var(--c-e8f0fb)]" data-tema={tema} style={{ fontFamily: "'IBM Plex Sans',system-ui,sans-serif" }}>
      {/* ══ ÜST ŞERİT ══ */}
      <header className="flex items-center justify-between gap-4 border-b border-[var(--c-12213a)] bg-[var(--c-070d18)] px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--c-0d2540)] text-[var(--c-3ba1ff)] ring-1 ring-[var(--c-1a3a5c)]">
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>radar</span>
          </span>
          <div>
            <h1 className="text-[16px] font-bold leading-tight tracking-tight text-[var(--c-e6eef7)]">Biz onları görüyoruz</h1>
            <p className="text-[11px] leading-tight text-[var(--c-7d9cbf)]">Markanıza yönelik her sahte adresi, yayınlandığı an yakalıyoruz — onlar bizi göremez.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="hidden text-right sm:block">
            <div className="text-[20px] font-extrabold leading-none tabular-nums text-[var(--c-e6eef7)]">{toplam ? mr(toplam) : "—"}<span className="ml-1 text-[12px] font-semibold text-[var(--c-7d9cbf)]">milyar</span></div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--c-5b7695)]">izlenen sertifika</div>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider ${bagli === false ? "bg-[var(--c-33240f)] text-[var(--c-ffb454)]" : "bg-[var(--c-0e2f1e)] text-[var(--c-3ee08a)]"}`}>
            <span className={`relative flex h-2 w-2`}>
              {bagli !== false && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--c-3ee08a)] opacity-60" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${bagli === false ? "bg-[var(--c-ffb454)]" : "bg-[var(--c-3ee08a)]"}`} />
            </span>
            {bagli === false ? "yeniden bağlanıyor" : bagli === null ? "bağlanıyor" : "canlı"}
          </span>
          <button onClick={degistir} aria-label={koyu ? "Açık tema" : "Koyu tema"} title={koyu ? "Açık temaya geç" : "Koyu temaya geç"} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--c-1e3252)] text-[var(--c-8fb0d4)] transition hover:bg-[var(--c-0f1b2e)] hover:text-[var(--c-e8f0fb)]">
            <span className="material-symbols-outlined" style={{ fontSize: 19 }}>{koyu ? "light_mode" : "dark_mode"}</span>
          </button>
          <button onClick={() => router.back()} aria-label="Kapat" className="grid h-9 w-9 place-items-center rounded-full border border-[var(--c-1e3252)] text-[var(--c-8fb0d4)] transition hover:bg-[var(--c-0f1b2e)] hover:text-[var(--c-e8f0fb)]">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>
      </header>

      {/* ══ MOBİL SEKME ÇUBUĞU (masaüstünde gizli — orada 3 kolon yan yana) ══ */}
      <div className="flex shrink-0 border-b border-[var(--c-12213a)] bg-[var(--c-070d18)] lg:hidden">
        {([
          { k: "akis", ad: "Canlı akış", ikon: "sensors", renk: "var(--c-3ba1ff)", n: akis.length },
          { k: "loglar", ad: "CT logları", ikon: "lan", renk: "var(--c-3ba1ff)", n: logDizi.length },
          { k: "tespit", ad: "Tespitler", ikon: "gpp_bad", renk: "var(--c-ff5468)", n: tespitler.length },
        ] as const).map((s) => (
          <button
            key={s.k}
            onClick={() => setSekme(s.k)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-[11px] font-bold uppercase tracking-wide transition ${sekme === s.k ? "border-[var(--c-3ba1ff)] text-[var(--c-e6eef7)]" : "border-transparent text-[var(--c-5b7695)]"}`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: sekme === s.k ? s.renk : undefined }}>{s.ikon}</span>
            <span className="truncate">{s.ad}</span>
            <span className="shrink-0 rounded-full bg-[var(--c-0d1a2c)] px-1.5 py-px text-[9px] font-bold tabular-nums text-[var(--c-7d9cbf)]">{s.n}</span>
          </button>
        ))}
      </div>

      {/* ══ 3 KOLON (masaüstü) / TEK BÖLÜM (mobil) ══ */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-px overflow-hidden bg-[var(--c-0e1a2b)] lg:grid-rows-1 lg:grid-cols-[1fr_1.05fr_1.05fr]">

        {/* ── SOL: CANLI AKIŞ ── */}
        <section className={`${sekme === "akis" ? "flex" : "hidden"} min-h-0 flex-col bg-[var(--c-05090f)] lg:flex`}>
          <div className="flex items-center justify-between border-b border-[var(--c-12213a)] px-4 py-2.5">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--c-8fb0d4)]">
              <span className="material-symbols-outlined text-[var(--c-3ba1ff)]" style={{ fontSize: 16 }}>sensors</span>Canlı akış
            </span>
            <span className="rounded-full bg-[var(--c-0d1a2c)] px-2.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--c-7d9cbf)]">~{hiz}/dk örnekleniyor</span>
          </div>
          <div className="relative min-h-0 flex-1">
            <div ref={kutu} onScroll={onScroll} className={`absolute inset-0 space-y-1.5 overflow-y-auto p-3 pb-4 ${SCROLL}`}>
              {akis.length === 0 && (
                <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[var(--c-5b7695)]">
                  <span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>progress_activity</span>canlı akışa bağlanılıyor…
                </div>
              )}
              {akis.map((s) => (
                s.marka ? (
                  <div key={s.id} className="relative overflow-hidden rounded-xl border border-[var(--c-4a1622)] bg-gradient-to-r from-[var(--c-2a0d13)] to-[var(--c-160a0e)] p-2.5">
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-[var(--c-ff5468)]" />
                    <div className="flex items-center gap-2 pl-1.5">
                      <span className="material-symbols-outlined text-[var(--c-ff5468)]" style={{ fontSize: 16 }}>gpp_maybe</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--c-ff9aa4)]" style={MONO}>{s.domain}</span>
                      <span className="shrink-0 rounded-full bg-[var(--c-ff5468)]/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--c-ff9aa4)]">{s.marka}</span>
                    </div>
                  </div>
                ) : (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-[var(--c-0e1a2b)] bg-[var(--c-070e1a)] px-2.5 py-1.5">
                    <span className="shrink-0 rounded bg-[var(--c-0d1a2c)] px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-[var(--c-4d7aa8)]" style={MONO}>{s.kisa}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--c-8399b5)]" style={MONO}>{s.domain}</span>
                    <span className="shrink-0 text-[9px] tabular-nums text-[var(--c-3f5a7d)]" style={MONO}>{s.ts}</span>
                  </div>
                )
              ))}
            </div>
            {!altta && (
              <button onClick={() => setAltta(true)} className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--c-123a5e)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--c-cfe4fb)] shadow-lg ring-1 ring-[var(--c-1e5285)] transition hover:bg-[var(--c-164a76)]">
                canlıya dön ↓
              </button>
            )}
          </div>
        </section>

        {/* ── ORTA: İZLENEN LOGLAR (canlı kapsama) ── */}
        <section className={`${sekme === "loglar" ? "flex" : "hidden"} min-h-0 flex-col bg-[var(--c-05090f)] lg:flex`}>
          <div className="flex items-center justify-between border-b border-[var(--c-12213a)] px-4 py-2.5">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--c-8fb0d4)]">
              <span className="material-symbols-outlined text-[var(--c-3ba1ff)]" style={{ fontSize: 16 }}>lan</span>İzlenen CT logları
            </span>
            <span className="text-[10px] font-medium text-[var(--c-5b7695)]">{canliLog}/{logDizi.length} canlı örnekleniyor</span>
          </div>
          <div className={`min-h-0 flex-1 overflow-y-auto p-4 pb-4 ${SCROLL}`}>
            {/* Kapsama özeti */}
            <div className="mb-4 rounded-2xl border border-[var(--c-12213a)] bg-gradient-to-b from-[var(--c-0a1424)] to-[var(--c-070e1a)] p-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--c-5b7695)]">Kesintisiz izlenen sertifika</div>
                  <div className="text-[30px] font-extrabold leading-tight tabular-nums text-[var(--c-e6eef7)]">{toplam ? mr(toplam) : "—"}<span className="ml-1.5 text-[14px] font-semibold text-[var(--c-7d9cbf)]">milyar</span></div>
                </div>
                <div className="text-right">
                  <div className="text-[18px] font-bold tabular-nums text-[var(--c-3ba1ff)]">{logDizi.length}</div>
                  <div className="text-[10px] text-[var(--c-5b7695)]">küresel log</div>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-[var(--c-7d9cbf)]">Dünyanın sertifika defterlerini aynı anda izliyoruz. Yeni bir sertifika bu loglardan birine düştüğü an — çoğu zaman site yayına bile girmeden — görüyoruz.</p>
            </div>
            {/* Log satırları */}
            {logDizi.length === 0 && <div className="pt-8 text-center text-[11px] text-[var(--c-5b7695)]">loglar yükleniyor…</div>}
            <div className="space-y-2">
              {logDizi.map((l) => (
                <div key={l.kisa} className="rounded-xl border border-[var(--c-12213a)] bg-[var(--c-0a1220)] px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2 w-2 shrink-0">
                      {l.canli && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--c-3ee08a)] opacity-60" />}
                      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: l.canli ? "var(--c-3ee08a)" : "var(--c-33506f)" }} />
                    </span>
                    <span className="truncate text-[12px] font-semibold text-[var(--c-d3e2f5)]">{l.kisa}</span>
                    {l.op && <span className="truncate text-[10px] text-[var(--c-5b7695)]">{l.op}</span>}
                    <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums text-[var(--c-e6eef7)]">{mr(l.toplam)}<span className="ml-0.5 text-[9px] font-medium text-[var(--c-5b7695)]">Mr</span></span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--c-0e1a2b)]">
                    <div className="h-full rounded-full bg-gradient-to-r from-[var(--c-1e5c9a)] to-[var(--c-3ba1ff)] transition-all duration-500" style={{ width: `${Math.max(6, (l.toplam / maxLog) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SAĞ: TESPİT EDİLENLER ── */}
        <section className={`${sekme === "tespit" ? "flex" : "hidden"} min-h-0 flex-col bg-[var(--c-05090f)] lg:flex`}>
          <div className="flex items-center justify-between border-b border-[var(--c-12213a)] px-4 py-2.5">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--c-8fb0d4)]">
              <span className="material-symbols-outlined text-[var(--c-ff5468)]" style={{ fontSize: 16 }}>gpp_bad</span>Tespit edilenler
            </span>
            <span className="rounded-full bg-[var(--c-2a0f14)] px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--c-ff9aa4)]">{tespitler.length} sahte adres</span>
          </div>
          <div className={`min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pb-4 ${SCROLL}`}>
            {tespitler.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--c-5b7695)]">
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>shield</span>
                <span className="text-[11px]">tespit bekleniyor…</span>
              </div>
            )}
            {tespitler.map((t, i) => {
              const renk = skorRenk(t.skor);
              const d = t.durum ? DURUM_ET[t.durum] : null;
              return (
                <a key={t.domain + i} href={`/sorgula?q=${encodeURIComponent(t.domain)}`} target="_blank" rel="noreferrer"
                  className="group relative block overflow-hidden rounded-xl border border-[var(--c-12213a)] bg-[var(--c-0a1220)] p-3 transition hover:border-[var(--c-264366)] hover:bg-[var(--c-0c1728)]">
                  <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: renk }} />
                  <div className="flex items-center gap-2.5 pl-1.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold uppercase" style={{ background: `${renk}22`, color: renk }}>
                      {(t.markaAdi || t.domain).slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-semibold text-[var(--c-e8f0fb)]" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{t.domain}</div>
                      <div className="flex items-center gap-1.5 text-[10.5px]">
                        <span className="text-[var(--c-8fb0d4)]">{t.markaAdi} taklidi</span>
                        {d && <><span className="text-[var(--c-33506f)]">·</span><span className="font-semibold" style={{ color: d.renk }}>{d.ad}</span></>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[15px] font-extrabold leading-none tabular-nums" style={{ color: renk }}>%{t.skor}</div>
                      <div className="mt-0.5 text-[9px] text-[var(--c-5b7695)]">{kisaZaman(t.zaman)}</div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
