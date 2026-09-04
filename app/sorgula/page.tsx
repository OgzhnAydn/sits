"use client";

import { useEffect, useState, useCallback } from "react";
import { etkinlikEkle } from "@/lib/activity";
import { cihazId } from "@/lib/device";
import OsintRaporu from "@/components/OsintRaporu";

type Gosterge = { tip: string; deger: string; durum: string; benzersiz: number };
type Kontrol = {
  genel: "tehlikeli" | "dikkat" | "temiz";
  kategori: string;
  kategoriAdi: string;
  guven: string;
  mesajYorum?: { risk: "yuksek" | "orta" | "dusuk"; gerekce: string; taktikler: string[]; ai: boolean };
  sonuclar: Gosterge[];
  birincil: string | null;
  sosyal: { oncekiSoran: number; benzersizBildiren: number } | null;
  kampanya: { benzersiz: number; ilkDefaGorulmedi: boolean } | null;
  marka: { marka: string; tip: string; gorulen: string; mesaj: string } | null;
};

type Varlik = { tip: string; deger: string; risk: number; seviye: string; ozet: string };
type Profil = {
  skor: number;
  seviye: "Yüksek" | "Orta" | "Düşük";
  varliklar: Varlik[];
  organize: boolean;
  varlikSayisi: number;
};

const TIP_IKON: Record<string, string> = { iban: "account_balance_wallet", telefon: "call", url: "link", kripto: "currency_bitcoin" };
const TIP_ADI: Record<string, string> = { iban: "IBAN", telefon: "Telefon", url: "Site", kripto: "Kripto cüzdan" };

const DURUM: Record<string, { etiket: string; sinif: string }> = {
  dogrulandi: { etiket: "Dolandırıcı — bildirilmiş", sinif: "bg-error/10 text-error border-error/20" },
  liste: { etiket: "Zararlı listede", sinif: "bg-error/10 text-error border-error/20" },
  az: { etiket: "Az bildirim var", sinif: "bg-primary/10 text-primary border-primary/20" },
  temiz: { etiket: "Kaydımızda yok", sinif: "bg-secondary/10 text-secondary border-secondary/20" },
};

const GENEL: Record<string, { baslik: string; alt: string; ikon: string; kart: string; renk: string }> = {
  tehlikeli: { baslik: "TEHLİKELİ", alt: "İşlem yapma, bilgi girme, ödeme yapma.", ikon: "gpp_bad", kart: "bg-error-container", renk: "text-error" },
  dikkat: { baslik: "DİKKATLİ OL", alt: "Kesin değil ama şüpheli işaretler var.", ikon: "gpp_maybe", kart: "bg-primary-container/25", renk: "text-primary" },
  temiz: { baslik: "Belirgin tehlike yok", alt: "Yine de tam güvenli demek değildir.", ikon: "verified_user", kart: "bg-secondary-container", renk: "text-secondary" },
};

