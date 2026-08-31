"use client";

import { useEffect, useState } from "react";

type Kayit = {
  domain: string;
  risk: number;
  seviye: string;
  bulgular: string[];
  ekranGoruntusu?: string;
  baslik?: string;
  kaynak: string;
  zaman: number;
};

const RENK: Record<string, { kart: string; renk: string; ikon: string }> = {
  "Yüksek": { kart: "bg-error-container", renk: "text-error", ikon: "gpp_bad" },
  "Orta": { kart: "bg-primary-container/30", renk: "text-primary", ikon: "gpp_maybe" },
  "Düşük": { kart: "bg-secondary-container", renk: "text-secondary", ikon: "info" },
};

const KAYNAK_ETIKET: Record<string, string> = {
  "sorgu": "Sorgulama",
  "sahte-bul": "Sahte tarama",
  "marka-aday": "Marka avcısı",
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

export default function Kayitlar() {
  const [kayitlar, setKayitlar] = useState<Kayit[] | null>(null);
  const [filtre, setFiltre] = useState<"hepsi" | "Yüksek" | "Orta" | "Düşük">("hepsi");
  const [ara, setAra] = useState("");

  useEffect(() => {
    fetch("/api/analizler?n=300")
      .then((r) => r.json())
      .then((d) => setKayitlar(Array.isArray(d.kayitlar) ? d.kayitlar : []))
      .catch(() => setKayitlar([]));
  }, []);

  const suzulu = (kayitlar || []).filter(
    (k) =>
      (filtre === "hepsi" || k.seviye === filtre) &&
      (!ara.trim() || k.domain.toLowerCase().includes(ara.trim().toLowerCase()))
  );

  const say = {
    hepsi: kayitlar?.length || 0,
    Yüksek: (kayitlar || []).filter((k) => k.seviye === "Yüksek").length,
    Orta: (kayitlar || []).filter((k) => k.seviye === "Orta").length,
    Düşük: (kayitlar || []).filter((k) => k.seviye === "Düşük").length,
  };

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Kanıt Deposu</h1>
          <p className="text-[13px] text-on-surface-variant">Yakaladığımız ve analiz ettiğimiz her adres — kalıcı kayıt.</p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-1.5 rounded-2xl bg-primary/8 p-3 text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>inventory_2</span>
        <span>Sorgulanan ve taranan tüm adresler burada saklanır — geçmişe dönük kanıt ve tekrar-analiz gerektirmeden hızlı erişim.</span>
      </div>

      {/* Arama */}
      <div className="mt-4 flex items-center gap-2 rounded-full border border-outline-variant/50 bg-surface-lowest px-4 py-2.5">
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 18 }}>search</span>
        <input
          value={ara}
          onChange={(e) => setAra(e.target.value)}
          placeholder="Adres ara…"
          className="w-full bg-transparent text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant/60"
        />
      </div>

      {/* Filtre sekmeleri */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {(["hepsi", "Yüksek", "Orta", "Düşük"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltre(f)}
            className={`press shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${
              filtre === f ? "bg-primary text-on-primary" : "bg-surface-lowest text-on-surface-variant"
            }`}
          >
            {f === "hepsi" ? "Hepsi" : f} · {say[f]}
          </button>
        ))}
      </div>

      {kayitlar === null && (
        <div className="mt-6 flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 18 }}>progress_activity</span>
          Yükleniyor…
        </div>
      )}

      {kayitlar?.length === 0 && (
        <div className="mt-8 rounded-2xl bg-surface-lowest p-6 text-center text-sm text-on-surface-variant">
          Henüz kayıt yok. Bir adres sorgulandığında ya da bir marka tarandığında analiz sonuçları burada saklanır.
          <div className="mt-1 text-[12px] text-on-surface-variant/70">
            (Kalıcı kayıt için <b>analizler</b> Firestore kuralının yayınlanmış olması gerekir.)
          </div>
        </div>
      )}

      {kayitlar && kayitlar.length > 0 && suzulu.length === 0 && (
        <div className="mt-8 rounded-2xl bg-surface-lowest p-6 text-center text-sm text-on-surface-variant">
          Bu filtreyle eşleşen kayıt yok.
        </div>
      )}

      {suzulu.length > 0 && (
        <div className="mt-4 space-y-3">
          {suzulu.map((k) => {
            const renk = RENK[k.seviye] || RENK["Düşük"];
            return (
              <div key={k.domain} className={`rounded-3xl p-4 ${renk.kart}`}>
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined ${renk.renk}`} style={{ fontSize: 28 }}>{renk.ikon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[15px] font-bold text-on-surface">{k.domain}</div>
                    <div className="text-[12px] text-on-surface-variant">
                      {KAYNAK_ETIKET[k.kaynak] || k.kaynak} · {zamanMetni(k.zaman)}
                      {k.baslik ? ` · ${k.baslik}` : ""}
                    </div>
                  </div>
                  <div className={`text-right ${renk.renk}`}>
                    <div className="font-display text-xl font-bold">%{k.risk}</div>
                    <div className="text-[10px] font-semibold uppercase">{k.seviye}</div>
                  </div>
                </div>

                {k.bulgular?.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-outline-variant/20 pt-3">
                    {k.bulgular.slice(0, 4).map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[12px] text-on-surface">
                        <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-on-surface-variant" />
                        {s}
                      </li>
                    ))}
                  </ul>
                )}

                <a
                  href={`/sorgula?q=${encodeURIComponent(k.domain)}`}
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
