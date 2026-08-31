"use client";

import { useState } from "react";

type Stat = {
  gercekKisi: number;
  tumCihaz: number;
  testCihaz: number;
  gostergeSayisi: number;
  paylasimSayisi: number;
  toplamBildirim: number;
  enCok: { deger: string; tip: string; sayi: number; kategori: string | null }[];
};

export default function Yonetim() {
  const [key, setKey] = useState("");
  const [stat, setStat] = useState<Stat | null>(null);
  const [hata, setHata] = useState("");
  const [yuk, setYuk] = useState(false);

  async function gir() {
    if (!key) return;
    setYuk(true); setHata("");
    try {
      const r = await fetch("/api/istatistik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.hata || "Giriş başarısız.");
      setStat(d);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Hata.");
    } finally {
      setYuk(false);
    }
  }

  if (!stat) {
    return (
      <div className="px-5 pt-10 pb-6">
        <h1 className="font-display text-2xl font-semibold text-on-surface">Yönetim</h1>
        <p className="mt-1 text-[15px] text-on-surface-variant">Gizli istatistik paneli. Yönetici anahtarını gir.</p>
        <div className="mt-5 flex gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && gir()}
            placeholder="Yönetici anahtarı"
            className="min-w-0 flex-1 rounded-2xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-[15px] text-on-surface outline-none focus:border-primary"
          />
          <button onClick={gir} disabled={yuk || !key} className="press shrink-0 rounded-2xl bg-primary px-5 text-sm font-semibold text-on-primary disabled:opacity-50">
            {yuk ? "…" : "Gir"}
          </button>
        </div>
        {hata && <p className="mt-2 text-sm text-error">{hata}</p>}
      </div>
    );
  }

  const kutu = (buyuk: string | number, alt: string, vurgu = false) => (
    <div className={`rounded-3xl border p-5 ${vurgu ? "border-primary/40 bg-primary-container/20" : "border-outline-variant/40 bg-surface-lowest"}`}>
      <div className={`font-display text-4xl font-extrabold leading-none ${vurgu ? "text-primary" : "text-on-surface"}`}>{buyuk}</div>
      <div className="mt-2 text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">{alt}</div>
    </div>
  );

  return (
    <div className="px-5 pt-3 pb-6">
      <h1 className="font-display text-2xl font-semibold text-on-surface">Yönetim paneli</h1>
      <p className="mt-1 text-[13px] text-on-surface-variant">Sadece sana görünür. Veriler canlı Firestore'dan.</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {kutu(stat.gercekKisi, "gerçek farklı kişi", true)}
        {kutu(stat.toplamBildirim, "toplam bildirim")}
        {kutu(stat.gostergeSayisi, "kayıtlı gösterge")}
        {kutu(stat.paylasimSayisi, "paylaşım")}
      </div>

      <p className="mt-3 rounded-2xl bg-surface-lowest p-3 text-[12px] leading-relaxed text-on-surface-variant">
        <b className="text-on-surface">Gerçek kişi</b> = tarayıcının ürettiği benzersiz kimlik.
        Ham cihaz sayısı <b>{stat.tumCihaz}</b> ({stat.testCihaz} tanesi test/geliştirme kaydı, gerçek sayıya dahil değil).
      </p>

      {stat.enCok.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-2 font-display text-base font-bold text-on-surface">En çok bildirilen</h2>
          <div className="space-y-1.5">
            {stat.enCok.map((e, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-outline-variant/25 bg-surface-lowest p-3">
                <span className="min-w-0 flex-1 truncate text-[13px] text-on-surface">{e.deger}</span>
                {e.kategori && <span className="shrink-0 text-[11px] text-on-surface-variant">{e.kategori}</span>}
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{e.sayi}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setStat(null)} className="mt-6 rounded-full border border-outline-variant px-5 py-2 text-sm font-medium text-on-surface">Çıkış</button>
    </div>
  );
}
