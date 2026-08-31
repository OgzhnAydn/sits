"use client";

import { useCallback, useRef, useState } from "react";
import { etkinlikEkle } from "@/lib/activity";
import OsintRaporu from "@/components/OsintRaporu";

/* ---------- tipler ---------- */
type Deepfake = {
  aiOlasilik: number;
  deepfakeOlasilik: number;
  skor: number;
  seviye: "Yüksek" | "Orta" | "Düşük";
  bulgular: string[];
  saglayici: "sightengine" | "yok";
  gercek: boolean;
  yorum: { ozet: string; adimlar: string[] };
  gorselYorum?: {
    tur: string;
    risk: number;
    ozet: string;
    taktik: string[];
    gostergeler?: { iban?: string[]; telefon?: string[]; url?: string[] };
    adimlar: string[];
  } | null;
};
type Gosterge = { tip: string; deger: string; durum: string; benzersiz: number };
type Kontrol = {
  genel: "tehlikeli" | "dikkat" | "temiz";
  kategori: string;
  kategoriAdi: string;
  guven: string;
  sonuclar: Gosterge[];
  birincil: string | null;
};

/* BarcodeDetector tarayıcı API'si (standart tip yok) */
interface BarcodeDetectorLike {
  detect(src: ImageBitmap): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
}

/* ---------- görsel yardımcıları ---------- */
async function qrOku(file: File): Promise<string | null> {
  // 1) Hızlı yol: tarayıcının yerel motoru (Android Chrome vb.)
  try {
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (Ctor) {
      const det = new Ctor({ formats: ["qr_code"] });
      const bmp = await createImageBitmap(file);
      const kodlar = await det.detect(bmp);
      bmp.close?.();
      if (kodlar?.[0]?.rawValue) return kodlar[0].rawValue.trim();
    }
  } catch {
    // yerel motor yoksa/başarısızsa yedeğe düş
  }
  // 2) Evrensel yedek: jsQR (her tarayıcıda çalışır)
  try {
    const jsQR = (await import("jsqr")).default;
    const bmp = await createImageBitmap(file);
    // Çok büyük görselleri hız için küçült (uzun kenar ≤ 1600px)
    const olcek = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * olcek);
    const h = Math.round(bmp.height * olcek);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bmp.close?.(); return null; }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const imgData = ctx.getImageData(0, 0, w, h);
    const kod = jsQR(imgData.data, w, h, { inversionAttempts: "attemptBoth" });
    return kod?.data?.trim() || null;
  } catch {
    return null;
  }
}

async function ocrOku(file: File, ilerle: (s: string) => void): Promise<string> {
  try {
    const Tesseract = (await import("tesseract.js")).default;
    const { data } = await Tesseract.recognize(file, "tur+eng", {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") ilerle(`Yazı okunuyor… %${Math.round(m.progress * 100)}`);
      },
    });
    return (data.text || "").replace(/\s+\n/g, "\n").trim();
  } catch {
    return "";
  }
}

/* ---------- görsel etiketleri ---------- */
const RENK: Record<string, { bar: string; kart: string; renk: string; ikon: string; baslik: string }> = {
  "Yüksek": { bar: "bg-error", kart: "bg-error-container", renk: "text-error", ikon: "gpp_bad", baslik: "Yüksek şüphe" },
  "Orta": { bar: "bg-primary", kart: "bg-primary-container/25", renk: "text-primary", ikon: "gpp_maybe", baslik: "Şüpheli" },
  "Düşük": { bar: "bg-secondary", kart: "bg-secondary-container", renk: "text-secondary", ikon: "verified_user", baslik: "Belirgin iz yok" },
};
const GENEL: Record<string, { baslik: string; alt: string; ikon: string; kart: string; renk: string }> = {
  tehlikeli: { baslik: "TEHLİKELİ", alt: "İşlem yapma, bilgi girme, ödeme yapma.", ikon: "gpp_bad", kart: "bg-error-container", renk: "text-error" },
  dikkat: { baslik: "DİKKATLİ OL", alt: "Kesin değil ama şüpheli işaretler var.", ikon: "gpp_maybe", kart: "bg-primary-container/25", renk: "text-primary" },
  temiz: { baslik: "Belirgin tehlike yok", alt: "Yine de tam güvenli demek değildir.", ikon: "verified_user", kart: "bg-secondary-container", renk: "text-secondary" },
};
const TIP_IKON: Record<string, string> = { iban: "account_balance_wallet", telefon: "call", url: "link" };
const TIP_ADI: Record<string, string> = { iban: "IBAN", telefon: "Telefon", url: "Site" };
const DURUM: Record<string, { etiket: string; sinif: string }> = {
  dogrulandi: { etiket: "Dolandırıcı — bildirilmiş", sinif: "bg-error/10 text-error border-error/20" },
  liste: { etiket: "Zararlı listede", sinif: "bg-error/10 text-error border-error/20" },
  az: { etiket: "Az bildirim var", sinif: "bg-primary/10 text-primary border-primary/20" },
  temiz: { etiket: "Kaydımızda yok", sinif: "bg-secondary/10 text-secondary border-secondary/20" },
};

