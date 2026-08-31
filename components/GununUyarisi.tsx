"use client";

import { useEffect, useState, useCallback } from "react";
import { UYARILAR, type Uyari } from "@/lib/uyarilar";

export default function GununUyarisi() {
  const [uyari, setUyari] = useState<(Uyari & { ai?: boolean }) | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [seed, setSeed] = useState(0);

  const getir = useCallback(async (s: number) => {
    setYukleniyor(true);
    try {
      const r = await fetch(`/api/gunun-uyarisi?s=${s}`);
      const d = await r.json();
      setUyari(d);
    } catch {
      setUyari({ ...UYARILAR[s % UYARILAR.length], ai: false });
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    getir(0);
  }, [getir]);

  function sonraki() {
    const n = seed + 1;
    setSeed(n);
    getir(n);
  }

  if (!uyari) return null;

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>
          campaign
        </span>
        <h3 className="font-display text-lg font-medium text-on-surface">Günün Uyarısı</h3>
        {uyari.ai && (
          <span className="ml-auto rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-semibold text-on-secondary-container">
            AI
          </span>
        )}
      </div>

      <div className="flex items-start gap-3">
        <div className="animate-float h-20 w-20 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="SİTS maskotu" className="h-full w-full object-contain" />
        </div>

        <div className="relative flex-1 rounded-2xl rounded-tl-sm bg-primary-container/15 p-3">
          <span className="absolute -left-1.5 top-3 h-3 w-3 rotate-45 bg-primary-container/15" />
          <span className="inline-block rounded-full bg-secondary-container px-2 py-0.5 text-[11px] font-semibold text-on-secondary-container">
            {uyari.etiket}
          </span>
          <p className="mt-1.5 text-sm font-semibold text-on-surface">{uyari.baslik}</p>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">{uyari.metin}</p>
        </div>
      </div>

      <button
        onClick={sonraki}
        disabled={yukleniyor}
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-full border border-outline-variant/50 py-2 text-[13px] font-semibold text-primary transition hover:bg-surface-low disabled:opacity-50"
      >
        {yukleniyor ? "Hazırlanıyor..." : "Başka bir ipucu"}
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
      </button>
    </div>
  );
}
