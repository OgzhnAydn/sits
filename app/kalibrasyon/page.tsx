"use client";

import { useState } from "react";

type Sonuc = {
  domain: string;
  beklenen: "temiz" | "kotu";
  not?: string;
  risk: number | null;
  seviye: "Yüksek" | "Orta" | "Düşük" | "erişilemedi";
  gecti: boolean;
  yanlisTip: "FP" | "FN" | null;
};
type Yanit = {
  sonuclar: Sonuc[];
  ozet: { toplam: number; gecen: number; fp: number; fn: number; erisilemeyen: number; skor: number };
};

const ADET = 4; // batch boyutu

function ozetCikar(sonuclar: Sonuc[]): Yanit["ozet"] {
  const degerlendirilen = sonuclar.filter((s) => s.risk !== null);
  const gecen = degerlendirilen.filter((s) => s.gecti).length;
  const fp = sonuclar.filter((s) => s.yanlisTip === "FP").length;
  const fn = sonuclar.filter((s) => s.yanlisTip === "FN").length;
  const erisilemeyen = sonuclar.filter((s) => s.risk === null).length;
  const skor = degerlendirilen.length ? Math.round((gecen / degerlendirilen.length) * 100) : 0;
  return { toplam: sonuclar.length, gecen, fp, fn, erisilemeyen, skor };
}

export default function Kalibrasyon() {
  const [yuk, setYuk] = useState(false);
  const [veri, setVeri] = useState<Yanit | null>(null);
  const [hata, setHata] = useState("");
  const [ilerleme, setIlerleme] = useState("");

  async function calistir() {
    if (yuk) return;
    setYuk(true); setHata(""); setVeri(null); setIlerleme("");
    const birikmis: Sonuc[] = [];
    try {
      let bas = 0;
      let toplam = Infinity;
      while (bas < toplam) {
        const r = await fetch(`/api/kalibrasyon?bas=${bas}&adet=${ADET}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.hata || "Çalışmadı.");
        toplam = j.toplam;
        birikmis.push(...j.sonuclar);
        bas += ADET;
        setIlerleme(`${Math.min(birikmis.length, toplam)}/${toplam}`);
      }
      setVeri({ sonuclar: birikmis, ozet: ozetCikar(birikmis) });
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Çalışmadı.");
    } finally {
      setYuk(false);
    }
  }

  return (
    <div className="px-5 pt-3 pb-10">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <span className="material-symbols-outlined" style={{ fontSize: 26 }}>fact_check</span>
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Kalibrasyon</h1>
          <p className="text-[13px] text-on-surface-variant">Motor bilinen temiz/kötü sitelerde doğru mu?</p>
        </div>
      </div>

      <p className="mt-4 text-[14px] leading-relaxed text-on-surface-variant">
        Bilinen <b>meşru</b> ve <b>tehlikeli</b> siteleri motora sokar; <b>meşru bir siteyi yanlışlıkla tehlikeli</b>
        {" "}gösterdi mi (yanlış-pozitif) ya da <b>tehlikeliyi kaçırdı mı</b> (yanlış-negatif) diye ölçer.
      </p>

      <button
        onClick={calistir}
        disabled={yuk}
        className="press mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-on-primary disabled:opacity-50"
      >
        {yuk ? "Çalışıyor… (~40 sn)" : "Kalibrasyonu çalıştır"}
      </button>

      {yuk && (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-3xl border border-outline-variant/30 bg-surface-lowest p-6">
          <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 30 }}>progress_activity</span>
          <p className="text-[13px] text-on-surface-variant">Siteleri tek tek motordan geçiriyorum… {ilerleme && <b>{ilerleme}</b>}</p>
        </div>
      )}

      {hata && !yuk && <div className="mt-4 rounded-2xl bg-error-container p-3.5 text-sm font-medium text-error">{hata}</div>}

      {veri && !yuk && (
        <div className="mt-6 space-y-4">
          {/* ÖZET */}
          <div className="grid grid-cols-3 gap-2">
            <div className={`rounded-2xl p-3 text-center ${veri.ozet.skor >= 90 ? "bg-secondary-container" : "bg-error-container"}`}>
              <p className={`font-display text-2xl font-semibold ${veri.ozet.skor >= 90 ? "text-on-surface" : "text-error"}`}>%{veri.ozet.skor}</p>
              <p className="mt-0.5 text-[11px] text-on-surface-variant">doğruluk</p>
            </div>
            <div className={`rounded-2xl p-3 text-center ${veri.ozet.fp > 0 ? "bg-error-container" : "border border-outline-variant/30 bg-surface-lowest"}`}>
              <p className={`font-display text-2xl font-semibold ${veri.ozet.fp > 0 ? "text-error" : "text-on-surface"}`}>{veri.ozet.fp}</p>
              <p className="mt-0.5 text-[11px] text-on-surface-variant">yanlış-pozitif</p>
            </div>
            <div className={`rounded-2xl p-3 text-center ${veri.ozet.fn > 0 ? "bg-error/10" : "border border-outline-variant/30 bg-surface-lowest"}`}>
              <p className="font-display text-2xl font-semibold text-on-surface">{veri.ozet.fn}</p>
              <p className="mt-0.5 text-[11px] text-on-surface-variant">yanlış-negatif</p>
            </div>
          </div>
          {veri.ozet.fp > 0 && (
            <p className="rounded-xl bg-error/10 px-3 py-2 text-[12.5px] font-semibold text-error">
              {veri.ozet.fp} meşru site yanlışlıkla tehlikeli gösterildi — aşağıda kırmızı satırlar. Düzeltilmeli.
            </p>
          )}
          {veri.ozet.erisilemeyen > 0 && (
            <p className="text-[12px] text-on-surface-variant">Not: {veri.ozet.erisilemeyen} site şu an erişilemedi (ölü/geçici) — değerlendirmeye katılmadı.</p>
          )}

          {/* TABLO */}
          <div className="space-y-1.5">
            {veri.sonuclar.map((s) => {
              const renk =
                s.yanlisTip === "FP" ? "border-error/50 bg-error/5"
                : s.yanlisTip === "FN" ? "border-error/30 bg-error/5"
                : s.seviye === "erişilemedi" ? "border-outline-variant/30 bg-surface-container"
                : "border-outline-variant/30 bg-surface-lowest";
              return (
                <div key={s.domain} className={`flex items-center gap-3 rounded-xl border p-2.5 ${renk}`}>
                  <span className={`material-symbols-outlined shrink-0 ${s.gecti ? "text-secondary" : s.seviye === "erişilemedi" ? "text-on-surface-variant" : "text-error"}`} style={{ fontSize: 20 }}>
                    {s.gecti ? "check_circle" : s.seviye === "erişilemedi" ? "help" : "cancel"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-on-surface">{s.domain}</p>
                    {s.not && <p className="truncate text-[11px] text-on-surface-variant">{s.not}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12px] font-bold text-on-surface">{s.risk === null ? "—" : `${s.risk}/100`}</p>
                    <p className="text-[10px] text-on-surface-variant">
                      beklenen: {s.beklenen === "temiz" ? "temiz" : "kötü"}
                      {s.yanlisTip && <span className="ml-1 font-bold text-error">{s.yanlisTip}</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="px-1 text-[11px] text-on-surface-variant">
            Eşik: risk &lt; 30 = temiz (Düşük). Çekirdek motor (domainOsint) test edilir; topluluk/seed sinyalleri hariç.
          </p>
        </div>
      )}
    </div>
  );
}
