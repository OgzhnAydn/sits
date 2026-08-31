"use client";

import { useEffect, useState } from "react";

type Stat = {
  gercekKisi: number;
  tumCihaz: number;
  testCihaz: number;
  gostergeSayisi: number;
  paylasimSayisi: number;
  toplamBildirim: number;
  enCok: { deger: string; tip: string; sayi: number; kategori: string | null }[];
  kayitlar: { tip: string; deger: string; kategori: string | null; nezaman: number | null; kim: string[]; sayi: number }[];
};

const TIP_RENK: Record<string, string> = {
  url: "bg-blue-500/12 text-blue-600", iban: "bg-purple-500/12 text-purple-600",
  telefon: "bg-green-500/12 text-green-600", kripto: "bg-orange-500/12 text-orange-600",
  mesaj: "bg-error/12 text-error",
};

function zaman(ms: number | null): string {
  if (!ms) return "—";
  try { return new Date(ms).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

const TIP_AD: Record<string, string> = { url: "site", iban: "IBAN", telefon: "telefon", kripto: "kripto" };

export default function Istatistik() {
  const [anahtar, setAnahtar] = useState("");
  const [veri, setVeri] = useState<Stat | null>(null);
  const [hata, setHata] = useState("");
  const [yuk, setYuk] = useState(false);
  const [filtre, setFiltre] = useState<string>("hepsi");
  const [basladi, setBasladi] = useState(false); // ilk otomatik yükleme denendi mi

  useEffect(() => {
    const k = localStorage.getItem("sits_admin_key");
    if (k) { setAnahtar(k); getir(k); }        // anahtar hatırlanıyor → sormadan getir
    else setBasladi(true);                      // hiç anahtar yok → ilk kez sor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getir(k?: string) {
    const key = (k ?? anahtar).trim();
    if (!key || yuk) return;
    setYuk(true); setHata("");
    try {
      const r = await fetch("/api/istatistik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.hata || "Alınamadı");
      setVeri(j);
      localStorage.setItem("sits_admin_key", key);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Alınamadı");
      setVeri(null);
      setBasladi(true); // hata → anahtar kutusunu göster (yanlış/eskimiş anahtar)
    } finally {
      setYuk(false);
    }
  }

  const kartlar = veri
    ? [
        { s: veri.gercekKisi, e: "gerçek kişi", i: "group", vurgu: true },
        { s: veri.gostergeSayisi, e: "veri kaydı", i: "database", vurgu: true },
        { s: veri.toplamBildirim, e: "bildirim", i: "flag", vurgu: false },
        { s: veri.paylasimSayisi, e: "paylaşım", i: "share", vurgu: false },
        { s: veri.tumCihaz, e: "tüm cihaz", i: "devices", vurgu: false },
        { s: veri.testCihaz, e: "test/anon", i: "science", vurgu: false },
      ]
    : [];

  return (
    <div className="px-5 pt-3 pb-10">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <span className="material-symbols-outlined" style={{ fontSize: 26 }}>monitoring</span>
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">İstatistik</h1>
          <p className="text-[13px] text-on-surface-variant">Kaç kişi kullandı, ne kadar veri birikti.</p>
        </div>
      </div>

      {/* İlk otomatik yükleme sürerken: sadece spinner (anahtar kutusu gösterme) */}
      {!veri && !basladi && (
        <p className="mt-4 flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 18 }}>progress_activity</span>
          Yükleniyor…
        </p>
      )}
      {/* Anahtar kutusu YALNIZCA hiç anahtar yoksa / hata varsa (ilk kez) görünür */}
      {!veri && basladi && (
        <>
          <div className="mt-4 flex gap-2">
            <input
              type="password"
              value={anahtar}
              onChange={(e) => setAnahtar(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && getir()}
              placeholder="Admin anahtarı"
              className="min-w-0 flex-1 rounded-2xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-[15px] text-on-surface outline-none focus:border-primary"
            />
            <button onClick={() => getir()} disabled={yuk || !anahtar.trim()} className="press shrink-0 rounded-2xl bg-primary px-5 text-sm font-semibold text-on-primary disabled:opacity-50">
              {yuk ? "…" : "Getir"}
            </button>
          </div>
          {hata && <p className="mt-2 text-sm text-error">{hata}</p>}
        </>
      )}

      {veri && (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {kartlar.map((k) => (
              <div key={k.e} className={`rounded-2xl p-3 text-center ${k.vurgu ? "bg-primary-container/30" : "border border-outline-variant/30 bg-surface-lowest"}`}>
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>{k.i}</span>
                <p className="font-display text-2xl font-semibold text-on-surface">{k.s.toLocaleString("tr-TR")}</p>
                <p className="text-[11px] text-on-surface-variant">{k.e}</p>
              </div>
            ))}
          </div>

          {veri.enCok.length > 0 && (
            <div>
              <p className="px-1 text-xs font-bold uppercase tracking-wide text-on-surface-variant">En çok bildirilenler</p>
              <div className="mt-2 space-y-1.5">
                {veri.enCok.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-outline-variant/30 bg-surface-lowest p-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-on-surface">{e.deger}</p>
                      <p className="text-[11px] text-on-surface-variant">{TIP_AD[e.tip] || e.tip}{e.kategori ? ` · ${e.kategori}` : ""}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-bold text-error">{e.sayi} bildirim</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* TAM KAYIT TABLOSU: her giriş + ne zaman + kim */}
          {veri.kayitlar && veri.kayitlar.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Tüm kayıtlar ({veri.kayitlar.length})</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { k: "hepsi", e: "Hepsi" }, { k: "url", e: "Link" }, { k: "iban", e: "IBAN" },
                  { k: "telefon", e: "Telefon" }, { k: "mesaj", e: "Mesaj" }, { k: "kripto", e: "Kripto" },
                ].map((f) => (
                  <button key={f.k} onClick={() => setFiltre(f.k)}
                    className={`rounded-full px-3 py-1 text-[12px] font-semibold ${filtre === f.k ? "bg-primary text-on-primary" : "border border-outline-variant/40 bg-surface-lowest text-on-surface-variant"}`}>
                    {f.e}
                  </button>
                ))}
              </div>
              <div className="mt-2 space-y-1.5">
                {veri.kayitlar.filter((r) => filtre === "hepsi" || r.tip === filtre).map((r, i) => (
                  <div key={i} className="rounded-xl border border-outline-variant/30 bg-surface-lowest p-2.5">
                    <div className="flex items-start gap-2">
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${TIP_RENK[r.tip] || "bg-surface-container text-on-surface-variant"}`}>{r.tip}</span>
                      <p className="min-w-0 flex-1 break-all text-[12.5px] font-medium text-on-surface">{r.deger}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-on-surface-variant">
                      <span className="inline-flex items-center gap-0.5"><span className="material-symbols-outlined" style={{ fontSize: 12 }}>schedule</span>{zaman(r.nezaman)}</span>
                      <span className="inline-flex items-center gap-0.5"><span className="material-symbols-outlined" style={{ fontSize: 12 }}>person</span>{r.kim.length ? r.kim.map((k) => k.slice(0, 8)).join(", ") : "anon"}</span>
                      {r.sayi > 1 && <span>{r.sayi}× soruldu</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="px-1 text-[11px] text-on-surface-variant">Gerçek kişi = UUID cihaz kimliği (test/anon ayrı sayılır). &quot;Kim&quot; = anonim cihaz kimliği (gerçek isim tutulmaz). Anahtar bu cihazda saklanır.</p>
        </div>
      )}
    </div>
  );
}
