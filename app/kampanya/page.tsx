"use client";

import { useEffect, useRef, useState } from "react";

type Dugum = {
  domain: string;
  ip?: string;
  asn?: string;
  ulke?: string;
  yil?: string;
  gunOnce?: number;
  ekran?: string;
  zararli?: boolean;
  canli: boolean;
  neden: string;
};
type Kampanya = {
  seed: string;
  marka?: string;
  ozet: string;
  domainler: Dugum[];
  ipler: string[];
  asnler: string[];
  telegramlar: string[];
  iletisimKanallari: string[];
  exfil: string[];
  istenenAlanlar: string[];
  diger: string[];
  ilkGunOnce?: number;
};

const YUKLEME = [
  "Sahte siteyi inceliyorum…",
  "Aynı sunucudaki kardeş domainleri arıyorum…",
  "Marka taklidi ikizlerini tarıyorum…",
  "IP ve ağ (ASN) bağlarını çıkarıyorum…",
  "Operasyonu birleştiriyorum…",
];

export default function KampanyaSayfa() {
  const [giris, setGiris] = useState("");
  const [yuk, setYuk] = useState(false);
  const [sonuc, setSonuc] = useState<Kampanya | null>(null);
  const [hata, setHata] = useState("");
  const [mesajIdx, setMesajIdx] = useState(0);
  const [digerAcik, setDigerAcik] = useState(false);
  const zaman = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (zaman.current) clearInterval(zaman.current); }, []);

  async function coz() {
    const d = giris.trim();
    if (!d || yuk) return;
    setYuk(true); setHata(""); setSonuc(null); setDigerAcik(false); setMesajIdx(0);
    zaman.current = setInterval(() => setMesajIdx((i) => (i + 1) % YUKLEME.length), 3200);
    try {
      const r = await fetch("/api/kampanya", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giris: d }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.hata || "Çözümlenemedi.");
      setSonuc(j);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Çözümlenemedi, tekrar dene.");
    } finally {
      setYuk(false);
      if (zaman.current) clearInterval(zaman.current);
    }
  }

  const kritikAlan = (a: string) => /şifre|kart|cvv|sms|iban|kimlik/i.test(a);
  const uyeSayisi = sonuc?.domainler.length ?? 0;
  const operasyonVar = uyeSayisi > 1;
  const seedEkran = sonuc?.domainler.find((d) => d.ekran)?.ekran;

  return (
    <div className="px-5 pt-3 pb-10">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <span className="material-symbols-outlined" style={{ fontSize: 26 }}>hub</span>
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Kampanya Çözümleme</h1>
          <p className="text-[13px] text-on-surface-variant">Tek sahte siteden tüm operasyonu çıkar.</p>
        </div>
      </div>

      <p className="mt-4 text-[14px] leading-relaxed text-on-surface-variant">
        Bir sahte/şüpheli site adresi gir. Aynı çeteye ait <b>kardeş domainleri</b>, ortak <b>sunucu/ağ</b> altyapısını,
        <b>sahte sayfanın görüntüsünü</b> ve (erişebildiğimde) topladığı bilgileri çıkarırım.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          value={giris}
          onChange={(e) => setGiris(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && coz()}
          autoCapitalize="none"
          placeholder="ornek-sahte-site.com"
          className="min-w-0 flex-1 rounded-2xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-[15px] text-on-surface outline-none focus:border-primary"
        />
        <button
          onClick={coz}
          disabled={yuk || !giris.trim()}
          className="press shrink-0 rounded-2xl bg-primary px-5 text-sm font-semibold text-on-primary disabled:opacity-50"
        >
          {yuk ? "…" : "Çözümle"}
        </button>
      </div>

      {yuk && (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl border border-outline-variant/30 bg-surface-lowest p-6">
          <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 34 }}>progress_activity</span>
          <p className="text-center text-[14px] font-medium text-on-surface">{YUKLEME[mesajIdx]}</p>
          <p className="text-center text-[12px] text-on-surface-variant">Bu birkaç saniye sürebilir — birçok kaynağı tarıyorum.</p>
        </div>
      )}

      {hata && !yuk && (
        <div className="mt-4 rounded-2xl bg-error-container p-3.5 text-sm font-medium text-error">{hata}</div>
      )}

      {sonuc && !yuk && (
        <div className="mt-6 space-y-4">
          {/* ÖZET */}
          <div className={`rounded-3xl p-4 ${operasyonVar ? "bg-error-container" : "border border-outline-variant/40 bg-surface-lowest"}`}>
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined ${operasyonVar ? "text-error" : "text-primary"}`} style={{ fontSize: 22 }}>
                {operasyonVar ? "warning" : "info"}
              </span>
              <p className={`text-sm font-bold ${operasyonVar ? "text-error" : "text-on-surface"}`}>
                {operasyonVar ? "Koordineli operasyon tespit edildi" : "Analiz tamamlandı"}
              </p>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-on-surface">{sonuc.ozet}</p>
          </div>

          {/* SAYAÇLAR */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { s: uyeSayisi, e: "domain", i: "language" },
              { s: sonuc.ipler.length, e: "sunucu (IP)", i: "dns" },
              { s: sonuc.asnler.length, e: "ağ (ASN)", i: "lan" },
            ].map((k) => (
              <div key={k.e} className="rounded-2xl border border-outline-variant/30 bg-surface-lowest p-3 text-center">
                <p className="font-display text-2xl font-semibold text-primary">{k.s}</p>
                <p className="mt-0.5 text-[11px] text-on-surface-variant">{k.e}</p>
              </div>
            ))}
          </div>

          {/* SAHTE SAYFANIN GÖRÜNTÜSÜ — "ne topluyor"un görsel kanıtı */}
          {seedEkran && (
            <div className="overflow-hidden rounded-2xl border border-error/30 bg-error/5">
              <div className="flex items-center gap-2 px-3.5 pt-3">
                <span className="material-symbols-outlined text-error" style={{ fontSize: 18 }}>photo_camera</span>
                <p className="text-[13px] font-bold text-error">Sahte sayfanın görüntüsü — istediği bilgiler burada</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={seedEkran} alt="Sahte sayfa" className="mt-2 w-full border-t border-error/20 object-cover object-top" style={{ maxHeight: 320 }} />
            </div>
          )}

          {/* İSTENEN BİLGİLER (metin olarak çıkarılabildiyse) */}
          {sonuc.istenenAlanlar.length > 0 && (
            <div className="rounded-2xl border border-error/30 bg-error/5 p-3.5">
              <p className="text-[13px] font-bold text-error">Klon sayfa şu bilgileri çalmaya çalışıyor:</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sonuc.istenenAlanlar.map((a, i) => (
                  <span key={i} className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${kritikAlan(a) ? "bg-error/15 text-error" : "bg-surface-container text-on-surface-variant"}`}>{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* İLETİŞİM / EXFİL KANALLARI (sayfanın ifşa ettiği Telegram/WhatsApp/Discord) */}
          {sonuc.iletisimKanallari.length > 0 && (
            <div className="rounded-2xl border border-error/30 bg-error/5 p-3.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-error" style={{ fontSize: 18 }}>forum</span>
                <p className="text-[13px] font-bold text-error">Çetenin iletişim/veri kanalları</p>
              </div>
              <p className="mt-0.5 text-[11.5px] text-on-surface-variant">Sahte sayfanın kendi ifşa ettiği kanallar (çalınan veri buraya gidebilir).</p>
              <div className="mt-2 space-y-1">
                {sonuc.iletisimKanallari.map((t, i) => (
                  <p key={i} className="break-all text-[12.5px] font-medium text-on-surface">{t}</p>
                ))}
              </div>
            </div>
          )}

          {/* OPERASYON PARÇALARI */}
          <div>
            <p className="px-1 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              {operasyonVar ? "Operasyonun parçaları" : "İncelenen adres"}
            </p>
            <div className="mt-2 space-y-2">
              {sonuc.domainler.map((d, i) => {
                const tohum = i === 0;
                return (
                  <div key={d.domain} className={`flex gap-3 rounded-2xl border p-3 ${tohum ? "border-primary/40 bg-primary/5" : "border-outline-variant/30 bg-surface-lowest"}`}>
                    {d.ekran ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.ekran} alt="" className="h-12 w-16 shrink-0 rounded-lg border border-outline-variant/40 object-cover object-top" />
                    ) : (
                      <span className="grid h-12 w-16 shrink-0 place-items-center rounded-lg bg-surface-container text-on-surface-variant">
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{d.canli ? "public" : "public_off"}</span>
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-bold text-on-surface">{d.domain}</p>
                        {tohum && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">sorgulanan</span>}
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-on-surface-variant">{d.neden}</p>
                      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-on-surface-variant">
                        {d.ip && <span>IP: {d.ip}</span>}
                        {d.asn && <span>{d.asn}</span>}
                        {d.ulke && <span>{d.ulke}</span>}
                        {typeof d.gunOnce === "number" && <span>{d.gunOnce} gün önce açıldı</span>}
                        {!d.canli && <span className="text-on-surface-variant">şu an pasif</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AYNI MARKA, FARKLI SUNUCU */}
          {sonuc.diger.length > 0 && (
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-lowest p-3.5">
              <button onClick={() => setDigerAcik((v) => !v)} className="flex w-full items-center justify-between gap-2">
                <span className="text-left text-[13px] font-semibold text-on-surface">
                  Aynı markayı taşıyan {sonuc.diger.length} domain daha
                  <span className="ml-1 font-normal text-on-surface-variant">(farklı sunucu — ayrı kampanya olabilir)</span>
                </span>
                <span className="material-symbols-outlined shrink-0 text-on-surface-variant" style={{ fontSize: 20 }}>{digerAcik ? "expand_less" : "expand_more"}</span>
              </button>
              {digerAcik && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sonuc.diger.map((d, i) => (
                    <span key={i} className="break-all rounded-full bg-surface-container px-2 py-0.5 text-[11px] text-on-surface-variant">{d}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DÜRÜST NOT */}
          <p className="px-1 text-[11.5px] leading-relaxed text-on-surface-variant">
            Bu harita açık kaynaklardan (urlscan, DNS, RDAP) otomatik çıkarılır; kesin suç tespiti değildir. Telegram/exfil
            yalnızca sayfanın kendi kaynağına sızdırdığı durumlarda görünür. Resmî işlem için markanın bilinen sitesini kullan.
          </p>
        </div>
      )}
    </div>
  );
}
