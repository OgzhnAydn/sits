"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { etkinlikleriGetir, guvenlikPuani, type Etkinlik } from "@/lib/activity";


export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [puan, setPuan] = useState<ReturnType<typeof guvenlikPuani> | null>(null);
  const [etkinlikler, setEtkinlikler] = useState<Etkinlik[]>([]);

  useEffect(() => {
    setPuan(guvenlikPuani());
    setEtkinlikler(etkinlikleriGetir());
  }, []);

  // Omnibox: ne girildiğini algıla, doğru analize yönlendir.
  function sorgula() {
    const s = q.trim();
    if (s.length < 3) return;
    const enc = encodeURIComponent(s);
    // Sadece e-posta → hesap güvenliği (sızıntı kontrolü)
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
      router.push(`/guvenlik?email=${enc}`);
      return;
    }
    // Sosyal hesap → sahte hesap kontrolü. YALNIZCA giriş TEK BAŞINA bir handle/profil
    // ise (tek token, boşluksuz). Bir MESAJIN İÇİNDE sosyal link geçmesi buraya
    // yönlendirmemeli — yoksa mesaj sahte-hesaba düşüp "yeterli veri yok" diyor.
    const tekToken = !/\s/.test(s) && s.length < 120;
    const handle = /^@[\w.]{2,}$/.test(s);
    const profilUrl = tekToken && /^(https?:\/\/)?(www\.)?(instagram|twitter|x|facebook|tiktok|t\.me|telegram)\.com\/[\w.@/-]+/i.test(s);
    if (handle || profilUrl) {
      router.push(`/sahte-hesap?q=${enc}`);
      return;
    }
    // Her şey (link, mesaj, IBAN, telefon, kripto) → birleşik dolandırıcılık analizi
    router.push(`/sorgula?q=${enc}`);
  }

  async function yapistir() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setQ(t);
    } catch {}
  }

  const p = puan?.puan ?? 100;
  const r = 43;
  const c = 2 * Math.PI * r;

  return (
    <div className="page-in px-4 pb-6">
      {/* Hero */}
      <section className="relative px-2 pt-4">
        <div className="relative z-10 max-w-[64%]">
          <p className="text-base font-semibold text-on-surface-variant">Merhaba </p>
          <h2 className="mt-2 font-display text-[32px] font-extrabold leading-[1.08] text-on-surface">
            Bugün seni <span className="text-gradient">korumaya</span> hazırım.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            Şüpheli mesajı, linki, IBAN'ı ya da numarayı yapıştır — riskleri birlikte tespit edelim.
          </p>
          <p className="mt-4 font-display text-xl font-extrabold leading-tight text-on-surface">
            Peki sen, <span className="text-gradient">başkalarını</span> korumaya hazır mısın?
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-secondary/10 px-3 py-1 text-[12px] font-semibold text-secondary">
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>volunteer_activism</span>
            Bir bildirim, birçok kişiyi korur.
          </p>
        </div>
        <div className="pointer-events-none absolute -right-2 top-8 z-0 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/casper-hero.webp"
          alt="Nazar — SİTS'in siber koruyucusu"
          className="animate-float-soft pointer-events-none absolute -right-4 top-0 z-0 w-[54%] drop-shadow-[0_26px_36px_oklch(0.35_0.14_265_/_0.35)]"
        />
        <div className="relative z-10 mt-3 ml-auto w-fit rounded-2xl rounded-br-md bg-surface-lowest px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-card)]">
          Ben Nazar,<br />senin siber koruyucun!
        </div>
      </section>

      {/* Omnibox — tek akıllı arama: her şeyi buradan sor */}
      <section className="mt-5">
        <div className="surface rounded-3xl p-4">
          <h2 className="font-display text-[19px] font-extrabold leading-tight text-on-surface">
            İşlem yapmadan önce <span className="text-gradient">kontrol et</span>.
          </h2>
          <p className="mb-3 mt-1 text-[13px] leading-relaxed text-on-surface-variant">
            Tıklamadan, göndermeden, ödeme yapmadan önce — şüpheli olanı bana ver, <b className="text-on-surface">türünü ben anlarım.</b>
          </p>
          <div className="flex items-start gap-2 rounded-2xl bg-surface-low p-3.5">
            <textarea
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sorgula(); } }}
              rows={4}
              placeholder="Şüpheli linki, mesajı (SMS/WhatsApp), IBAN'ı, telefonu, kripto adresini veya profili buraya yapıştır…"
              className="min-h-[104px] min-w-0 flex-1 resize-none bg-transparent py-0.5 text-[15px] leading-relaxed outline-none placeholder:text-on-surface-variant"
            />
            <div className="flex shrink-0 flex-col gap-2">
              <button onClick={() => router.push("/gorsel")} aria-label="Fotoğraf / QR" className="press text-primary">
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>photo_camera</span>
              </button>
              <button onClick={yapistir} aria-label="Panodan yapıştır" className="press text-on-surface-variant">
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>content_paste</span>
              </button>
            </div>
          </div>
          <button
            onClick={sorgula}
            className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-on-primary shadow-glow"
            style={{ background: "var(--gradient-primary)" }}
          >
            Analiz Et
          </button>
          {/* Ne girebilirsin — tek dokunuşla örnek/kısayol */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              { e: "Ekran görüntüsü / QR", i: "photo_camera", go: () => router.push("/gorsel") },
              { e: "Profil / hesap", i: "person_search", go: () => router.push("/sahte-hesap") },
              { e: "Hesabım güvende mi?", i: "shield_person", go: () => router.push("/guvenlik") },
              { e: "Nazar'a danış", i: "forum", go: () => router.push("/nazar") },
            ].map((x) => (
              <button key={x.e} onClick={x.go} className="press inline-flex items-center gap-1 rounded-full border border-outline-variant/50 bg-surface-lowest px-2.5 py-1 text-[11.5px] font-medium text-on-surface-variant">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{x.i}</span>
                {x.e}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Nasıl çalışır? — paylaş → öğren → koru döngüsü */}
      <section className="mt-5">
        <h3 className="px-2 font-display text-base font-extrabold text-on-surface">Nasıl çalışır?</h3>
        <p className="mb-3 mt-0.5 px-2 text-[12px] text-on-surface-variant">Başına gelen dolandırıcılığı paylaş — hem sen bilgilen, hem başkalarını koru.</p>
        <div className="space-y-2.5">
          {[
            { ikon: "upload", renk: "text-primary bg-primary/10", baslik: "1. Paylaş", alt: "Karşılaştığın linki, mesajı, IBAN'ı ya da ekran görüntüsünü gönder." },
            { ikon: "shield", renk: "text-secondary bg-secondary/12", baslik: "2. Öğren", alt: "Anında OSINT raporu + \"ne yapmalısın\" rehberini al." },
            { ikon: "volunteer_activism", renk: "text-warning bg-warning/15", baslik: "3. Koru", alt: "Paylaşımın kara listeye eklenir; aynı tuzağa düşecek başkalarını uyarır." },
          ].map((a) => (
            <div key={a.baslik} className="surface flex items-start gap-3 rounded-2xl p-3.5">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${a.renk}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{a.ikon}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-on-surface">{a.baslik}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-on-surface-variant">{a.alt}</p>
              </div>
            </div>
          ))}
        </div>
        <Link href="/bildir" className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-on-primary shadow-glow" style={{ background: "var(--gradient-primary)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>flag</span>
          Başıma geleni paylaş
        </Link>
      </section>

      {/* İstatistikler */}
      <section className="mt-5 grid grid-cols-2 gap-3">
        <div className="surface col-span-2 flex items-center gap-5 rounded-3xl p-5">
          <div className="relative grid h-24 w-24 shrink-0 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-surface-high)" strokeWidth="9" />
              <circle cx="50" cy="50" r={r} fill="none" stroke={p >= 80 ? "var(--color-secondary)" : p >= 60 ? "var(--color-warning)" : "var(--color-error)"} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} />
            </svg>
            <div className="text-center">
              <p className="font-display text-3xl font-extrabold leading-none text-on-surface">{p}</p>
              <p className="text-[11px] font-semibold text-secondary">{p >= 80 ? "Harika!" : p >= 60 ? "İyi" : "Riskli"}</p>
            </div>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-on-surface">
              Güvenlik Puanın <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 15 }}>info</span>
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-on-surface-variant">{puan?.mesaj ?? "Yükleniyor…"}</p>
          </div>
        </div>

        <div className="surface rounded-3xl p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-on-surface">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>shield</span> Kara Liste
          </p>
          <p className="mt-3 font-display text-3xl font-extrabold text-on-surface">500.000+</p>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">USOM resmi listesi + topluluk kaydı.</p>
        </div>

        <div className="surface rounded-3xl p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-on-surface">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>verified_user</span> Kaynaklar
          </p>
          <p className="mt-3 font-display text-3xl font-extrabold text-on-surface">90+</p>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">güvenlik firması (VirusTotal) + USOM.</p>
        </div>
      </section>

      {/* Güncel tuzaklar → /trend */}
      <section className="mt-4">
        <Link href="/trend" className="surface press flex items-center gap-4 rounded-3xl p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 24 }}>monitoring</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-on-surface">Güncel tuzaklar</p>
            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">Bu ara en çok hangi tuzaklar kuruluyor, aktif kampanyalar.</p>
          </div>
          <span className="material-symbols-outlined shrink-0 text-on-surface-variant" style={{ fontSize: 20 }}>chevron_right</span>
        </Link>
      </section>

      {/* İstatistik (yönetim) — anahtar bir kez girilir, cihazda hatırlanır */}
      <section className="mt-4">
        <Link href="/istatistik" className="surface press flex items-center gap-4 rounded-3xl p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 24 }}>bar_chart</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-on-surface">İstatistik</p>
            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">Kaç kişi kullandı, ne kadar veri birikti — tüm kayıtlar.</p>
          </div>
          <span className="material-symbols-outlined shrink-0 text-on-surface-variant" style={{ fontSize: 20 }}>chevron_right</span>
        </Link>
      </section>

      {/* Nazar banner */}
      <section className="mt-4">
        <Link href="/nazar" className="relative block overflow-hidden rounded-3xl p-6 shadow-[var(--shadow-card)]" style={{ background: "var(--gradient-casper)" }}>
          <div className="relative z-10 max-w-[62%]">
            <h3 className="font-display text-lg font-extrabold text-on-surface">Nazar her zaman yanında!</h3>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">Şüpheli bir şey mi gördün? Hemen yapıştır, için rahat olsun.</p>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface-lowest px-5 py-2.5 text-sm font-semibold text-primary shadow-[var(--shadow-card)]">
              Nazar'a Sor <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chat</span>
            </span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="" loading="lazy" className="animate-float-soft pointer-events-none absolute -bottom-3 -right-2 w-[44%] drop-shadow-[0_18px_28px_oklch(0.35_0.14_265_/_0.28)]" />
        </Link>
      </section>

      {/* Son sorgular */}
      {etkinlikler.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="font-display text-base font-extrabold text-on-surface">Son Sorguların</h3>
          </div>
          <ul className="mt-3 space-y-2.5">
            {etkinlikler.slice(0, 4).map((e, i) => {
              const bildirim = e.tur === "bildirim";
              const ton = bildirim ? "bg-primary/10 text-primary" : e.supheli ? "bg-error-container text-error" : "bg-secondary-container text-secondary";
              const ikon = bildirim ? "campaign" : e.tip === "iban" ? "account_balance" : e.tip === "telefon" ? "call" : "link";
              return (
                <li key={i}>
                  <div className="surface flex w-full items-center gap-3 rounded-2xl p-4 text-left">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${ton}`}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{ikon}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-on-surface">{e.deger}</span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-on-surface-variant">{bildirim ? "Bildirim" : `${e.tip.toUpperCase()} sorgusu`}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ton}`}>{bildirim ? "Bildirildi" : e.supheli ? "Yüksek Risk" : "Güvenli"}</span>
                      </span>
                    </span>
                    <span className="material-symbols-outlined shrink-0 text-on-surface-variant" style={{ fontSize: 20 }}>chevron_right</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
