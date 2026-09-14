"use client";

import { useEffect, useRef, useState } from "react";

type Yakalanan = { domain: string; ca: string; zaman: number; guven: number; isaretler: string[]; tld: string; trHedefli: boolean; usomda: boolean | null; engelli: boolean | null };

function zamanMetni(ms: number): string {
  const dk = Math.floor((Date.now() - ms) / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dk önce`;
  const s = Math.floor(dk / 60);
  return s < 24 ? `${s} saat önce` : `${Math.floor(s / 24)} gün önce`;
}
function renk(g: number) {
  if (g >= 85) return { kart: "bg-error-container", renk: "text-error", ikon: "gpp_bad", et: "Bilinen marka" };
  if (g >= 70) return { kart: "bg-primary-container/30", renk: "text-primary", ikon: "casino", et: "Bahis imzalı" };
  return { kart: "bg-secondary-container", renk: "text-secondary", ikon: "help", et: "Şüpheli" };
}

export default function BahisRadar() {
  const [liste, setListe] = useState<Yakalanan[] | null>(null);
  const [toplam, setToplam] = useState(0);
  const [tarandi, setTarandi] = useState(0);
  const [bizOnce, setBizOnce] = useState(0);
  const durdu = useRef(false);

  useEffect(() => {
    durdu.current = false;
    async function cek() {
      try {
        const d = await (await fetch("/api/bahis", { cache: "no-store" })).json();
        if (durdu.current) return;
        setListe(Array.isArray(d.liste) ? d.liste : []);
        setToplam(d.toplam || 0);
        setBizOnce(d.bizOnce || 0);
        setTarandi((t) => t + (d.tarandi || 0));
      } catch { if (!durdu.current) setListe((l) => l ?? []); }
    }
    cek();
    const t = setInterval(cek, 5000);
    return () => { durdu.current = true; clearInterval(t); };
  }, []);

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Yasa Dışı Bahis Radarı</h1>
          <p className="text-[13px] text-on-surface-variant">Sertifika akışından, yeni bahis sitelerini doğdukları an yakalar.</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl bg-error/8 p-3">
          <div className="font-display text-2xl font-bold text-error">{toplam}</div>
          <div className="text-[11px] text-on-surface-variant">yakalanan</div>
        </div>
        <div className="rounded-2xl bg-tertiary/10 p-3" style={{ background: "rgba(16,163,74,.10)" }}>
          <div className="font-display text-2xl font-bold" style={{ color: "#12a150" }}>{bizOnce}</div>
          <div className="text-[11px] text-on-surface-variant">USOM&apos;da yok · biz-önce</div>
        </div>
        <div className="rounded-2xl bg-primary/8 p-3">
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 16 }}>radar</span>
            <span className="font-display text-xl font-bold text-primary">{tarandi.toLocaleString("tr-TR")}</span>
          </div>
          <div className="text-[11px] text-on-surface-variant">taranan sertifika</div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-1.5 rounded-2xl bg-primary/8 p-3 text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>info</span>
        <span>Sertifika akışından <b>kendimiz</b> yakalarız; her birini USOM siciline sorarız. <b style={{ color: "#12a150" }}>USOM&apos;da olmayan = biz-önce</b> → USOM&apos;a bildirilecek. &quot;Hepsi&quot; değil, akıştan yakalanan; imza ön-filtredir.</span>
      </div>

      {liste === null && (
        <div className="mt-6 flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 18 }}>progress_activity</span>
          Akış taranıyor…
        </div>
      )}
      {liste?.length === 0 && (
        <div className="mt-8 rounded-2xl bg-surface-lowest p-6 text-center text-sm text-on-surface-variant">
          Henüz yakalanan yok. Radar akışı taradıkça bahis siteleri burada belirir (birkaç saniye).
        </div>
      )}

      {liste && liste.length > 0 && (
        <div className="mt-5 space-y-3">
          {liste.map((y) => {
            const r = renk(y.guven);
            return (
              <div key={y.domain} className={`rounded-3xl p-4 ${r.kart}`}>
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined ${r.renk}`} style={{ fontSize: 28 }}>{r.ikon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[15px] font-bold text-on-surface">{y.domain}</div>
                    <div className="text-[12px] text-on-surface-variant">{r.et} · {zamanMetni(y.zaman)} yakalandı{y.ca ? ` · ${y.ca}` : ""}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {y.engelli === true && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-on-surface-variant/15 px-2 py-0.5 text-[10px] font-bold uppercase text-on-surface-variant">
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>block</span>zaten engelli · BTK
                        </span>
                      )}
                      {y.usomda === false && y.engelli !== true && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: "rgba(18,161,80,.14)", color: "#12a150" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>bolt</span>biz-önce · USOM&apos;da yok
                        </span>
                      )}
                      {y.usomda === true && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-on-surface-variant/12 px-2 py-0.5 text-[10px] font-bold uppercase text-on-surface-variant">
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>verified</span>USOM&apos;da kayıtlı
                        </span>
                      )}
                      {y.usomda === null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-on-surface-variant/8 px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">USOM sorgulanıyor…</span>
                      )}
                      {y.trHedefli && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-error/12 px-2 py-0.5 text-[10px] font-bold uppercase text-error">🇹🇷 Türkiye hedefli</span>
                      )}
                    </div>
                  </div>
                  <div className={`text-right ${r.renk}`}>
                    <div className="font-display text-xl font-bold">%{y.guven}</div>
                    <div className="text-[10px] font-semibold uppercase">imza</div>
                  </div>
                </div>
                {y.isaretler?.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-outline-variant/20 pt-3">
                    {y.isaretler.slice(0, 4).map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[12px] text-on-surface">
                        <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-on-surface-variant" />{s}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  {y.usomda === false && y.engelli !== true && (
                    <button
                      onClick={() => { try { navigator.clipboard?.writeText(y.domain); } catch { /* pano yok */ } window.open("https://www.usom.gov.tr/bildirim", "_blank", "noopener,noreferrer"); }}
                      className="press flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-bold text-white"
                      style={{ background: "#12a150" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>flag</span>
                      USOM&apos;a Bildir
                    </button>
                  )}
                  <a href={`/sorgula?q=${encodeURIComponent(y.domain)}`}
                    className="press flex flex-1 items-center justify-center gap-1.5 rounded-full border border-outline-variant/50 bg-surface-lowest py-2 text-[13px] font-semibold text-on-surface">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>travel_explore</span>
                    İncele
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
