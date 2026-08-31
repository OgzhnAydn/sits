"use client";

import { useEffect, useRef, useState } from "react";

type Alan = { ad: string; deger: string };
type Infra = {
  domain: string;
  risk: number;
  seviye: "Yüksek" | "Orta" | "Düşük";
  alanlar: Alan[];
  ekranGoruntusu?: string;
  sayfa?: { baslik?: string } | null;
} | null;
type Baglanti = { deger: string; tip: string; sayi: number };
type GrafDugum = { id: string; tur: "account" | "domain" | "ip" | "asn" | "cert" | "ioc"; etiket: string; alt?: string; url?: string; risk?: number; kok?: boolean };
type GrafKenar = { kaynak: string; hedef: string; etiket: string };
type Graf = { dugumler: GrafDugum[]; kenarlar: GrafKenar[] };

type Sonuc = {
  platform: string | null;
  kullanici: string;
  profilUrl?: string | null;
  risk: number;
  seviye: "Yüksek" | "Orta" | "Düşük";
  ozet: string;
  neden: string[];
  adimlar: string[];
  infra: Infra;
  baglantilar: Baglanti[];
  graf?: Graf | null;
  yetersiz?: boolean;
  ai: boolean;
};

const DUGUM_STIL: Record<GrafDugum["tur"], { ikon: string; renk: string; ad: string }> = {
  account: { ikon: "account_circle", renk: "text-primary", ad: "Hesap" },
  domain: { ikon: "language", renk: "text-secondary", ad: "Domain" },
  ip: { ikon: "dns", renk: "text-on-surface-variant", ad: "IP" },
  asn: { ikon: "hub", renk: "text-on-surface-variant", ad: "ASN" },
  cert: { ikon: "verified", renk: "text-on-surface-variant", ad: "Sertifika" },
  ioc: { ikon: "warning", renk: "text-error", ad: "Gösterge" },
};
const KENAR_AD: Record<string, string> = {
  website: "site", resolves: "çözülür", asn: "ağ", cert: "sertifika",
  linked: "aynı ad", "co-reported": "birlikte bildirildi", ioc: "gösterge",
};

