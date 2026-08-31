"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type AkisSatir = { id: number; ts: string; kisa: string; domain: string; ca: string; marka: string | null };
type LogDurum = { kisa: string; ad: string; op: string; toplam: number; cekildi: number; onFiltre: number; eslesme: number };
type Tespit = { domain: string; markaAdi: string; skor: number; seviye: string; durum?: string; zaman: number };

function saat(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0").slice(0, 2);
}
function kisaZaman(ms: number): string {
  const dk = Math.floor((Date.now() - ms) / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk}dk`;
  const s = Math.floor(dk / 60);
  return s < 24 ? `${s}sa` : `${Math.floor(s / 24)}g`;
}

const DURUM_RENK: Record<string, string> = {
  "aktif-tuzak": "text-[#ff5c6c]",
  "park": "text-[#ffb454]",
  "yayinda-degil": "text-[#5b7695]",
  "canli": "text-[#3ee08a]",
};
const DURUM_ET: Record<string, string> = { "aktif-tuzak": "AKTİF", "park": "PARK", "yayinda-degil": "PASİF", "canli": "CANLI" };

export default function CanliPanel() {
  const [akis, setAkis] = useState<AkisSatir[]>([]);
  const [loglar, setLoglar] = useState<Record<string, LogDurum>>({});
  const [tespitler, setTespitler] = useState<Tespit[]>([]);
  const [toplam, setToplam] = useState<number | null>(null);
  const [bagli, setBagli] = useState(false);
  const [sayac, setSayac] = useState({ akan: 0, eslesme: 0 });
  const gorulen = useRef<Set<number>>(new Set());
  const kutu = useRef<HTMLDivElement>(null);

  // CT akışı + log aşamaları
  useEffect(() => {
    let durdu = false;
    async function cek() {
      try {
        const j = await (await fetch("/api/ct-akis", { cache: "no-store" })).json();
        if (durdu) return;
        setBagli(Boolean(j.ok));
        if (j.toplam) setToplam(j.toplam);
        // log aşamaları — çekildi/önfiltre/eşleşme biriktir, toplam güncelle
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
          yeni.push({ id: a.i, ts: saat(), kisa: a.kisa, domain: a.domain, ca: a.ca, marka: a.marka });
        }
        if (gorulen.current.size > 4000) gorulen.current = new Set([...gorulen.current].slice(-1000));
        if (yeni.length) {
          setAkis((p) => [...p, ...yeni].slice(-80));
          setSayac((s) => ({ akan: s.akan + yeni.length, eslesme: s.eslesme + yeni.filter((x) => x.marka).length }));
        }
      } catch { if (!durdu) setBagli(false); }
    }
    cek();
    const t = setInterval(cek, 2500);
    return () => { durdu = true; clearInterval(t); };
  }, []);

  // Tespit edilenler (kuyruk)
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

  useEffect(() => { kutu.current?.scrollTo({ top: kutu.current.scrollHeight }); }, [akis]);

  const logDizi = Object.values(loglar);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#060b14] font-mono text-[#cfe0f5]">
      {/* ÜST ŞERİT */}
      <div className="flex items-center justify-between border-b border-[#13233c] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#3ba1ff]" style={{ fontSize: 22 }}>radar</span>
          <div>
            <div className="text-[13px] font-bold tracking-wide text-white">BİZ ONLARI GÖRÜYORUZ</div>
            <div className="text-[10px] text-[#5b7695]">Onlar bizi göremez · markanıza yönelik her sahteyi yayınlandığı an yakalıyoruz</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <div className="text-[15px] font-bold tabular-nums text-white">{toplam ? (toplam / 1e9).toFixed(2) + " Mr" : "—"}</div>
            <div className="text-[9px] text-[#5b7695]">izlenen sertifika</div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${bagli ? "bg-[#0e2f1e] text-[#3ee08a]" : "bg-[#2f1414] text-[#e06a6a]"}`}>
            <span className={`h-2 w-2 rounded-full ${bagli ? "animate-pulse bg-[#3ee08a]" : "bg-[#e06a6a]"}`} />
            {bagli ? "CANLI" : "bağlanıyor"}
          </span>
          <Link href="/servisler" className="press rounded-full border border-[#1e3252] p-1.5 text-[#8fb0d4] hover:bg-[#0f1b2e]">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </Link>
        </div>
      </div>

      {/* 3 KOLON */}
      <div className="grid flex-1 grid-cols-1 gap-px overflow-hidden bg-[#0e1a2b] lg:grid-cols-[1fr_1.15fr_1fr]">

        {/* SOL — VERİ AKIŞI */}
        <section className="flex min-h-0 flex-col bg-[#060b14]">
          <div className="flex items-center justify-between border-b border-[#13233c] px-3.5 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#8fb0d4]"><span className="material-symbols-outlined text-[#3ba1ff]" style={{ fontSize: 15 }}>lan</span>Veri Akışı</span>
            <span className="text-[10px] text-[#5b7695] tabular-nums">{sayac.akan} akan</span>
          </div>
          <div ref={kutu} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed">
            {akis.length === 0 && <div className="flex h-full items-center justify-center gap-2 text-[#5b7695]"><span className="material-symbols-outlined animate-spin" style={{ fontSize: 15 }}>progress_activity</span>bağlanılıyor…</div>}
            {akis.map((s) => (
              <div key={s.id} className={`flex flex-wrap items-baseline gap-x-1.5 py-[2px] ${s.marka ? "rounded bg-[#2a0f14] px-1" : ""}`}>
                <span className="text-[#3f5a7d] tabular-nums">{s.ts}</span>
                <span className={s.marka ? "font-bold text-[#ff5c6c]" : "text-[#3ee08a]"}>[CT]</span>
                <span className={`break-all ${s.marka ? "font-semibold text-[#ff8a95]" : "text-[#d3e2f5]"}`}>{s.domain}</span>
                {s.marka && <span className="ml-auto rounded-full bg-[#ff5c6c]/15 px-1.5 text-[9px] font-bold text-[#ff8a95]">{s.marka}</span>}
              </div>
            ))}
          </div>
        </section>

        {/* ORTA — TESPİT AŞAMALARI (her log) */}
        <section className="flex min-h-0 flex-col bg-[#060b14]">
          <div className="flex items-center justify-between border-b border-[#13233c] px-3.5 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#8fb0d4]"><span className="material-symbols-outlined text-[#3ba1ff]" style={{ fontSize: 15 }}>account_tree</span>Tespit Aşamaları · {logDizi.length} log</span>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {logDizi.length === 0 && <div className="pt-8 text-center text-[11px] text-[#5b7695]">loglar yükleniyor…</div>}
            {logDizi.map((l) => {
              const of = l.cekildi ? Math.max(4, (l.onFiltre / l.cekildi) * 100) : 0;
              const es = l.cekildi ? Math.max(l.eslesme ? 4 : 0, (l.eslesme / l.cekildi) * 100) : 0;
              return (
                <div key={l.kisa} className="rounded-xl border border-[#13233c] bg-[#0a1220] p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#d3e2f5]">
                      <span className={`h-1.5 w-1.5 rounded-full ${l.cekildi ? "animate-pulse bg-[#3ee08a]" : "bg-[#3f5a7d]"}`} />
                      {l.kisa}
                    </span>
                    <span className="text-[10px] text-[#5b7695] tabular-nums">{(l.toplam / 1e9).toFixed(2)} Mr kayıt</span>
                  </div>
                  {/* 3 aşamalı huni */}
                  <div className="flex items-stretch gap-1.5 text-center text-[9px]">
                    <div className="flex-1 rounded-md bg-[#0e2036] py-1.5">
                      <div className="text-[13px] font-bold text-[#3ba1ff] tabular-nums">{l.cekildi}</div>
                      <div className="text-[#5b7695]">çekildi</div>
                    </div>
                    <span className="self-center text-[#3f5a7d]">›</span>
                    <div className="flex-1 rounded-md bg-[#12261e] py-1.5">
                      <div className="text-[13px] font-bold text-[#ffb454] tabular-nums">{l.onFiltre}</div>
                      <div className="text-[#5b7695]">ön-filtre</div>
                    </div>
                    <span className="self-center text-[#3f5a7d]">›</span>
                    <div className={`flex-1 rounded-md py-1.5 ${l.eslesme ? "bg-[#2a0f14]" : "bg-[#0f1622]"}`}>
                      <div className={`text-[13px] font-bold tabular-nums ${l.eslesme ? "text-[#ff5c6c]" : "text-[#3f5a7d]"}`}>{l.eslesme}</div>
                      <div className="text-[#5b7695]">tespit</div>
                    </div>
                  </div>
                  {/* huni çubuğu */}
                  <div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-[#0e1a2b]">
                    <div className="bg-[#3ba1ff]" style={{ width: "100%", opacity: l.cekildi ? 0.5 : 0.15 }} />
                    <div className="bg-[#ffb454]" style={{ width: `${of}%` }} />
                    <div className="bg-[#ff5c6c]" style={{ width: `${es}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SAĞ — TESPİT EDİLENLER */}
        <section className="flex min-h-0 flex-col bg-[#060b14]">
          <div className="flex items-center justify-between border-b border-[#13233c] px-3.5 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#8fb0d4]"><span className="material-symbols-outlined text-[#ff5c6c]" style={{ fontSize: 15 }}>gpp_bad</span>Tespit Edilenler</span>
            <span className="text-[10px] text-[#5b7695] tabular-nums">{tespitler.length}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
            {tespitler.length === 0 && <div className="pt-8 text-center text-[11px] text-[#5b7695]">henüz tespit yok</div>}
            {tespitler.map((t, i) => (
              <a key={t.domain + i} href={`/sorgula?q=${encodeURIComponent(t.domain)}`} target="_blank" rel="noreferrer"
                className="press block rounded-xl border border-[#13233c] bg-[#0a1220] p-2.5 hover:border-[#1e3252]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold text-[#ff8a95]">{t.domain}</span>
                  <span className="shrink-0 text-[12px] font-bold text-[#ff5c6c] tabular-nums">%{t.skor}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                  <span className="text-[#8fb0d4]">{t.markaAdi} taklidi</span>
                  {t.durum && <span className={`font-bold ${DURUM_RENK[t.durum] || "text-[#5b7695]"}`}>· {DURUM_ET[t.durum] || t.durum}</span>}
                  <span className="ml-auto text-[#5b7695]">{kisaZaman(t.zaman)}</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
