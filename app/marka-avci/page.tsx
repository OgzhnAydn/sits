"use client";

import { useEffect, useState } from "react";

type Aday = {
  domain: string;
  marka: string;
  markaAdi: string;
  skor: number;
  seviye: "Yüksek" | "Orta" | "Düşük";
  sinyaller: string[];
  kaynak: string;
  zaman: number;
  durum?: "aktif-tuzak" | "park" | "yayinda-degil" | "canli";
  kampanya?: { domainSayisi: number; ipler: string[]; asnler: string[]; iletisimKanallari: string[]; exfilVar: boolean; ozet: string };
};

const DURUM_ROZET: Record<string, { etiket: string; sinif: string; ikon: string }> = {
  "aktif-tuzak": { etiket: "AKTİF", sinif: "bg-error/15 text-error", ikon: "gpp_bad" },
  "park": { etiket: "Park · izleme", sinif: "bg-primary/12 text-primary", ikon: "inventory_2" },
  "yayinda-degil": { etiket: "Yayında değil", sinif: "bg-on-surface-variant/12 text-on-surface-variant", ikon: "cloud_off" },
  "canli": { etiket: "Canlı", sinif: "bg-secondary/12 text-secondary", ikon: "public" },
};

const RENK: Record<string, { kart: string; renk: string; ikon: string }> = {
  "Yüksek": { kart: "bg-error-container", renk: "text-error", ikon: "gpp_bad" },
  "Orta": { kart: "bg-primary-container/30", renk: "text-primary", ikon: "gpp_maybe" },
  "Düşük": { kart: "bg-secondary-container", renk: "text-secondary", ikon: "info" },
};

function zamanMetni(ms: number): string {
  const fark = Date.now() - ms;
  const dk = Math.floor(fark / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dk önce`;
  const s = Math.floor(dk / 60);
  if (s < 24) return `${s} saat önce`;
  return `${Math.floor(s / 24)} gün önce`;
}

export default function MarkaAvci() {
  const [adaylar, setAdaylar] = useState<Aday[] | null>(null);

  useEffect(() => {
    fetch("/api/marka-adaylari")
      .then((r) => r.json())
      .then((d) => setAdaylar(Array.isArray(d.adaylar) ? d.adaylar : []))
      .catch(() => setAdaylar([]));
  }, []);

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Marka Taklit Avcısı</h1>
          <p className="text-[13px] text-on-surface-variant">urlscan taramasında yakalanan olası sahte siteler — inceleme kuyruğu.</p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-1.5 rounded-2xl bg-primary/8 p-3 text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>info</span>
        <span>Bunlar <b>aday</b>; kesin sahte değil. Marka adını taşıyan, resmî olmayan domainler. İncelemeden &quot;sahte&quot; ilan etme.</span>
      </div>

      {adaylar === null && (
        <div className="mt-6 flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 18 }}>progress_activity</span>
          Yükleniyor…
        </div>
      )}

      {adaylar?.length === 0 && (
        <div className="mt-8 rounded-2xl bg-surface-lowest p-6 text-center text-sm text-on-surface-variant">
          Henüz aday yok. Tarama çalıştığında marka adını taşıyan resmî-olmayan domainler burada listelenir.
        </div>
      )}

      {adaylar && adaylar.length > 0 && (
        <div className="mt-5 space-y-3">
          {adaylar.map((a) => {
            const renk = RENK[a.seviye] || RENK["Düşük"];
            return (
              <div key={a.domain} className={`rounded-3xl p-4 ${renk.kart}`}>
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined ${renk.renk}`} style={{ fontSize: 28 }}>{renk.ikon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[15px] font-bold text-on-surface">{a.domain}</div>
                    <div className="text-[12px] text-on-surface-variant">
                      <b>{a.markaAdi}</b> taklidi olabilir · {zamanMetni(a.zaman)} tarandı
                    </div>
                    {a.durum && DURUM_ROZET[a.durum] && (
                      <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${DURUM_ROZET[a.durum].sinif}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{DURUM_ROZET[a.durum].ikon}</span>
                        {DURUM_ROZET[a.durum].etiket}
                      </span>
                    )}
                    {a.kampanya && a.kampanya.domainSayisi > 1 && (
                      <span className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-bold text-error">
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>hub</span>
                        {a.kampanya.domainSayisi} domainli operasyon
                      </span>
                    )}
                  </div>
                  <div className={`text-right ${renk.renk}`}>
                    <div className="font-display text-xl font-bold">%{a.skor}</div>
                    <div className="text-[10px] font-semibold uppercase">{a.seviye}</div>
                  </div>
                </div>

                {a.sinyaller?.some((s) => /favicon/i.test(s)) && (
                  <div className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-error/15 px-2.5 py-1 text-[11px] font-bold text-error">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified</span>
                    Favicon birebir kopya — neredeyse kesin taklit
                  </div>
                )}

                {a.sinyaller?.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-outline-variant/20 pt-3">
                    {a.sinyaller.slice(0, 4).map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[12px] text-on-surface">
                        <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-on-surface-variant" />
                        {s}
                      </li>
                    ))}
                  </ul>
                )}

                {a.kampanya && a.kampanya.domainSayisi > 1 && (
                  <div className="mt-3 rounded-2xl border border-error/20 bg-error/5 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-error">
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>hub</span>
                      Operasyon Haritası — {a.kampanya.domainSayisi} kardeş domain
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-on-surface-variant">
                      {a.kampanya.ipler.length > 0 && <div>Ortak IP: <b className="text-on-surface">{a.kampanya.ipler.join(", ")}</b></div>}
                      {a.kampanya.asnler.length > 0 && <div>ASN: <b className="text-on-surface">{a.kampanya.asnler.join(", ")}</b></div>}
                      {a.kampanya.iletisimKanallari.length > 0 && <div className="col-span-2">Dolandırıcı kanalı: <b className="text-error">{a.kampanya.iletisimKanallari.join(", ")}</b></div>}
                      {a.kampanya.exfilVar && <div className="col-span-2 font-semibold text-error">⚠ Toplanan veri dış adrese gönderiliyor</div>}
                    </div>
                  </div>
                )}

                <a
                  href={`/sorgula?q=${encodeURIComponent(a.domain)}`}
                  className="press mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-outline-variant/50 bg-surface-lowest py-2 text-[13px] font-semibold text-on-surface"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>travel_explore</span>
                  Tam raporu incele
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
