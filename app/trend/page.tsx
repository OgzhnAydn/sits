"use client";

import { useEffect, useState } from "react";

type Kampanya = {
  id: string;
  boyut: number;
  toplamBildiren: number;
  kategori: string;
  uyeler: { deger: string; tip: string; benzersiz: number }[];
};
type Ozet = {
  sayilar: { toplam: number; dogrulanan: number; site: number; iban: number; telefon: number; kategoriler: Record<string, number> };
  enCok: { deger: string; tip: string; kategori: string | null; benzersiz: number }[];
  kampanyalar: Kampanya[];
  ozet: string;
  maddeler: string[];
  ai: boolean;
};

const TIP_IKON: Record<string, string> = { url: "link", iban: "account_balance", telefon: "call" };

export default function Trend() {
  const [d, setD] = useState<Ozet | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    fetch("/api/trend", { method: "POST" })
      .then((r) => r.json())
      .then(setD)
      .catch(() => {})
      .finally(() => setYukleniyor(false));
  }, []);

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Güncel tuzaklar</h1>
          <p className="text-[13px] text-on-surface-variant">Toplulukta son bildirilen tuzakların özeti.</p>
        </div>
      </div>

      {yukleniyor && (
        <div className="surface mt-5 rounded-3xl p-5">
          <div className="skeleton h-4 w-1/2" />
          <div className="mt-3 space-y-2"><div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-4/6" /></div>
        </div>
      )}

      {d && (
        <div className="fade-up mt-5 space-y-4">
          {/* Sayılar */}
          <div className="grid grid-cols-2 gap-3">
            <div className="surface rounded-3xl p-4">
              <p className="font-display text-3xl font-extrabold text-on-surface">{d.sayilar.toplam}</p>
              <p className="mt-1 text-xs text-on-surface-variant">son gösterge</p>
            </div>
            <div className="surface rounded-3xl p-4">
              <p className="font-display text-3xl font-extrabold text-secondary">{d.sayilar.dogrulanan}</p>
              <p className="mt-1 text-xs text-on-surface-variant">doğrulanmış (çok kişi)</p>
            </div>
          </div>

          {/* Nazar özeti */}
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/casper-wave.webp" alt="Nazar" className="h-full w-full object-contain" />
            </div>
            <div className="flex-1 rounded-2xl rounded-tl-sm bg-primary-container/15 p-3.5 text-sm text-on-surface">
              <p className="font-semibold">{d.ozet}</p>
              {d.maddeler.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {d.maddeler.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-on-surface-variant">
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: 15 }}>arrow_right</span>
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Tip dağılımı */}
          <div className="surface rounded-3xl p-4">
            <p className="mb-2 text-xs font-semibold text-on-surface-variant">Tür dağılımı</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["Site", d.sayilar.site], ["IBAN", d.sayilar.iban], ["Telefon", d.sayilar.telefon]].map(([ad, n]) => (
                <div key={ad as string} className="rounded-2xl bg-surface-low p-3">
                  <p className="font-display text-xl font-extrabold text-primary">{n}</p>
                  <p className="text-[11px] text-on-surface-variant">{ad}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Aktif kampanyalar (birlikte-bildirim kümeleri) */}
          {d.kampanyalar && d.kampanyalar.length > 0 && (
            <div className="surface rounded-3xl p-4">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-on-surface">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>hub</span>
                Aktif kampanyalar
              </p>
              <p className="mb-3 text-[11px] text-on-surface-variant">Birlikte bildirilen göstergeler aynı organize dolandırıcılığa işaret eder.</p>
              <div className="space-y-3">
                {d.kampanyalar.map((k) => (
                  <div key={k.id} className="rounded-2xl bg-error/5 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-bold text-error">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
                        {k.kategori} kampanyası
                      </span>
                      <span className="text-[11px] font-semibold text-on-surface-variant">{k.boyut} gösterge · {k.toplamBildiren} bildiren</span>
                    </div>
                    <div className="space-y-1.5">
                      {k.uyeler.slice(0, 5).map((u, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-xl bg-surface-lowest px-2.5 py-1.5">
                          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 15 }}>
                            {u.tip === "iban" ? "account_balance" : u.tip === "telefon" ? "call" : "link"}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] text-on-surface">{u.deger}</span>
                          {u.benzersiz > 0 && <span className="shrink-0 text-[10px] font-semibold text-error">{u.benzersiz}×</span>}
                        </div>
                      ))}
                      {k.uyeler.length > 5 && <p className="pl-1 text-[11px] text-on-surface-variant">+{k.uyeler.length - 5} gösterge daha</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* En çok bildirilenler */}
          {d.enCok.length > 0 && (
            <div className="surface rounded-3xl p-4">
              <p className="mb-2 text-xs font-semibold text-on-surface-variant">En çok bildirilenler</p>
              <div className="space-y-2">
                {d.enCok.map((g, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-2xl bg-surface-low px-3 py-2.5">
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 18 }}>{TIP_IKON[g.tip] || "link"}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-on-surface">{g.deger}</span>
                    <span className="shrink-0 rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-semibold text-error">{g.benzersiz} kişi</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-[11px] text-on-surface-variant">
            {d.ai ? "Özet yapay zeka ile üretildi." : "Topluluk verisinden üretildi."}
          </p>
        </div>
      )}
    </div>
  );
}
