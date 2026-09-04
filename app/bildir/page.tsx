"use client";

import { useState } from "react";
import { cihazId } from "@/lib/device";
import { etkinlikEkle } from "@/lib/activity";
import OsintRaporu from "@/components/OsintRaporu";
import { dilekceUret } from "@/lib/dilekce";
import { merciOner } from "@/lib/merci";

// Kullanıcının seçebileceği suç türleri (boş = AI karar versin).
const SUC_TURLERI: { key: string; etiket: string; ikon: string }[] = [
  { key: "dolandiricilik", etiket: "Dolandırıcılık / oltalama", ikon: "phishing" },
  { key: "yasa_disi", etiket: "Yasa dışı bahis / içerik", ikon: "casino" },
  { key: "hakaret", etiket: "Hakaret / küfür", ikon: "sentiment_very_dissatisfied" },
  { key: "tehdit", etiket: "Tehdit / şantaj", ikon: "warning" },
  { key: "sahte_hesap", etiket: "Sahte hesap / taklit", ikon: "person_off" },
  { key: "", etiket: "Emin değilim — AI karar versin", ikon: "smart_toy" },
];

type Adim = { baslik: string; aciklama: string };
type Sonuc = {
  referansNo: string;
  kategori: string;
  kategoriAdi: string;
  ozet: string;
  gostergeler: { url: string[]; iban: string[]; telefon: string[] };
  kurumlar: string[];
  adimlar: Adim[];
  guven: "yüksek" | "orta" | "düşük" | "yok";
  aiIleUretildi: boolean;
};

