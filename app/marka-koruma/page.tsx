"use client";

import { useEffect, useState } from "react";

type Marka = { anahtar: string; ad: string; resmi: string[] };
type Tarama = {
  taranan: number; canli: number;
  sonuclar: { domain: string; skor: number; seviye: string; sinyaller: string[] }[];
  digerCanli: string[];
};
type Aday = { domain: string; markaAdi: string; skor: number; seviye: string; sinyaller: string[]; zaman: number };
type TespitDetay = {
  domain: string; markaAdi: string; skor: number; seviye: string; sinyaller: string[]; zaman: number;
  durum?: "aktif-tuzak" | "park" | "yayinda-degil" | "canli";
  kampanya?: { domainSayisi: number; ipler: string[]; iletisimKanallari: string[]; exfilVar: boolean };
};
const DURUM_ETIKET: Record<string, { et: string; sinif: string; ikon: string }> = {
  "aktif-tuzak": { et: "AKTİF TUZAK", sinif: "bg-error/12 text-error", ikon: "gpp_bad" },
  "park": { et: "Park · izlemede", sinif: "bg-primary/10 text-primary", ikon: "inventory_2" },
  "yayinda-degil": { et: "Yayında değil", sinif: "bg-on-surface-variant/10 text-on-surface-variant", ikon: "cloud_off" },
  "canli": { et: "Canlı", sinif: "bg-secondary/12 text-secondary", ikon: "public" },
};
function tespitZaman(ms: number): string {
  const dk = Math.floor((Date.now() - ms) / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dk önce`;
  const s = Math.floor(dk / 60);
  if (s < 24) return `${s} saat önce`;
  return `${Math.floor(s / 24)} gün önce`;
}
// Kartta gösterilecek EN AYIRT EDİCİ gerekçe — hep sinyaller[0] (genelde jenerik SSL/urlscan) yerine
// en spesifik sinyali seç ki liste tekdüze görünmesin.
const GEREKCE_ONCELIK = [
  /klon|kopyas|kaz[ıi]n|birebir/i, /logo|amblem/i, /y[öo]nlendir|forsale|godaddy/i,
  /homograf|xn--|g[öo]z.?aldat/i, /[şs]ifre|kart|kimlik bilgisi|[İi]ST[İi]YOR/i,
  /HTTPS.*kullanm[ıi]yor/i, /ge[çc]ersiz|kendinden imzal/i,
];
function enGerekce(sinyaller?: string[]): string {
  if (!sinyaller?.length) return "";
  for (const re of GEREKCE_ONCELIK) { const s = sinyaller.find((x) => re.test(x)); if (s) return s; }
  return sinyaller[0];
}
type Rapor = {
  marka: string; markaAdi: string; tarih: string;
  eslesme: number; analiz: number;
  yuksek: Aday[]; orta: Aday[]; temiz: boolean; zaman: number;
};

// Yazılan marka linkinden / URL'den sade alan adı çıkar (https, www, yol, boşluk temizle).
function alanAdiCoz(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/\s+/g, "");
}

export default function MarkaKoruma() {
  const [markalar, setMarkalar] = useState<Marka[]>([]);
  const [marka, setMarka] = useState("");
  const [link, setLink] = useState("");
  const [email, setEmail] = useState("");
  const [durum, setDurum] = useState<"" | "gonderiliyor" | "ok" | "hata">("");
  const [mesaj, setMesaj] = useState("");
  const [rapor, setRapor] = useState<Rapor | null>(null);
  const [raporYuk, setRaporYuk] = useState(false);
  const [tarama, setTarama] = useState<Tarama | null>(null);
  const [taramaYuk, setTaramaYuk] = useState(false);
  const [ozet, setOzet] = useState<{ markaAdi: string; toplam: number; aktif: number; park: number; yuksek: number; operasyon: number; canli?: number; kumeTld?: string; kumeAdet?: number; ayri?: number; sonlar?: TespitDetay[] } | null>(null);
  const [erkenlik, setErkenlik] = useState<{ toplam: number; bizOnce: number; usomdaYok: number; usomOnce: number; ortGun: number } | null>(null);
  const [detayAcik, setDetayAcik] = useState(false);
  const [detayFiltre, setDetayFiltre] = useState<"hepsi" | "aktif-tuzak" | "park" | "yuksek">("hepsi");
  const [phAcik, setPhAcik] = useState(false); // .ph benzer-isim kümesini aç/kapa
  // Self-servis marka kaydı (kendi markan + resmî domainler)
  const [kayitAcik, setKayitAcik] = useState(false);
  const [kAd, setKAd] = useState("");
  const [kResmi, setKResmi] = useState("");
  const [kDurum, setKDurum] = useState<"" | "gonderiliyor" | "ok" | "hata">("");
  const [kMesaj, setKMesaj] = useState("");

  async function sahteTara(hedefOverride?: string) {
    // Override (kayıt sonrası) > serbest link > seçili markanın resmî domaini. Kayıt şart değil.
    const secili = markalar.find((x) => x.anahtar === marka)?.resmi?.[0];
    const hedef = (typeof hedefOverride === "string" && hedefOverride) || alanAdiCoz(link) || secili;
    if (!hedef || taramaYuk) return;
    setTaramaYuk(true);
    setTarama(null);
    try {
      const r = await fetch("/api/sahte-bul", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: hedef }),
      });
      const d = await r.json();
      if (r.ok) setTarama(d);
    } finally {
      setTaramaYuk(false);
    }
  }

  async function markalariYukle() {
    try {
      const d = await (await fetch("/api/markalar?all=1")).json();
      setMarkalar(d.markalar || []);
    } catch {}
  }
  useEffect(() => { markalariYukle(); }, []);

  // Seçili marka için müşteri tespit özeti — "bugüne kadar şu kadar tehdit tespit ettik".
  useEffect(() => {
    if (!marka) { setOzet(null); setErkenlik(null); return; }
    let iptal = false;
    fetch(`/api/marka-ozet?marka=${encodeURIComponent(marka)}`)
      .then((r) => r.json())
      .then((d) => { if (!iptal && typeof d.toplam === "number") setOzet(d); })
      .catch(() => { if (!iptal) setOzet(null); });
    // Erkenlik ayrı yüklenir (USOM sorguları uzun sürebilir).
    setErkenlik(null);
    fetch(`/api/marka-erkenlik?marka=${encodeURIComponent(marka)}`)
      .then((r) => r.json())
      .then((d) => { if (!iptal && typeof d.toplam === "number") setErkenlik(d); })
      .catch(() => {});
    return () => { iptal = true; };
  }, [marka]);

  // Kullanıcı kendi markasını + RESMÎ domainlerini kaydeder → hem listede hem taramada, kendi siteleri allowlist.
  async function markaKaydet() {
    if (kDurum === "gonderiliyor" || !kResmi.trim()) return;
    const ilkDomain = alanAdiCoz(kResmi.split(/[\s,;\n]+/)[0] || "");
    setKDurum("gonderiliyor");
    setKMesaj("");
    try {
      const r = await fetch("/api/marka-kayit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad: kAd.trim(), resmi: kResmi.trim(), email: email.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        setKDurum("ok");
        setKMesaj(`${d.markaAdi} eklendi · ${d.resmi.length} resmî adres allowlist'e alındı. Taranıyor…`);
        await markalariYukle();
        setMarka(d.anahtar);
        setKAd(""); setKResmi("");
        setKayitAcik(false);
      } else {
        setKDurum("hata");
        setKMesaj((d.hata || "Kalıcı kayıt yapılamadı") + " — yine de şimdi tarıyoruz.");
      }
    } catch {
      setKDurum("hata");
      setKMesaj("Kayıt bağlantı hatası — yine de tarıyoruz.");
    }
    // Kayıt kalıcı olsun ya da olmasın, markayı HEMEN tara (tarama her zaman çalışır).
    if (ilkDomain) sahteTara(ilkDomain);
  }

  async function raporGetir(m: string) {
    setRaporYuk(true);
    setRapor(null);
    try {
      const r = await fetch(`/api/marka-rapor?marka=${encodeURIComponent(m)}`);
      const d = await r.json();
      setRapor(d.rapor || null);
    } finally {
      setRaporYuk(false);
    }
  }

  async function kaydol() {
    if (!marka || !email.trim()) return;
    setDurum("gonderiliyor");
    setMesaj("");
    try {
      const r = await fetch("/api/abone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marka, email: email.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        setDurum("ok");
        setMesaj(`${d.markaAdi} için koruma başlatıldı. Günlük raporun bu panoda + e-postana gelecek.`);
        raporGetir(marka);
      } else {
        setDurum("hata");
        setMesaj(d.hata || "Kayıt yapılamadı.");
      }
    } catch {
      setDurum("hata");
      setMesaj("Bağlantı hatası.");
    }
  }

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Marka Koruma</h1>
          <p className="text-[13px] text-on-surface-variant">Markanı taklit eden sahte siteleri her gün izleyip raporlarız.</p>
        </div>
      </div>

      {/* Değer önermesi */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { i: "radar", t: "Geniş tarama", a: "Web'de marka araması" },
          { i: "content_copy", t: "Logo/favicon", a: "Birebir kopya tespiti" },
          { i: "mark_email_read", t: "Günlük rapor", a: "Bulundu / temiz" },
        ].map((x) => (
          <div key={x.t} className="rounded-2xl bg-surface-lowest p-3">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 22 }}>{x.i}</span>
            <p className="mt-1 text-[12px] font-bold text-on-surface">{x.t}</p>
            <p className="text-[10px] leading-tight text-on-surface-variant">{x.a}</p>
          </div>
        ))}
      </div>

      {/* Kayıt formu */}
      <div className="mt-5 rounded-3xl border border-outline-variant/40 bg-surface-lowest p-4">
        <p className="text-sm font-semibold text-on-surface">Markanı korumaya al</p>
        <select
          value={marka}
          onChange={(e) => setMarka(e.target.value)}
          className="mt-3 w-full rounded-2xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-[15px] text-on-surface outline-none focus:border-primary"
        >
          <option value="">Markanı seç…</option>
          {markalar.map((m) => (
            <option key={m.anahtar} value={m.anahtar}>{m.ad}</option>
          ))}
        </select>

        {/* Kendi markanı + resmî sitelerini ekle */}
        <button type="button" onClick={() => setKayitAcik((v) => !v)} className="press mt-2 flex items-center gap-1 text-[12px] font-medium text-primary">
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{kayitAcik ? "expand_less" : "add_circle"}</span>
          Markam listede yok — kendi markamı + resmî sitelerimi ekle
        </button>
        {kayitAcik && (
          <div className="mt-2 space-y-2 rounded-2xl border border-outline-variant/40 bg-surface-low p-3">
            <input
              value={kAd}
              onChange={(e) => setKAd(e.target.value)}
              placeholder="Marka adı (ör. ERN Holding)"
              className="w-full rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-[14px] text-on-surface outline-none focus:border-primary"
            />
            <textarea
              value={kResmi}
              onChange={(e) => setKResmi(e.target.value)}
              rows={2}
              placeholder="Resmî site(ler)in — ör. ern.com.tr, ern.com (virgülle ayır)"
              className="w-full resize-none rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-[14px] text-on-surface outline-none focus:border-primary"
            />
            <p className="text-[11px] leading-snug text-on-surface-variant">
              Resmî adreslerin <b>allowlist</b>&apos;e alınır — kendi siteleriniz asla &quot;sahte&quot; olarak işaretlenmez.
            </p>
            <button
              onClick={markaKaydet}
              disabled={kDurum === "gonderiliyor" || !kResmi.trim()}
              className="press w-full rounded-full border border-primary py-2.5 text-sm font-semibold text-primary disabled:opacity-50"
            >
              {kDurum === "gonderiliyor" ? "Ekleniyor…" : "Markamı ekle ve tara"}
            </button>
            {kMesaj && <p className={`text-[12px] ${kDurum === "ok" ? "text-secondary" : "text-error"}`}>{kMesaj}</p>}
          </div>
        )}
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Rapor e-postan"
          className="mt-2 w-full rounded-2xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-[15px] text-on-surface outline-none focus:border-primary"
        />
        <button
          onClick={kaydol}
          disabled={durum === "gonderiliyor" || !marka || !email.trim()}
          className="press mt-3 w-full rounded-full py-3 text-sm font-semibold text-on-primary shadow-glow disabled:opacity-50"
          style={{ background: "var(--gradient-primary)" }}
        >
          {durum === "gonderiliyor" ? "Kaydediliyor…" : "Korumayı başlat"}
        </button>
        {mesaj && (
          <p className={`mt-2 text-[13px] ${durum === "ok" ? "text-secondary" : "text-error"}`}>{mesaj}</p>
        )}
        {marka && durum !== "ok" && (
          <button onClick={() => raporGetir(marka)} className="press mt-2 w-full text-[12px] font-medium text-primary underline">
            Bu markanın bugünkü raporunu gör
          </button>
        )}
      </div>

      {/* MÜŞTERİ TESPİT ÖZETİ — "markanız için bugüne kadar şu kadar tehdit tespit ettik" */}
      {ozet && ozet.toplam > 0 && (
        <div className="mt-4 rounded-3xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>verified_user</span>
            {ozet.markaAdi} için sizi koruyoruz
          </div>
          {ozet.kumeAdet && ozet.kumeAdet > 0 ? (
            <p className="mt-1 text-[12px] text-on-surface-variant">
              Markanız adına <b className="text-on-surface">{ozet.ayri}</b> ayrı şüpheli adres + <b className="text-on-surface">{ozet.kumeAdet} domainlik tek bir .{ozet.kumeTld} park kümesi</b> (aynı operasyon) tespit ettik.
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-on-surface-variant">
              Bugüne kadar markanız adına açılmış <b className="text-on-surface">{ozet.toplam}</b> sahte/şüpheli adres tespit ettik.
            </p>
          )}
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {ozet.kumeAdet && ozet.kumeAdet > 0 ? (
              <>
                <div><div className="font-display text-xl font-bold text-on-surface tabular-nums">{ozet.ayri}</div><div className="text-[10px] text-on-surface-variant">ayrı adres</div></div>
                <div><div className="font-display text-xl font-bold text-secondary tabular-nums">{ozet.canli ?? 0}</div><div className="text-[10px] text-on-surface-variant">canlı</div></div>
                <div><div className="font-display text-xl font-bold text-error tabular-nums">{ozet.aktif}</div><div className="text-[10px] text-on-surface-variant">aktif tuzak</div></div>
                <div><div className="font-display text-xl font-bold text-primary tabular-nums">{ozet.kumeAdet}</div><div className="text-[10px] text-on-surface-variant">.{ozet.kumeTld} park kümesi</div></div>
              </>
            ) : (
              <>
                <div><div className="font-display text-xl font-bold text-on-surface tabular-nums">{ozet.toplam}</div><div className="text-[10px] text-on-surface-variant">toplam</div></div>
                <div><div className="font-display text-xl font-bold text-error tabular-nums">{ozet.yuksek}</div><div className="text-[10px] text-on-surface-variant">yüksek risk</div></div>
                <div><div className="font-display text-xl font-bold text-error tabular-nums">{ozet.aktif}</div><div className="text-[10px] text-on-surface-variant">aktif tuzak</div></div>
                <div><div className="font-display text-xl font-bold text-primary tabular-nums">{ozet.park}</div><div className="text-[10px] text-on-surface-variant">park · izlemede</div></div>
              </>
            )}
          </div>
          {ozet.kumeAdet && ozet.kumeAdet > 0 ? (
            <p className="mt-2 text-[11px] text-on-surface-variant">Not: .{ozet.kumeTld} kümesinin tamamı aynı altyapıda, park/yönlendirme hâlinde — tek operasyonun toplu kaydı. Sayı, tekil tehdit değil <b>tek küme</b> olarak değerlendirilir.</p>
          ) : (
            ozet.operasyon > 0 && <p className="mt-2 text-[11px] font-medium text-error">{ozet.operasyon} tanesi organize bir dolandırıcılık operasyonunun parçası.</p>
          )}

          {/* DETAYLARI GÖR — her tespitin ne olduğu, durumu, sinyalleri */}
          {ozet.sonlar && ozet.sonlar.length > 0 && (
            <>
              <button onClick={() => setDetayAcik((v) => !v)} className="press mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-primary/30 bg-surface-lowest py-2 text-[12px] font-semibold text-primary">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{detayAcik ? "expand_less" : "list"}</span>
                {detayAcik ? "Detayları gizle" : `Tespit edilenleri detaylı gör (${ozet.sonlar.length})`}
              </button>

              {detayAcik && (
                <div className="mt-3">
                  {/* filtre */}
                  <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                    {([["hepsi", "Hepsi"], ["aktif-tuzak", "Aktif"], ["park", "Park"], ["yuksek", "Yüksek risk"]] as const).map(([f, et]) => (
                      <button key={f} onClick={() => setDetayFiltre(f)} className={`press shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${detayFiltre === f ? "bg-primary text-on-primary" : "bg-surface-lowest text-on-surface-variant"}`}>{et}</button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const liste = (ozet.sonlar ?? []).filter((t) => detayFiltre === "hepsi" || (detayFiltre === "yuksek" ? t.skor >= 60 : t.durum === detayFiltre));
                      const ph = liste.filter((t) => t.domain.toLowerCase().endsWith(".ph"));
                      const diger = liste.filter((t) => !t.domain.toLowerCase().endsWith(".ph"));
                      const phEnYuksek = ph.reduce((m, t) => Math.max(m, t.skor), 0);
                      const kart = (t: TespitDetay, i: number) => {
                        const dr = t.durum ? DURUM_ETIKET[t.durum] : null;
                        const gk = enGerekce(t.sinyaller);
                        return (
                          <a key={t.domain + i} href={`/sorgula?q=${encodeURIComponent(t.domain)}`} className="press block rounded-2xl border border-outline-variant/30 bg-surface-lowest p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[13px] font-semibold text-on-surface">{t.domain}</span>
                              <span className={`shrink-0 text-[13px] font-bold ${t.skor >= 60 ? "text-error" : t.skor >= 30 ? "text-primary" : "text-on-surface-variant"}`}>%{t.skor}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                              {dr && <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold ${dr.sinif}`}><span className="material-symbols-outlined" style={{ fontSize: 11 }}>{dr.ikon}</span>{dr.et}</span>}
                              {t.kampanya && t.kampanya.domainSayisi > 1 && <span className="inline-flex items-center gap-0.5 rounded-full bg-error/10 px-1.5 py-0.5 font-bold text-error">{t.kampanya.domainSayisi} domainli operasyon</span>}
                              <span className="ml-auto text-on-surface-variant">{tespitZaman(t.zaman)}</span>
                            </div>
                            {gk && <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-on-surface-variant">{gk}</p>}
                            {t.kampanya && (t.kampanya.iletisimKanallari.length > 0 || t.kampanya.exfilVar) && (
                              <p className="mt-1 break-all text-[10.5px] font-medium text-error">
                                {t.kampanya.iletisimKanallari.length > 0 && `Dolandırıcı kanalı: ${t.kampanya.iletisimKanallari.join(", ")}`}
                                {t.kampanya.exfilVar && " · veri dış adrese gidiyor"}
                              </p>
                            )}
                          </a>
                        );
                      };
                      return (
                        <>
                          {diger.map(kart)}
                          {ph.length > 3 ? (
                            <div className="rounded-2xl border border-outline-variant/30 bg-surface-lowest">
                              <button onClick={() => setPhAcik((v) => !v)} className="press flex w-full items-center justify-between gap-2 p-3 text-left">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-on-surface">
                                    <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>hub</span>
                                    {ph.length} adet <span className="font-mono">.ph</span> benzer-isim kümesi
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-on-surface-variant">Aynı altyapı · park/izlemede · tek operasyon deseni (en yükseği %{phEnYuksek})</div>
                                </div>
                                <span className="material-symbols-outlined shrink-0 text-on-surface-variant" style={{ fontSize: 20 }}>{phAcik ? "expand_less" : "expand_more"}</span>
                              </button>
                              {phAcik && <div className="space-y-2 p-2 pt-0">{ph.map(kart)}</div>}
                            </div>
                          ) : (
                            ph.map(kart)
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ERKENLİK — USOM ulusal listesiyle karşılaştırma: "kaç gün önce / USOM'da bile yok" */}
      {erkenlik && erkenlik.toplam > 0 && (
        <div className="mt-4 rounded-3xl border border-secondary/25 bg-secondary/5 p-4">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-secondary">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>bolt</span>
            USOM&apos;dan (ulusal listeden) öndeyiz
          </div>
          <p className="mt-1 text-[12px] text-on-surface-variant">
            Son {erkenlik.toplam} tespiti T.C. Siber Güvenlik Başkanlığı (USOM) ulusal zararlı-liste ile karşılaştırdık.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div><div className="font-display text-xl font-bold text-secondary tabular-nums">{erkenlik.usomdaYok}</div><div className="text-[10px] leading-tight text-on-surface-variant">USOM&apos;da HİÇ yok<br />(biz gördük)</div></div>
            <div><div className="font-display text-xl font-bold text-secondary tabular-nums">{erkenlik.bizOnce}</div><div className="text-[10px] leading-tight text-on-surface-variant">USOM&apos;dan önce{erkenlik.ortGun > 0 ? ` (ort ${erkenlik.ortGun}g)` : ""}</div></div>
            <div><div className="font-display text-xl font-bold text-on-surface-variant tabular-nums">{erkenlik.usomOnce}</div><div className="text-[10px] leading-tight text-on-surface-variant">USOM önce<br />görmüş</div></div>
          </div>
          {erkenlik.usomdaYok > 0 && (
            <p className="mt-2.5 text-[11px] font-medium text-secondary">
              Yakaladığımız <b>{erkenlik.usomdaYok}</b> tehdit ulusal listede bile yok — sizi <b>resmî radardan önce</b> koruyoruz.
            </p>
          )}
        </div>
      )}

      {/* ŞU AN VAR OLAN SAHTELERİ HEMEN TARA — marka seç YA DA link yaz (kayıt gerekmez) */}
      <div className="mt-4 rounded-3xl border border-outline-variant/40 bg-surface-lowest p-4">
        <p className="text-sm font-semibold text-on-surface">Şu an var olan sahteleri hemen tara</p>
        <p className="mt-1 text-[12px] text-on-surface-variant">
          Yukarıdan bir marka seç <b>ya da</b> aşağıya herhangi bir marka linki / alan adı yaz — kayıt gerekmez.
          Domaininden yüzlerce göz-aldatan varyasyon üretir, hangileri <b>canlı</b> onu bulur, analiz eder.
        </p>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          inputMode="url"
          autoCapitalize="none"
          placeholder="Marka linki / alan adı (ör. ern.com.tr)"
          className="mt-3 w-full rounded-2xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-[15px] text-on-surface outline-none focus:border-primary"
        />
        <button
          onClick={() => sahteTara()}
          disabled={taramaYuk || !(alanAdiCoz(link) || markalar.find((x) => x.anahtar === marka)?.resmi?.[0])}
          className="press mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-primary py-2.5 text-sm font-semibold text-primary disabled:opacity-50"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{taramaYuk ? "progress_activity" : "radar"}</span>
          {taramaYuk ? "Taranıyor (30-60 sn)…" : "Şimdi tara"}
        </button>

          {tarama && (
            <div className="mt-3">
              <p className="text-[12px] text-on-surface-variant">
                <b>{tarama.taranan}</b> varyasyon tarandı · <b className="text-error">{tarama.canli}</b> tanesi canlı.
              </p>
              <div className="mt-2 space-y-1.5">
                {tarama.sonuclar.map((s) => {
                  const renk = s.seviye === "Yüksek" ? "text-error" : s.seviye === "Orta" ? "text-primary" : "text-on-surface-variant";
                  return (
                    <div key={s.domain} className="flex items-center gap-2 rounded-xl bg-surface-low px-3 py-2">
                      <span className={`font-display text-sm font-bold ${renk}`}>%{s.skor}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-on-surface">{s.domain}</span>
                      {s.sinyaller.some((x) => /favicon/i.test(x)) && (
                        <span className="material-symbols-outlined text-error" style={{ fontSize: 15 }} title="Favicon birebir">verified</span>
                      )}
                      <a href={`/sorgula?q=${encodeURIComponent(s.domain)}`} className="shrink-0 text-[11px] font-medium text-primary underline">incele</a>
                    </div>
                  );
                })}
              </div>
              {tarama.digerCanli.length > 0 && (
                <p className="mt-2 break-all text-[11px] text-on-surface-variant">Canlı ama incelenmedi: {tarama.digerCanli.join(", ")}</p>
              )}
              <p className="mt-2 text-[10px] leading-relaxed text-on-surface-variant">
                Bunlar <b>aday</b>dır; bir kısmı markanın <b>kendi savunma domaini</b> ya da park edilmiş olabilir. Kesin &quot;sahte&quot; için inceleme gerekir.
              </p>
            </div>
          )}
        </div>

      {/* Rapor panosu */}
      {raporYuk && (
        <div className="mt-5 flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 18 }}>progress_activity</span>
          Rapor yükleniyor…
        </div>
      )}

      {rapor && (
        <div className="mt-5 overflow-hidden rounded-3xl border border-outline-variant/40">
          <div className="bg-primary-container/25 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Günlük Marka Koruma Raporu</p>
            <p className="font-display text-lg font-bold text-on-surface">{rapor.markaAdi} · {rapor.tarih}</p>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-surface-lowest p-3">
                <p className="font-display text-xl font-bold text-on-surface">{rapor.analiz}</p>
                <p className="text-[10px] text-on-surface-variant">analiz edilen domain</p>
              </div>
              <div className="rounded-2xl bg-error-container/40 p-3">
                <p className="font-display text-xl font-bold text-error">{rapor.yuksek.length}</p>
                <p className="text-[10px] text-on-surface-variant">yüksek-riskli taklit</p>
              </div>
              <div className="rounded-2xl bg-primary-container/25 p-3">
                <p className="font-display text-xl font-bold text-primary">{rapor.orta.length}</p>
                <p className="text-[10px] text-on-surface-variant">izlemede</p>
              </div>
            </div>

            {rapor.temiz ? (
              <div className="rounded-2xl bg-secondary-container p-4 text-center">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: 32 }}>verified_user</span>
                <p className="mt-1 text-sm font-semibold text-on-surface">Bugün temiz görünüyor</p>
                <p className="mt-0.5 text-[12px] text-on-surface-variant">
                  Taradığımız kaynaklarda markanızı taklit eden yüksek-riskli bir domain tespit etmedik.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-error">Yüksek-riskli taklit adayları</p>
                {rapor.yuksek.map((a) => (
                  <div key={a.domain} className="rounded-2xl bg-error-container/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-bold text-on-surface">{a.domain}</span>
                      <span className="shrink-0 font-display text-sm font-bold text-error">%{a.skor}</span>
                    </div>
                    {a.sinyaller?.some((s) => /favicon/i.test(s)) && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-error/15 px-2 py-0.5 text-[10px] font-bold text-error">
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>verified</span>
                        Favicon birebir — neredeyse kesin
                      </span>
                    )}
                    <a href={`/sorgula?q=${encodeURIComponent(a.domain)}`} className="mt-1 block text-[12px] font-medium text-primary underline">Tam raporu incele →</a>
                  </div>
                ))}
              </div>
            )}

            <p className="border-t border-outline-variant/20 pt-2 text-[10px] leading-relaxed text-on-surface-variant">
              Bu bir <b>izleme/erken-uyarı</b> hizmetidir; mutlak garanti değildir. Yalnızca taradığımız kaynaklarda (urlscan
              taraması + kara listeler), markanızı içeren resmî-olmayan domainleri kapsar. &quot;Tespit edilmedi&quot; = izlediğimiz kaynaklarda bulunamadı.
            </p>
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-on-surface-variant">
        Kurumsal marka koruma · Fiyatlandırma için iletişime geçin.
      </p>
    </div>
  );
}