export default function Sorgula() {
  const [metin, setMetin] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [k, setK] = useState<Kontrol | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [profilYukleniyor, setProfilYukleniyor] = useState(false);
  // Derin OSINT analizinin sonucu (OsintRaporu'ndan gelir). Karar mesajını
  // analiz BİTTİKTEN sonra buna göre gösteririz — erken/yanıltıcı uyarı olmasın.
  const [analizSeviye, setAnalizSeviye] = useState<"Yüksek" | "Orta" | "Düşük" | null>(null);
  // Hızlı sorgularda (telefon/IBAN) analiz anında biter — kararı en az ~1.4sn
  // "Analiz ediliyor" gösterdikten sonra ver ki analiz görünür ve güvenilir olsun.
  const [minSureDoldu, setMinSureDoldu] = useState(false);
  const [girisHatasi, setGirisHatasi] = useState<string | null>(null);

  const kontrolEt = useCallback(async (deger: string) => {
    if (deger.trim().length < 3) return;
    // Yerel dosya yolu (file:// veya C:\...) web adresi değildir; kontrol edilemez.
    // Yanlışlıkla yeşil "temiz" göstermek yerine net uyar.
    const t = deger.trim();
    if (/^file:\/\//i.test(t) || /^[a-zA-Z]:[\\/]/.test(t) || t.includes("file:///")) {
      setGirisHatasi("Bu bir web adresi değil — bilgisayarındaki yerel bir dosya (file://). Bunu kontrol edemem. Bir link (https://…), IBAN, telefon numarası ya da şüpheli mesajı yapıştır.");
      setK(null); setProfil(null);
      return;
    }
    setGirisHatasi(null);
    setYukleniyor(true);
    setK(null);
    setProfil(null);
    setAnalizSeviye(null);
    setMinSureDoldu(false);
    setTimeout(() => setMinSureDoldu(true), 1400); // minimum "analiz ediliyor" süresi
    try {
      const r = await fetch("/api/kontrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metin: deger, cihazId: cihazId() }),
      });
      const data: Kontrol = await r.json();
      if (r.ok) {
        setK(data);
        if (data.birincil) {
          const b = data.sonuclar.find((s) => s.deger === data.birincil);
          etkinlikEkle({ deger: data.birincil, tip: b?.tip || "url", supheli: data.genel !== "temiz" });
        }
        // 2+ varlık varsa → BİRLEŞİK RİSK PROFİLİ (her varlığı analiz + tek skor)
        if (data.sonuclar.length >= 2) {
          setProfilYukleniyor(true);
          fetch("/api/profil", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ metin: deger }),
          })
            .then((pr) => (pr.ok ? pr.json() : null))
            .then((p) => { if (p && !p.hata) setProfil(p); })
            .catch(() => {})
            .finally(() => setProfilYukleniyor(false));
        }
      }
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) { setMetin(q); kontrolEt(q); }
  }, [kontrolEt]);

  const [paylasildi, setPaylasildi] = useState(false);

  // Sonucu WhatsApp/paylaş menüsüyle yay → başkalarını uyar + yeni kullanıcı getir.
  async function uyariPaylas() {
    if (!k || !k.birincil) return;
    const baslik =
      k.genel === "tehlikeli" ? "TEHLİKELİ — dolandırıcılık tuzağı" :
      k.genel === "dikkat" ? "DİKKAT — şüpheli görünüyor" :
      "Kontrol ettim";
    const acik =
      k.genel === "tehlikeli"
        ? `Bu adrese/numaraya SAKIN tıklama, bilgi girme, ödeme yapma:\n${k.birincil}`
        : k.genel === "dikkat"
        ? `Şüpheli işaretler var, dikkatli ol:\n${k.birincil}`
        : `Şunu kontrol ettim: ${k.birincil}`;
    const link = `https://siber-bildir-web.vercel.app/sorgula?q=${encodeURIComponent(k.birincil)}`;
    const metin = `${baslik}\n\n${acik}\n\nSen de MirLeon ile saniyede kontrol et \n${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "MirLeon — Nazar uyarısı", text: metin });
      } else {
        await navigator.clipboard.writeText(metin);
        setPaylasildi(true);
        setTimeout(() => setPaylasildi(false), 2500);
      }
    } catch {
      /* kullanıcı iptal etti */
    }
  }

  // Sonucumuzu USOM'un resmi kategorisine eşle (Oltalama/Zararlı Yazılım/Diğer).
  function usomKategori(): string {
    if (k?.marka) return "Oltalama (marka taklidi)";
    const kat = (k?.kategori || "").toLowerCase();
    if (kat.includes("doland") || kat.includes("sahte")) return "Oltalama";
    return "Oltalama / Şüpheli bağlantı";
  }

  // Kullanıcının e-posta uygulamasını ön-doldurulmuş açar (biz GÖNDERMEYİZ).
  function usomBildir() {
    if (!k?.birincil) return;
    const konu = `Siber Olay Bildirimi - ${usomKategori()}: ${k.birincil}`;
    const govde = [
      "Sayın T.C. Siber Güvenlik Başkanlığı,",
      "",
      "Aşağıdaki şüpheli siber olayı bildirmek istiyorum:",
      "",
      `• Adres/Numara: ${k.birincil}`,
      `• Olay türü: ${usomKategori()}`,
      k.marka ? `• Taklit edilen kurum: ${k.marka.marka}` : "",
      `• Açıklama: Vatandaş olarak karşılaştığım bu içeriğin dolandırıcılık/oltalama amaçlı olduğunu değerlendiriyorum.`,
      "",
      "Gereğini bilgilerinize arz ederim.",
      "Saygılarımla.",
    ].filter(Boolean).join("\n");
    const url = `mailto:ihbar@siberguvenlik.gov.tr?subject=${encodeURIComponent(konu)}&body=${encodeURIComponent(govde)}`;
    window.location.href = url;
  }

  async function yapistir() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setMetin(t);
    } catch {}
  }

  return (
    <div className="px-5 pt-3 pb-6">
      <h1 className="font-display text-2xl font-semibold text-on-surface">Kontrol et</h1>
      <p className="mt-1 text-[15px] text-on-surface-variant">
        Şüpheli mesajı, linki, IBAN'ı veya numarayı yapıştır — içindeki her şeyi kontrol edelim.
      </p>

      <textarea
        value={metin}
        onChange={(e) => setMetin(e.target.value)}
        rows={3}
        placeholder="Mesajı veya değeri buraya yapıştır…"
        className="mt-4 w-full rounded-2xl border border-outline-variant/70 bg-surface-lowest p-4 text-[15px] text-on-surface soft outline-none focus:border-primary"
      />
      <div className="mt-3 flex gap-2">
        <button onClick={yapistir} className="press flex items-center gap-1.5 rounded-full border border-outline-variant px-4 py-2.5 text-sm font-medium text-on-surface">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>content_paste</span>
          Yapıştır
        </button>
        <button
          onClick={() => kontrolEt(metin)}
          disabled={yukleniyor || metin.trim().length < 3}
          className="press flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50"
        >
          {yukleniyor ? "Kontrol ediliyor…" : "Kontrol et"}
        </button>
      </div>

      {girisHatasi && (
        <div className="fade-up mt-5 flex items-start gap-3 rounded-2xl bg-primary-container/25 p-4">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 22 }}>info</span>
          <p className="text-sm leading-relaxed text-on-surface">{girisHatasi}</p>
        </div>
      )}

      {k && (() => {
        // Karar, DERİN analiz bitmeden gösterilmez. Birincil gösterge varsa
        // OsintRaporu'nun sonucunu bekle; sonra kontrol (somut sinyaller) ile
        // OSINT seviyesini birleştirip NİHAİ kararı ver.
        const analizBekleniyor = !!k.birincil && (analizSeviye === null || !minSureDoldu);
        // NİHAİ KARAR: birincil gösterge (site/IBAN/tel) varsa DERİN analiz (analizSeviye)
        // OTORİTERDİR — o zaten marka-taklidi, USOM, VT, yaş vб. her şeyi puanlar. Hızlı
        // kontrolün "tehlikeli"si (ör. salt marka-adı eşleşmesi) tam analizin Orta skorunu
        // EZMESİN → başlık/skor tutarsızlığı biterdi (araskargo.net: header TEHLİKELİ, skor 45).
        // Marka-taklit varsa en az "dikkat" (asla yanlışlıkla "temiz" değil).
        const finalGenel: "tehlikeli" | "dikkat" | "temiz" = !k.birincil
          ? k.genel
          : analizSeviye === "Yüksek"
          ? "tehlikeli"
          : analizSeviye === "Orta"
          ? "dikkat"
          : analizSeviye === "Düşük"
          ? (k.marka ? "dikkat" : "temiz")
          : k.genel; // analiz henüz gelmedi (beklenmedik) → hızlı kontrole düş
        return (
        <div className="fade-up">
          {/* Büyük genel karar — analiz bitene kadar "Analiz ediliyor" */}
          {analizBekleniyor ? (
            <div className="mt-5 flex items-center gap-4 rounded-3xl bg-surface-lowest p-5 soft">
              <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 40 }}>progress_activity</span>
              <div>
                <div className="font-display text-xl font-semibold text-on-surface">Analiz ediliyor…</div>
                <div className="text-sm text-on-surface-variant">Tüm kaynaklar taranıyor, birazdan sonucu vereceğim.</div>
              </div>
            </div>
          ) : (
          <div className={`mt-5 flex items-center gap-4 rounded-3xl p-5 ${GENEL[finalGenel].kart}`}>
            <span className={`material-symbols-outlined ${GENEL[finalGenel].renk}`} style={{ fontSize: 44 }}>
              {GENEL[finalGenel].ikon}
            </span>
            <div>
              <div className={`font-display text-xl font-semibold ${GENEL[finalGenel].renk}`}>{GENEL[finalGenel].baslik}</div>
              <div className="text-sm text-on-surface-variant">{GENEL[finalGenel].alt}</div>
            </div>
          </div>
          )}

          {/* Sonuç detayları — SADECE analiz bitince görünür (erken dönmesin) */}
          {!analizBekleniyor && (
          <>
          {/* BİRLEŞİK RİSK PROFİLİ — çok-varlıklı vaka tek skorda */}
          {profilYukleniyor && !profil && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-outline-variant/30 bg-surface-lowest p-4 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 18 }}>progress_activity</span>
              Tüm varlıklar analiz edilip tek risk profiline birleştiriliyor…
            </div>
          )}
          {profil && profil.varliklar.length >= 2 && (
            <div className="mt-4 overflow-hidden rounded-3xl border border-outline-variant/40 bg-surface-lowest">
              <div className={`flex items-center gap-4 p-4 ${profil.seviye === "Yüksek" ? "bg-error-container" : profil.seviye === "Orta" ? "bg-primary-container/25" : "bg-secondary-container"}`}>
                <div className="text-center">
                  <div className={`font-display text-4xl font-extrabold leading-none ${profil.seviye === "Yüksek" ? "text-error" : profil.seviye === "Orta" ? "text-primary" : "text-secondary"}`}>{profil.skor}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">/ 100</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-on-surface">Birleşik Risk Profili</div>
                  <div className="text-[13px] text-on-surface-variant">
                    {profil.varlikSayisi} varlık tek skorda değerlendirildi{profil.organize ? " · bağlantılı altyapı işareti" : ""}.
                  </div>
                </div>
              </div>
              {profil.organize && (
                <div className="flex items-center gap-2 border-b border-outline-variant/30 bg-error/5 px-4 py-2.5">
                  <span className="material-symbols-outlined text-error" style={{ fontSize: 16 }}>hub</span>
                  <span className="text-[12.5px] text-on-surface">Bu varlıklar birlikte görülüyor — organize bir dolandırıcılık altyapısı olabilir.</span>
                </div>
              )}
              <div className="divide-y divide-outline-variant/20">
                {profil.varliklar.map((v, i) => (
                  <div key={i} className="flex items-start gap-3 p-3">
                    <span className="material-symbols-outlined mt-0.5 text-on-surface-variant" style={{ fontSize: 18 }}>{TIP_IKON[v.tip] || "help"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-on-surface">{v.deger}</div>
                      <div className="text-[12px] leading-snug text-on-surface-variant">{v.ozet}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${v.seviye === "Yüksek" ? "bg-error/10 text-error" : v.seviye === "Orta" ? "bg-primary/10 text-primary" : "bg-secondary/15 text-secondary"}`}>{v.risk}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-outline-variant/30 px-4 py-2.5 text-[11px] text-on-surface-variant">
                Bu skor bir kanıt değil, birden fazla risk sinyalinin birleşimidir.
              </div>
            </div>
          )}

          {/* Başkalarını uyar — çekirdek büyüme döngüsü (WhatsApp paylaşımı) */}
          {!analizBekleniyor && finalGenel !== "temiz" && k.birincil && (
            <button
              onClick={uyariPaylas}
              className="press mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-error py-3 text-sm font-semibold text-on-error"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {paylasildi ? "check" : "campaign"}
              </span>
              {paylasildi ? "Kopyalandı — yapıştırıp paylaş" : "Bunu paylaş, başkalarını uyar"}
            </button>
          )}

          {/* Resmi makama (USOM) bildir — döngüyü kapatır, ulusal listeyi güçlendirir */}
          {!analizBekleniyor && finalGenel === "tehlikeli" && k.birincil && (
            <div className="mt-3 rounded-2xl border border-outline-variant/40 bg-surface-lowest p-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>account_balance</span>
                <span className="text-sm font-semibold text-on-surface">Resmi makama bildir</span>
              </div>
              <p className="mt-1 text-[13px] text-on-surface-variant">
                Bunu T.C. Siber Güvenlik Başkanlığı'na (USOM) iletirsen resmi zararlı listesine girer ve herkes korunur. E-posta uygulamanı hazır metinle açarız — gözden geçirip sen gönderirsin.
              </p>
              <button
                onClick={usomBildir}
                className="press mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-primary py-2.5 text-sm font-semibold text-primary"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>forward_to_inbox</span>
                USOM'a resmi bildir
              </button>
              <p className="mt-2 text-[11px] text-on-surface-variant">
                Resmi kanallar: ihbar@siberguvenlik.gov.tr · 0549 779 87 85
              </p>
            </div>
          )}

          {/* Marka taklidi: banka/kurum adını taklit eden sahte adres. Metin/renk KARAR
              seviyesine uyar — "dikkat"te kesin "dolandırıcılık" iddia etme (araskargo). */}
          {k.marka && (
            finalGenel === "tehlikeli" ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-error/30 bg-error/10 p-3.5">
                <span className="material-symbols-outlined text-error" style={{ fontSize: 22 }}>gpp_bad</span>
                <p className="text-sm text-on-surface">
                  <b className="text-error">{k.marka.marka} taklidi.</b> {k.marka.mesaj}
                </p>
              </div>
            ) : (
              <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-primary/25 bg-primary-container/25 p-3.5">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 22 }}>gpp_maybe</span>
                <p className="text-sm text-on-surface">
                  <b className="text-primary">&ldquo;{k.marka.marka}&rdquo; adına benziyor.</b> Bu adres {k.marka.marka}&apos;nın resmi adresi değil.
                  Kesin dolandırıcılık diyemiyoruz; emin olmadan bilgi/ödeme girme, kurumu resmi kanalından doğrula.
                </p>
              </div>
            )
          )}

          {/* Kampanya uyarısı: adres yeni olsa bile bilinen tuzak kalıbı */}
          {k.kampanya && (
            <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-error/20 bg-error/5 p-3.5">
              <span className="material-symbols-outlined text-error" style={{ fontSize: 20 }}>fingerprint</span>
              <p className="text-sm text-on-surface">
                <b className="text-error">Bilinen bir dolandırıcılık kalıbı.</b>{" "}
                Adres yeni olabilir ama bu tuzağın aynısı daha önce{" "}
                {k.kampanya.benzersiz > 1 ? <b>{k.kampanya.benzersiz} farklı kaynaktan</b> : "sistemimizde"}{" "}
                görüldü — dolandırıcılar aynı düzeni farklı sitelerde tekrar kullanır.
              </p>
            </div>
          )}

          {/* Sosyal kanıt: bunu senden önce kaç kişi sordu / bildirdi */}
          {k.sosyal && (
            <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-surface-lowest p-3.5 soft">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>groups</span>
              <p className="text-sm text-on-surface-variant">
                {k.sosyal.benzersizBildiren > 0 ? (
                  <>
                    Senden önce <b className="text-error">{k.sosyal.benzersizBildiren} kişi</b> bunu
                    dolandırıcılık olarak bildirdi
                    {k.sosyal.oncekiSoran > 0 && <> · <b className="text-on-surface">{k.sosyal.oncekiSoran} kişi</b> daha sordu</>}.
                  </>
                ) : k.sosyal.oncekiSoran > 0 ? (
                  <>Bunu senden önce <b className="text-on-surface">{k.sosyal.oncekiSoran} kişi</b> daha sordu — henüz kimse dolandırıcılık diye bildirmedi.</>
                ) : (
                  <><b className="text-on-surface">Bunu ilk soran sensin.</b> Tuzaksa, bildirmen senden sonrakileri korur.</>
                )}
              </p>
            </div>
          )}

          {/* AI MESAJ YORUMU: mesajın ikna taktiklerini akılcı çözümler */}
          {k.mesajYorum && k.mesajYorum.ai && (k.mesajYorum.gerekce || k.mesajYorum.taktikler.length > 0) ? (
            <div className="mt-3 rounded-2xl border border-outline-variant/30 bg-surface-lowest p-3.5">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>psychology</span>
                <span className="text-[13px] font-semibold text-on-surface">Nazar mesajı okudu</span>
              </div>
              {k.mesajYorum.gerekce && <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">{k.mesajYorum.gerekce}</p>}
              {k.mesajYorum.taktikler.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {k.mesajYorum.taktikler.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-semibold text-error">
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : k.guven !== "yok" && k.kategori !== "diger" ? (
            <p className="mt-3 text-sm text-on-surface-variant">
              Bu içerik <b className="text-on-surface">{k.kategoriAdi}</b> gibi görünüyor (güven: {k.guven}).
            </p>
          ) : null}

          {/* Bulunan göstergeler */}
          {k.sonuclar.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-on-surface-variant">Bulunan ve kontrol edilenler</div>
              {k.sonuclar.map((s, i) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-outline-variant/20 bg-surface-lowest p-3">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }}>{TIP_IKON[s.tip]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-on-surface">{s.deger}</div>
                    <div className="text-[12px] text-on-surface-variant">{TIP_ADI[s.tip]}</div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${DURUM[s.durum].sinif}`}>
                    {DURUM[s.durum].etiket}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-outline-variant/20 bg-surface-lowest p-3 text-sm text-on-surface-variant">
              Mesajda numara, IBAN veya site bulamadım — ama içeriği yukarıdaki gibi değerlendirdim.
            </p>
          )}

          </>
          )}

          {/* Derin OSINT — analiz sürerken GİZLİ ama yüklenir (sonucu karara bildirir) */}
          <div style={{ display: analizBekleniyor ? "none" : "block" }}>
            {k.birincil && <OsintRaporu key={k.birincil} giris={k.birincil} onDurum={setAnalizSeviye} />}
          </div>

          <div className="mt-5 rounded-2xl bg-surface-lowest p-4 text-[15px] text-on-surface-variant soft">
            Başına bir şey mi geldi?{" "}
            <a href="/bildir" className="font-medium text-primary underline">Bildir</a> — rapor + hazır dilekçe çıkaralım.
          </div>
        </div>
        );
      })()}

      {!k && (
        <p className="mt-4 text-xs text-on-surface-variant">Örnek dene: 05321234567 veya kargo-takip-tr.net</p>
      )}
    </div>
  );
}