export default function GorselKontrol() {
  const [onizleme, setOnizleme] = useState<string | null>(null);
  const [surukle, setSurukle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const girisRef = useRef<HTMLInputElement>(null);
  const kameraRef = useRef<HTMLInputElement>(null);

  const [tarama, setTarama] = useState<string | null>(null); // QR+OCR+kontrol durumu
  const [qr, setQr] = useState<string | null>(null);
  const [ocr, setOcr] = useState<string>("");
  const [kontrol, setKontrol] = useState<Kontrol | null>(null);

  const [dfYukleniyor, setDfYukleniyor] = useState(false);
  const [deepfake, setDeepfake] = useState<Deepfake | null>(null);

  const analizEt = useCallback(async (dosya: File) => {
    if (!dosya.type.startsWith("image/")) {
      setHata("Sadece görsel (JPG/PNG/WebP) yükleyebilirsin.");
      return;
    }
    // sıfırla
    setHata(null);
    setQr(null); setOcr(""); setKontrol(null); setDeepfake(null);
    setOnizleme(URL.createObjectURL(dosya));

    // 1) Deepfake/AI (sunucu) — paralel başlat
    setDfYukleniyor(true);
    const dfForm = new FormData();
    dfForm.append("gorsel", dosya);
    void fetch("/api/gorsel", { method: "POST", body: dfForm })
      .then((r) => r.json())
      .then((d) => { if (!d.hata || d.saglayici) setDeepfake(d); })
      .catch(() => {})
      .finally(() => setDfYukleniyor(false));

    // 2) QR + OCR (tarayıcıda, ücretsiz)
    setTarama("Fotoğraf taranıyor…");
    const [qrDeger, ocrMetin] = await Promise.all([
      qrOku(dosya),
      ocrOku(dosya, (s) => setTarama(s)),
    ]);
    setQr(qrDeger);
    setOcr(ocrMetin);

    // 3) Bulunan metni mevcut dolandırıcılık motoruna sok
    const birlesik = [qrDeger, ocrMetin].filter(Boolean).join("\n").trim();
    if (birlesik.length >= 3) {
      setTarama("İçindekiler kontrol ediliyor…");
      try {
        const r = await fetch("/api/kontrol", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metin: birlesik }),
        });
        const d: Kontrol = await r.json();
        if (r.ok) {
          setKontrol(d);
          if (d.birincil) {
            const b = d.sonuclar.find((s) => s.deger === d.birincil);
            etkinlikEkle({ deger: d.birincil, tip: b?.tip || "url", supheli: d.genel !== "temiz" });
          }
        }
      } catch {}
    }
    setTarama(null);
  }, []);

  function dosyaSec(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) analizEt(f);
  }
  function birak(e: React.DragEvent) {
    e.preventDefault();
    setSurukle(false);
    const f = e.dataTransfer.files?.[0];
    if (f) analizEt(f);
  }
  async function yapistir() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const tur = it.types.find((t) => t.startsWith("image/"));
        if (tur) { const blob = await it.getType(tur); analizEt(new File([blob], "pano.png", { type: tur })); return; }
      }
      setHata("Panoda görsel yok. Önce bir fotoğraf kopyala.");
    } catch {
      setHata("Panoya erişilemedi. Dosya seçerek dene.");
    }
  }
  function temizle() {
    setOnizleme(null); setQr(null); setOcr(""); setKontrol(null); setDeepfake(null); setHata(null); setTarama(null);
  }

  const dfRenk = deepfake?.gercek ? RENK[deepfake.seviye] : null;
  const bittiBirsey = qr !== null || ocr !== "" || kontrol !== null;

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="" className="h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Fotoğrafla sor</h1>
          <p className="text-[13px] text-on-surface-variant">
            Ekran görüntüsü, QR ya da profil fotosu at — link, IBAN, numara ve deepfake&apos;i birlikte tararım.
          </p>
        </div>
      </div>

      {/* Yükleme alanı */}
      <div
        onDragOver={(e) => { e.preventDefault(); setSurukle(true); }}
        onDragLeave={() => setSurukle(false)}
        onDrop={birak}
        onClick={() => girisRef.current?.click()}
        className={`press mt-5 grid cursor-pointer place-items-center rounded-3xl border-2 border-dashed p-8 text-center transition-colors ${
          surukle ? "border-primary bg-primary/5" : "border-outline-variant bg-surface-lowest"
        }`}
      >
        {onizleme ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={onizleme} alt="Yüklenen görsel" className="max-h-56 rounded-2xl object-contain" />
        ) : (
          <>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 44 }}>add_a_photo</span>
            <p className="mt-2 text-sm font-semibold text-on-surface">Fotoğrafı buraya sürükle ya da tıkla</p>
            <p className="mt-1 text-xs text-on-surface-variant">Ekran görüntüsü · QR · profil fotosu — JPG/PNG/WebP</p>
          </>
        )}
        <input ref={girisRef} type="file" accept="image/*" onChange={dosyaSec} className="hidden" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => kameraRef.current?.click()} className="press flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>qr_code_scanner</span>
          Kamera ile QR tara
        </button>
        {/* Mobilde arka kamerayı açar → QR'ı çek, otomatik çözülüp analiz edilir */}
        <input ref={kameraRef} type="file" accept="image/*" capture="environment" onChange={dosyaSec} className="hidden" />
        <button onClick={yapistir} className="press flex items-center gap-1.5 rounded-full border border-outline-variant px-4 py-2.5 text-sm font-medium text-on-surface">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>content_paste</span>
          Panodan yapıştır
        </button>
        {onizleme && (
          <button onClick={temizle} className="press flex items-center gap-1.5 rounded-full border border-outline-variant px-4 py-2.5 text-sm font-medium text-on-surface">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            Temizle
          </button>
        )}
      </div>

      {hata && <div className="mt-4 rounded-2xl bg-error-container p-3 text-sm text-on-error-container">{hata}</div>}

      {/* Tarama durumu */}
      {tarama && (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 18 }}>progress_activity</span>
          {tarama}
        </div>
      )}

      {/* Fotoğrafta bulunanlar */}
      {!tarama && onizleme && bittiBirsey && (
        <div className="fade-up mt-5">
          <div className="mb-2 text-xs font-semibold text-on-surface-variant">Fotoğrafta bulunanlar</div>
          <div className="space-y-2">
            {qr && (
              <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/20 bg-surface-lowest p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>qr_code_2</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-on-surface">{qr}</div>
                  <div className="text-[12px] text-on-surface-variant">QR kod içeriği</div>
                </div>
              </div>
            )}
            {ocr && (
              <details className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-3">
                <summary className="flex cursor-pointer items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>text_fields</span>
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-on-surface">Fotoğraftaki yazı okundu</span>
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }}>expand_more</span>
                </summary>
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-[13px] text-on-surface-variant">{ocr}</p>
              </details>
            )}
            {!qr && !ocr && (
              <p className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-3 text-sm text-on-surface-variant">
                Fotoğrafta QR ya da okunabilir yazı bulamadım — yine de aşağıda gerçeklik analizini yaptım.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Claude Vision — Nazar'ın görsel değerlendirmesi */}
      {!tarama && deepfake?.gorselYorum && deepfake.gorselYorum.tur !== "Belirsiz" && (
        <div className="fade-up mt-5">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
            </div>
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-primary-container/15 p-3.5">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>auto_awesome</span>
                  {deepfake.gorselYorum.tur}
                </span>
                <span className="text-[11px] font-semibold text-on-surface-variant">%{deepfake.gorselYorum.risk} risk</span>
              </div>
              <p className="text-sm font-semibold text-on-surface">{deepfake.gorselYorum.ozet}</p>
              {deepfake.gorselYorum.taktik?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {deepfake.gorselYorum.taktik.map((t, i) => (
                    <span key={i} className="rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-medium text-error">{t}</span>
                  ))}
                </div>
              )}
              {deepfake.gorselYorum.adimlar?.length > 0 && (
                <ol className="mt-2.5 space-y-1.5">
                  {deepfake.gorselYorum.adimlar.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-on-surface">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary-container text-[11px] font-semibold text-on-secondary-container">{i + 1}</span>
                      {a}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {/* İçerik kontrol sonucu (link/IBAN/telefon) */}
      {!tarama && kontrol && kontrol.sonuclar.length > 0 && (
        <div className="fade-up mt-5">
          <div className={`flex items-center gap-4 rounded-3xl p-5 ${GENEL[kontrol.genel].kart}`}>
            <span className={`material-symbols-outlined ${GENEL[kontrol.genel].renk}`} style={{ fontSize: 44 }}>{GENEL[kontrol.genel].ikon}</span>
            <div>
              <div className={`font-display text-xl font-semibold ${GENEL[kontrol.genel].renk}`}>{GENEL[kontrol.genel].baslik}</div>
              <div className="text-sm text-on-surface-variant">{GENEL[kontrol.genel].alt}</div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {kontrol.sonuclar.map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-outline-variant/20 bg-surface-lowest p-3">
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }}>{TIP_IKON[s.tip]}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-on-surface">{s.deger}</div>
                  <div className="text-[12px] text-on-surface-variant">{TIP_ADI[s.tip]}</div>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${DURUM[s.durum].sinif}`}>{DURUM[s.durum].etiket}</span>
              </div>
            ))}
          </div>
          {kontrol.birincil && <OsintRaporu key={kontrol.birincil} giris={kontrol.birincil} />}
        </div>
      )}

      {/* Deepfake / AI analizi */}
      {dfYukleniyor && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 16 }}>progress_activity</span>
            Görselin gerçekliği inceleniyor…
          </div>
          <div className="skeleton h-4 w-1/2" />
          <div className="mt-3 space-y-2"><div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-5/6" /></div>
        </div>
      )}

      {deepfake && !deepfake.gercek && onizleme && (
        <div className="mt-5 rounded-2xl border border-warning/30 bg-tertiary/10 p-4 text-sm text-on-surface">
          <p className="font-semibold">Deepfake analizi henüz aktif değil.</p>
          <p className="mt-1 text-on-surface-variant">
            Çalışması için <code className="rounded bg-surface-high px-1">.env.local</code> içine <b>SIGHTENGINE_USER</b> ve <b>SIGHTENGINE_SECRET</b> ekle, sunucuyu yeniden başlat. (QR ve yazı okuma anahtarsız çalışır.)
          </p>
        </div>
      )}

      {deepfake?.gercek && dfRenk && (
        <div className="fade-up mt-5">
          <div className="mb-2 text-xs font-semibold text-on-surface-variant">Görselin gerçekliği</div>
          <div className={`flex items-center gap-4 rounded-3xl p-5 ${dfRenk.kart}`}>
            <span className={`material-symbols-outlined ${dfRenk.renk}`} style={{ fontSize: 44 }}>{dfRenk.ikon}</span>
            <div className="flex-1">
              <div className={`font-display text-xl font-semibold ${dfRenk.renk}`}>{dfRenk.baslik}</div>
              <div className="text-sm text-on-surface-variant">{deepfake.yorum.ozet}</div>
            </div>
            <div className="text-right">
              <div className={`font-display text-2xl font-bold ${dfRenk.renk}`}>%{deepfake.skor}</div>
              <div className="text-[11px] text-on-surface-variant">şüphe</div>
            </div>
          </div>
          <div className="mt-4 space-y-3 rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4">
            <Olcum ad="Yapay zeka üretimi" deger={deepfake.aiOlasilik} />
            <Olcum ad="Deepfake (yüz değiştirme)" deger={deepfake.deepfakeOlasilik} />
          </div>
          {deepfake.yorum.adimlar.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-semibold text-on-surface-variant">Ne yapmalısın?</div>
              <ol className="space-y-1.5">
                {deepfake.yorum.adimlar.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-on-surface">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary-container text-[11px] font-semibold text-on-secondary-container">{i + 1}</span>
                    {a}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="mt-4 text-[11px] text-on-surface-variant">Sightengine ile analiz edildi. Tespit %100 kesin değildir; tek başına kanıt sayma.</p>
        </div>
      )}
    </div>
  );
}

function Olcum({ ad, deger }: { ad: string; deger: number }) {
  const renk = deger >= 70 ? "bg-error" : deger >= 40 ? "bg-primary" : "bg-secondary";
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-on-surface-variant">{ad}</span>
        <span className="font-semibold text-on-surface">%{deger}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-high">
        <div className={`h-full ${renk} transition-[width] duration-700 ease-out`} style={{ width: `${deger}%` }} />
      </div>
    </div>
  );
}