// Kimlik/altyapı grafiğini kökten indirgeyerek iç içe ağaç olarak çizer (döngü korumalı).
function GrafGorunum({ graf }: { graf: Graf }) {
  const harita = new Map(graf.dugumler.map((d) => [d.id, d]));
  const komsu = new Map<string, { hedef: string; etiket: string }[]>();
  for (const k of graf.kenarlar) {
    if (!komsu.has(k.kaynak)) komsu.set(k.kaynak, []);
    komsu.get(k.kaynak)!.push({ hedef: k.hedef, etiket: k.etiket });
  }
  const kok = graf.dugumler.find((d) => d.kok) || graf.dugumler[0];
  if (!kok) return null;

  const Dugum = ({ id, etiket, derinlik, ziyaret }: { id: string; etiket?: string; derinlik: number; ziyaret: Set<string> }) => {
    const d = harita.get(id);
    if (!d || ziyaret.has(id) || derinlik > 4) return null;
    ziyaret.add(id);
    const st = DUGUM_STIL[d.tur];
    const cocuklar = komsu.get(id) || [];
    return (
      <div className={derinlik > 0 ? "ml-3 border-l border-outline-variant/40 pl-3" : ""}>
        <div className="flex items-center gap-2 py-1">
          <span className={`material-symbols-outlined ${st.renk}`} style={{ fontSize: 18 }}>{st.ikon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {etiket && <span className="rounded bg-surface-low px-1 text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant">{etiket}</span>}
              <span className="truncate text-[13px] font-semibold text-on-surface">{d.etiket}</span>
              {typeof d.risk === "number" && d.risk >= 30 && (
                <span className="shrink-0 rounded-full bg-error-container px-1.5 text-[10px] font-bold text-error">%{d.risk}</span>
              )}
            </div>
            {d.alt && <div className="truncate text-[11px] text-on-surface-variant">{d.alt}</div>}
          </div>
          <span className="shrink-0 text-[9px] uppercase text-on-surface-variant/70">{st.ad}</span>
        </div>
        {cocuklar.map((c, i) => (
          <Dugum key={`${c.hedef}-${i}`} id={c.hedef} etiket={KENAR_AD[c.etiket] || c.etiket} derinlik={derinlik + 1} ziyaret={ziyaret} />
        ))}
      </div>
    );
  };

  return <Dugum id={kok.id} derinlik={0} ziyaret={new Set()} />;
}

type FotoSonuc = { skor: number; gercek: boolean; gorselYorum?: { tur: string; ozet: string } | null };

const RENK: Record<string, { kart: string; renk: string; ikon: string }> = {
  "Yüksek": { kart: "bg-error-container", renk: "text-error", ikon: "gpp_bad" },
  "Orta": { kart: "bg-primary-container/25", renk: "text-primary", ikon: "gpp_maybe" },
  "Düşük": { kart: "bg-secondary-container", renk: "text-secondary", ikon: "verified_user" },
};

export default function SahteHesap() {
  const [giris, setGiris] = useState("");
  const [link, setLink] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [s, setS] = useState<Sonuc | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false);
  const [fotoSonuc, setFotoSonuc] = useState<FotoSonuc | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  // Sonucu sosyal medyaya paylaş (viral döngü: sonuç → paylaş → yeni kullanıcı)
  async function paylasSonuc() {
    if (!s) return;
    const durum = s.yetersiz ? "değerlendirmek için yeterli veri yok" : `%${s.risk} ${s.seviye.toLowerCase()} risk`;
    const metin = `SİTS ile @${s.kullanici} hesabını kontrol ettim: ${durum}. Sen de şüpheli hesap / link / IBAN'ı kontrol et 👇`;
    const url = "https://siber-bildir-web.vercel.app";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "SİTS — Nazar", text: metin, url });
      } else {
        await navigator.clipboard.writeText(`${metin} ${url}`);
        setKopyalandi(true);
        setTimeout(() => setKopyalandi(false), 2000);
      }
    } catch {
      /* kullanıcı paylaşımı iptal etti */
    }
  }

  // Ana sayfadan ?q= (@hesap ya da profil linki) ile gelindiyse otomatik çalış
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      // SAVUNMA: buraya bir MESAJ düştüyse (tek handle/profil değil) hesap analizi
      // "yeterli veri yok" der. Onu dolandırıcılık kontrolüne (/sorgula) yönlendir.
      const s = q.trim();
      const handleVeyaProfil = /^@?[\w.]{2,40}$/.test(s) || /^(https?:\/\/)?(www\.)?(instagram|twitter|x|facebook|tiktok|t\.me|telegram)\.com\/[\w.@/-]+$/i.test(s);
      if (!handleVeyaProfil) { window.location.replace(`/sorgula?q=${encodeURIComponent(s)}`); return; }
      setGiris(q);
      kontrolEt(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function kontrolEt(deger?: string) {
    const hedef = (deger ?? giris).trim();
    if (hedef.length < 2 || yukleniyor) return;
    setYukleniyor(true);
    setS(null);
    try {
      const r = await fetch("/api/hesap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giris: hedef, link: link.trim() || undefined }),
      });
      const d = await r.json();
      if (r.ok) setS(d);
    } finally {
      setYukleniyor(false);
    }
  }

  async function fotoKontrol(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFoto(URL.createObjectURL(f));
    setFotoSonuc(null);
    setFotoYukleniyor(true);
    try {
      const fd = new FormData();
      fd.append("gorsel", f);
      const r = await fetch("/api/gorsel", { method: "POST", body: fd });
      const d = await r.json();
      setFotoSonuc({ skor: d.skor, gercek: d.gercek, gorselYorum: d.gorselYorum });
    } catch {
      // sessiz
    } finally {
      setFotoYukleniyor(false);
    }
  }

  const renk = s ? RENK[s.seviye] : null;

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Sahte hesap mı?</h1>
          <p className="text-[13px] text-on-surface-variant">Profil linki ya da kullanıcı adını gir — birlikte bakalım.</p>
        </div>
      </div>

      {/* Giriş */}
      <div className="mt-5 flex items-center gap-2 rounded-full bg-surface-lowest py-2 pl-4 pr-2 soft">
        <span className="material-symbols-outlined shrink-0 text-on-surface-variant" style={{ fontSize: 20 }}>alternate_email</span>
        <input
          value={giris}
          onChange={(e) => setGiris(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && kontrolEt()}
          placeholder="instagram.com/kullanici ya da @kullanici"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-on-surface-variant"
        />
        <button
          onClick={() => kontrolEt()}
          disabled={yukleniyor || giris.trim().length < 2}
          className="press shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold text-on-primary shadow-glow disabled:opacity-50"
          style={{ background: "var(--gradient-primary)" }}
        >
          {yukleniyor ? "…" : "Kontrol"}
        </button>
      </div>

      {/* İttiği link — asıl tehlike burada; altyapıyı OSINT motoruna sokarız */}
      <div className="mt-2 flex items-center gap-2 rounded-full bg-surface-lowest/70 py-1.5 pl-4 pr-2 border border-outline-variant/25">
        <span className="material-symbols-outlined shrink-0 text-on-surface-variant" style={{ fontSize: 18 }}>link</span>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && kontrolEt()}
          placeholder="Bio'daki / yönlendirdiği link (varsa) — altyapısını da tararız"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] outline-none placeholder:text-on-surface-variant"
        />
      </div>

      {/* Sonuç */}
      {s && renk && (
        <div className="fade-up mt-5">
          {s.yetersiz ? (
            /* Sinyal yok → "temiz" DEĞİL, "yeterli veri yok" — yeşil yanılgısını önle */
            <div className="flex items-start gap-4 rounded-3xl bg-surface-low p-5">
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 40 }}>help</span>
              <div className="flex-1">
                <div className="font-display text-lg font-semibold text-on-surface">Yeterli veri yok</div>
                <div className="mt-0.5 text-[13px] leading-relaxed text-on-surface-variant">
                  Bu hesabı gerçek/sahte diye değerlendirecek belirgin bir işaret yok. Bu <b>&quot;temiz&quot; demek değil.</b> Daha net sonuç için <b>profil fotosunu yükle</b> ya da hesabın <b>bio/yönlendirme linkini</b> ekle.
                </div>
              </div>
            </div>
          ) : (
            <div className={`flex items-center gap-4 rounded-3xl p-5 ${renk.kart}`}>
              <span className={`material-symbols-outlined ${renk.renk}`} style={{ fontSize: 44 }}>{renk.ikon}</span>
              <div className="flex-1">
                <div className={`font-display text-xl font-semibold ${renk.renk}`}>{s.seviye} risk</div>
                <div className="text-sm text-on-surface-variant">{s.ozet}</div>
              </div>
              <div className="text-right">
                <div className={`font-display text-2xl font-bold ${renk.renk}`}>%{s.risk}</div>
              </div>
            </div>
          )}

          <div className="mt-2 px-1 text-[12px] text-on-surface-variant">
            {s.platform ? `${s.platform} · ` : ""}@{s.kullanici}
          </div>

          <button onClick={paylasSonuc} className="press mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/5 py-2.5 text-sm font-semibold text-primary">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>share</span>
            {kopyalandi ? "Kopyalandı ✓" : "Sonucu paylaş"}
          </button>

          {/* Neden — minik Nazar */}
          {s.neden.length > 0 && (
            <div className="mt-4 rounded-2xl bg-surface-low p-4">
              <div className="mb-2 text-xs font-semibold text-on-surface-variant">Neden böyle değerlendirdik?</div>
              <div className="space-y-2">
                {s.neden.map((n, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-on-surface">
                    <span className="mt-0.5 h-4 w-4 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/casper-wave.webp" alt="" className="h-full w-full object-contain" />
                    </span>
                    <span className="flex-1">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INFRA — hesabın ittiği altyapının delil kartı */}
          {s.infra && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-lowest">
              <div className="flex items-center gap-2 border-b border-outline-variant/30 px-4 py-2.5">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>dns</span>
                <span className="text-sm font-bold text-on-surface">Hesabın ittiği altyapı</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${RENK[s.infra.seviye].kart} ${RENK[s.infra.seviye].renk}`}>
                  {s.infra.seviye} · %{s.infra.risk}
                </span>
              </div>
              <div className="px-4 py-3">
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 16 }}>link</span>
                  {s.infra.domain}
                </div>
                {s.infra.ekranGoruntusu && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={s.infra.ekranGoruntusu} alt="Site görünümü" className="mb-3 w-full rounded-lg border border-outline-variant/30" />
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {s.infra.alanlar.slice(0, 10).map((a, i) => (
                    <div key={i} className="min-w-0">
                      <div className="truncate text-[10px] uppercase tracking-wide text-on-surface-variant">{a.ad}</div>
                      <div className="truncate text-[12px] font-medium text-on-surface">{a.deger}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* IDENTITY GRAPH — entite/altyapı ilişki grafiği (kişi kolu yok) */}
          {s.graf && s.graf.dugumler.length > 1 && (
            <div className="mt-4 rounded-2xl border border-outline-variant/40 bg-surface-lowest p-4">
              <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-on-surface">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>account_tree</span>
                İlişki grafiği
              </div>
              <p className="mb-2.5 text-[11px] text-on-surface-variant">Hesap → site → altyapı → tehdit istihbaratı zinciri. Kişisel kimlik verisi içermez.</p>
              <GrafGorunum graf={s.graf} />
              {s.graf.kenarlar.some((k) => k.etiket === "linked") && (
                <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-surface-low p-2 text-[11px] text-on-surface-variant">
                  <span className="material-symbols-outlined shrink-0 text-on-surface-variant" style={{ fontSize: 14 }}>info</span>
                  <span>&quot;Aynı ad&quot; ile işaretli hesaplar yalnızca <b>aynı kullanıcı adını</b> taşır — <b>aynı kişiye ait olmayabilir</b> (özellikle yaygın adlarda).</span>
                </p>
              )}
            </div>
          )}

          {/* Adımlar */}
          {s.adimlar.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-semibold text-on-surface-variant">Ne yapmalısın?</div>
              <ol className="space-y-1.5">
                {s.adimlar.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-on-surface">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary-container text-[11px] font-semibold text-on-secondary-container">{i + 1}</span>
                    {a}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Profil fotoğrafı kontrolü */}
          <div className="mt-5 rounded-2xl border border-outline-variant/30 bg-surface-lowest p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-on-surface">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>account_circle</span>
              Profil fotoğrafını da kontrol et
            </p>
            <p className="mt-1 text-[12px] text-on-surface-variant">Çalıntı ya da yapay zeka üretimi fotoğraflar sahte hesabın en güçlü işaretidir.</p>

            <button onClick={() => fotoRef.current?.click()} className="press mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-2.5 text-sm font-semibold text-primary">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_photo_alternate</span>
              Profil fotosunu yükle
            </button>
            <input ref={fotoRef} type="file" accept="image/*" onChange={fotoKontrol} className="hidden" />

            {foto && (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto} alt="Profil" className="h-16 w-16 rounded-xl object-cover" />
                <div className="min-w-0 flex-1 text-[13px]">
                  {fotoYukleniyor ? (
                    <span className="text-on-surface-variant">İnceleniyor…</span>
                  ) : fotoSonuc ? (
                    fotoSonuc.gercek ? (
                      <>
                        <p className="font-semibold text-on-surface">Yapay/oynanmış olma şüphesi: %{fotoSonuc.skor}</p>
                        {fotoSonuc.gorselYorum && <p className="text-on-surface-variant">{fotoSonuc.gorselYorum.ozet}</p>}
                      </>
                    ) : (
                      <span className="text-on-surface-variant">Deepfake analizi için Sightengine anahtarı gerekli (kural tabanlı kısım yine çalışır).</span>
                    )
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <p className="mt-4 text-center text-[11px] text-on-surface-variant">
            {s.ai ? "Değerlendirme yapay zeka ile üretildi." : "Platform verisine erişimimiz yok; bu bir olasılık değerlendirmesidir, kesin hüküm değildir."}
          </p>
        </div>
      )}

      {!s && !yukleniyor && (
        <p className="mt-4 text-xs text-on-surface-variant">Örnek: instagram.com/garanti_destek2025</p>
      )}
    </div>
  );
}