export default function Bildir() {
  const [metin, setMetin] = useState("");
  const [secilenKategori, setSecilenKategori] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [hata, setHata] = useState("");
  const [tamamlanan, setTamamlanan] = useState<Set<number>>(new Set());
  const [ocrDurum, setOcrDurum] = useState("");
  const [dilekce, setDilekce] = useState<{ kurum: string; metin: string; ai?: boolean } | null>(null);
  const [dilekceYukleniyor, setDilekceYukleniyor] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);

  async function dilekceOlustur() {
    if (!sonuc || dilekceYukleniyor) return;
    const girdi = {
      kategori: sonuc.kategori,
      kategoriAdi: sonuc.kategoriAdi,
      ozet: sonuc.ozet,
      gostergeler: sonuc.gostergeler,
      referansNo: sonuc.referansNo,
    };
    setDilekceYukleniyor(true);
    try {
      // Akıllı dilekçe (AI varsa kişiselleştirir, yoksa sunucuda şablona düşer)
      const r = await fetch("/api/dilekce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ girdi }),
      });
      if (!r.ok) throw new Error();
      setDilekce(await r.json());
    } catch {
      // Ağ hatası → yerel şablon
      const tarih = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
      setDilekce(dilekceUret(girdi, tarih));
    } finally {
      setDilekceYukleniyor(false);
    }
  }
  function dilekceKopyala() {
    if (!dilekce) return;
    navigator.clipboard?.writeText(dilekce.metin);
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2000);
  }
  function dilekceIndir() {
    if (!dilekce || !sonuc) return;
    const blob = new Blob([dilekce.metin], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sikayet-dilekcesi-${sonuc.referansNo}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function gorselOku(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOcrDurum("Görsel okunuyor…");
    try {
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(file, "tur+eng", {
        logger: (m) => {
          if (m.status === "recognizing text")
            setOcrDurum(`Okunuyor… %${Math.round(m.progress * 100)}`);
        },
      });
      const okunan = (data.text || "").replace(/\s+\n/g, "\n").trim();
      if (okunan) {
        setMetin((m) => (m ? m.trim() + "\n" : "") + okunan);
        setOcrDurum("Görsel okundu — metni kontrol edip gönderebilirsin.");
      } else {
        setOcrDurum("Görselde okunacak metin bulunamadı.");
      }
    } catch {
      setOcrDurum("Görsel okunamadı, metni elle yazabilirsin.");
    }
  }

  async function gonder() {
    setYukleniyor(true);
    setHata("");
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metin, bildirenId: cihazId(), secilenKategori: secilenKategori ?? undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.hata || "Bir hata oluştu.");
      setSonuc(data);
      const g = data.gostergeler;
      const ilk = g.iban[0] || g.telefon[0] || g.url[0] || data.kategoriAdi;
      etkinlikEkle({ deger: ilk, tip: "bildirim", tur: "bildirim", supheli: true });
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setYukleniyor(false);
    }
  }

  function adimToggle(i: number) {
    setTamamlanan((prev) => {
      const y = new Set(prev);
      y.has(i) ? y.delete(i) : y.add(i);
      return y;
    });
  }

  if (sonuc) {
    const g = sonuc.gostergeler;
    const gosterge = [
      ...g.url.map((v) => ({ tip: "Site", v })),
      ...g.iban.map((v) => ({ tip: "IBAN", v })),
      ...g.telefon.map((v) => ({ tip: "Telefon", v })),
    ];
    return (
      <div className="px-5 pt-3 pb-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="animate-float h-20 w-20 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/casper-wave.webp" alt="MirLeon maskotu" className="h-full w-full object-contain" />
          </div>
          <div className="relative flex-1 rounded-2xl rounded-tl-sm bg-primary-container/15 p-3">
            <span className="absolute -left-1.5 top-3 h-3 w-3 rotate-45 bg-primary-container/15" />
            <p className="text-sm font-semibold text-on-surface">Raporun hazır! Panik yok.</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              Olayını inceledim. Aşağıda referans numaran, tespit ettiğim
              göstergeler ve senin için hazırladığım adımlar var.
            </p>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-on-surface-variant">Referans No</div>
              <div className="font-display text-lg font-semibold text-on-surface">
                {sonuc.referansNo}
              </div>
            </div>
            <span className="rounded-full bg-error-container px-3 py-1 text-sm font-medium text-error">
              {sonuc.kategoriAdi}
            </span>
          </div>
          <p className="mt-3 text-sm text-on-surface-variant">{sonuc.ozet}</p>

          <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${sonuc.guven === "yok" ? "bg-secondary-container/40 text-on-surface" : "bg-primary-container/15 text-on-surface"}`}>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>
              {sonuc.guven === "yok" ? "check_circle" : "gavel"}
            </span>
            <span>
              {sonuc.guven === "yok" ? (
                "Belirgin bir suç işareti bulunamadı — yine de göstergeleri kaydettik."
              ) : (
                <>
                  Bu içerik <b>{sonuc.kategoriAdi}</b> gibi görünüyor.{" "}
                  <span className="text-on-surface-variant">(güven: {sonuc.guven})</span>
                </>
              )}
            </span>
          </div>

          {gosterge.length > 0 && (
            <div className="mt-4 border-t border-outline-variant/40 pt-4">
              <div className="text-xs font-medium text-on-surface-variant">
                Tespit edilen göstergeler
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {gosterge.map((x, i) => (
                  <span key={i} className="rounded-lg bg-surface-low px-2.5 py-1 text-xs text-on-surface">
                    {x.tip}: {x.v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {(g.url[0] || g.iban[0] || g.telefon[0]) && (
          <OsintRaporu giris={g.url[0] || g.iban[0] || g.telefon[0]} />
        )}

        <h2 className="mt-6 mb-2 font-display text-lg font-medium text-on-surface">
          Şimdi yapman gerekenler
        </h2>
        <div className="space-y-2">
          {sonuc.adimlar.map((a, i) => {
            const bitti = tamamlanan.has(i);
            return (
              <button
                key={i}
                onClick={() => adimToggle(i)}
                className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  bitti
                    ? "border-secondary/30 bg-secondary-container/60"
                    : "border-outline-variant/20 bg-surface-lowest hover:bg-surface-low"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                    bitti ? "border-secondary bg-secondary text-white" : "border-outline-variant text-transparent"
                  }`}
                >
                  
                </span>
                <span>
                  <span className="block text-sm font-medium text-on-surface">{a.baslik}</span>
                  <span className="block text-sm text-on-surface-variant">{a.aciklama}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-on-surface-variant">
          {sonuc.aiIleUretildi
            ? "Bu yönlendirme yapay zeka ile üretildi, genel bilgi amaçlıdır."
            : "Genel bilgi amaçlıdır (demo modu — AI anahtarı tanımlı değil)."}
        </p>

        {/* Resmî mercie yönlendirme — suç türüne göre doğru kanal */}
        <div className="mt-6">
          <h2 className="mb-2 font-display text-lg font-medium text-on-surface">Nereye bildirmelisin?</h2>
          <div className="space-y-2">
            {merciOner(sonuc.kategori).map((m, i) => (
              <div
                key={i}
                className={`rounded-2xl border p-3.5 ${m.vurgu ? "border-primary/40 bg-primary-container/15" : "border-outline-variant/30 bg-surface-lowest"}`}
              >
                <div className="flex items-center gap-2">
                  {m.vurgu && <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>priority_high</span>}
                  <span className="text-sm font-semibold text-on-surface">{m.ad}</span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">{m.aciklama}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.link && (
                    <a href={m.link} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1 rounded-full border border-primary px-3 py-1 text-xs font-semibold text-primary">
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                      Başvur
                    </a>
                  )}
                  {m.email && (
                    <a href={`mailto:${m.email}`} className="press inline-flex items-center gap-1 rounded-full border border-outline-variant px-3 py-1 text-xs font-medium text-on-surface">
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>mail</span>
                      {m.email}
                    </a>
                  )}
                  {m.tel && (
                    <a href={`tel:${m.tel}`} className="press inline-flex items-center gap-1 rounded-full border border-error/40 px-3 py-1 text-xs font-semibold text-error">
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>call</span>
                      {m.tel}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resmi şikayet dilekçesi */}
        {!dilekce ? (
          <button
            onClick={dilekceOlustur}
            disabled={dilekceYukleniyor}
            className="press mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-secondary py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            <span className={`material-symbols-outlined ${dilekceYukleniyor ? "animate-spin" : ""}`} style={{ fontSize: 18 }}>
              {dilekceYukleniyor ? "progress_activity" : "description"}
            </span>
            {dilekceYukleniyor ? "Dilekçe yazılıyor…" : "Resmi şikayet dilekçesi oluştur"}
          </button>
        ) : (
          <div className="mt-5 rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-on-surface">Şikayet Dilekçesi</span>
              <div className="flex gap-2">
                <button onClick={dilekceKopyala} className="press rounded-full border border-outline-variant px-3 py-1 text-xs font-medium text-on-surface">
                  {kopyalandi ? "Kopyalandı " : "Kopyala"}
                </button>
                <button onClick={dilekceIndir} className="press rounded-full bg-primary px-3 py-1 text-xs font-medium text-on-primary">
                  İndir
                </button>
              </div>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-low p-3 text-[12px] leading-relaxed text-on-surface" style={{ fontFamily: "inherit" }}>{dilekce.metin}</pre>
            <p className="mt-2 text-[11px] text-on-surface-variant">
              [...] alanlarını kendi bilgilerinle doldur, sonra {dilekce.kurum.split(" ")[0]}... kanalına sun.
            </p>
          </div>
        )}

        <button
          onClick={() => { setSonuc(null); setMetin(""); setTamamlanan(new Set()); setDilekce(null); }}
          className="mt-6 rounded-full border border-outline-variant px-5 py-2 text-sm font-medium text-on-surface hover:bg-surface-low"
        >
          Yeni bildirim
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 pt-3 pb-6">
      <h1 className="font-display text-2xl font-semibold text-on-surface">Ne oldu, anlat</h1>
      <p className="mt-1 text-[15px] text-on-surface-variant">
        Karşılaştığın olayı bildir — seni doğru resmî mercie yönlendirip hazır dilekçe çıkaralım.
      </p>

      {/* Suç türü seçimi — doğru mercie yönlendirmenin temeli */}
      <p className="mt-5 text-sm font-semibold text-on-surface">Bu ne tür bir olay?</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {SUC_TURLERI.map((s) => {
          const aktif = (secilenKategori ?? "") === s.key && secilenKategori !== null;
          return (
            <button
              key={s.key || "auto"}
              onClick={() => setSecilenKategori(s.key)}
              className={`press flex items-center gap-2 rounded-2xl border p-3 text-left text-[13px] font-medium transition ${
                aktif
                  ? "border-primary bg-primary-container/25 text-on-surface"
                  : "border-outline-variant/40 bg-surface-lowest text-on-surface-variant hover:border-primary/50"
              }`}
            >
              <span className={`material-symbols-outlined ${aktif ? "text-primary" : "text-on-surface-variant"}`} style={{ fontSize: 20 }}>{s.ikon}</span>
              {s.etiket}
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-sm font-semibold text-on-surface">Olayı kendi cümlelerinle anlat</p>
      <textarea
        value={metin}
        onChange={(e) => setMetin(e.target.value)}
        rows={7}
        placeholder="Örn: Instagram'dan bir hesap ucuz telefon sattığını söyledi, TR12 0001 ... IBAN'ına 5000 TL yatırdım ama ürün gelmedi..."
        className="mt-4 w-full rounded-2xl border border-outline-variant bg-surface-lowest p-4 text-sm text-on-surface shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />

      <label className="press mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-outline-variant bg-surface-lowest py-3 text-sm font-medium text-on-surface-variant hover:border-primary hover:text-primary">
        <input type="file" accept="image/*" className="hidden" onChange={gorselOku} />
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>photo_camera</span>
        Ekran görüntüsü ekle (otomatik okunur)
      </label>
      {ocrDurum && <p className="mt-2 text-center text-xs text-on-surface-variant">{ocrDurum}</p>}

      {hata && <p className="mt-2 text-sm text-error">{hata}</p>}

      <button
        onClick={gonder}
        disabled={yukleniyor || metin.trim().length < 5}
        className="mt-4 w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-on-primary transition hover:bg-primary-container disabled:opacity-50"
      >
        {yukleniyor ? "Analiz ediliyor..." : "Raporumu oluştur"}
      </button>
    </div>
  );
}
