"use client";

import { useCallback, useEffect, useState } from "react";
import { etkinlikEkle } from "@/lib/activity";
import { cihazId } from "@/lib/device";
import OsintRaporu from "@/components/OsintRaporu";

type Gosterge = { tip: string; deger: string; durum: string; benzersiz: number };
type Kontrol = {
  genel: "tehlikeli" | "dikkat" | "temiz";
  kategori: string;
  kategoriAdi: string;
  guven: string;
  sonuclar: Gosterge[];
  birincil: string | null;
};

const TIP_IKON: Record<string, string> = { iban: "account_balance_wallet", telefon: "call", url: "link" };
const TIP_ADI: Record<string, string> = { iban: "IBAN", telefon: "Telefon", url: "Site" };
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

// Paylaşılan içerik bir SOSYAL MEDYA PROFİLİ mi? Öyleyse hesap analizine
// (/sahte-hesap: risk + ilişki grafiği + altyapı OSINT) yönlendiririz — kişi
// gezerken gördüğü bir hesabı paylaşıp "gerçek mi, sahte mi" diye sorabilsin.
function sosyalHedefBul(metin: string): string | null {
  const t = metin.trim();
  if (/^@[A-Za-z0-9._]{2,30}$/.test(t)) return t; // düz @handle
  const m = t.match(
    /(?:https?:\/\/)?(?:www\.)?(instagram\.com|twitter\.com|x\.com|facebook\.com|fb\.com|tiktok\.com|t\.me|telegram\.me|youtube\.com|youtu\.be|linkedin\.com|threads\.net|snapchat\.com)\/([^\s?#/]+)/i
  );
  if (!m) return null;
  const host = m[1].toLowerCase();
  const seg = m[2].replace(/^@/, "");
  // Profil değil, içerik yolu (post/video/reel…) → hesap analizine gitme
  if (["p", "reel", "reels", "watch", "status", "explore", "share", "video", "tv", "shorts", "channel", "c", "home", "hashtag"].includes(seg.toLowerCase())) return null;
  if (seg.length < 2) return null;
  return `${host}/${seg}`;
}

export default function Paylas() {
  const [icerik, setIcerik] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [k, setK] = useState<Kontrol | null>(null);
  const [paylasimSayisi, setPaylasimSayisi] = useState<number | null>(null);
  const [hazir, setHazir] = useState(false);

  const analizEt = useCallback(async (metin: string) => {
    const m = metin.trim();
    if (m.length < 3) return;
    setYukleniyor(true);
    setK(null);
    setPaylasimSayisi(null);
    // Analiz + paylaşım sayacı paralel
    const kontrolP = fetch("/api/kontrol", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metin: m }),
    }).then((r) => (r.ok ? r.json() : null));
    const sayacP = fetch("/api/paylasim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icerik: m, cihazId: cihazId() }),
    }).then((r) => (r.ok ? r.json() : { sayi: 0 })).catch(() => ({ sayi: 0 }));

    try {
      const [data, sayac] = await Promise.all([kontrolP, sayacP]);
      if (data) {
        setK(data);
        if (data.birincil) {
          const b = data.sonuclar.find((s: Gosterge) => s.deger === data.birincil);
          etkinlikEkle({ deger: data.birincil, tip: b?.tip || "url", supheli: data.genel !== "temiz" });
        }
      }
      setPaylasimSayisi(sayac?.sayi ?? 0);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  // Paylaşımdan gelen içeriği oku (Web Share Target → ?title&text&url)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const parcalar = [p.get("title"), p.get("text"), p.get("url")].filter(Boolean) as string[];
    const gelen = parcalar.join(" ").trim();
    setHazir(true);
    if (gelen) {
      // Sosyal medya profili paylaşıldıysa → hesap analizine yönlendir
      const sosyal = sosyalHedefBul(gelen);
      if (sosyal) {
        window.location.replace(`/sahte-hesap?q=${encodeURIComponent(sosyal)}`);
        return;
      }
      setIcerik(gelen);
      analizEt(gelen);
    }
  }, [analizEt]);

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Paylaşımı kontrol et</h1>
          <p className="text-[13px] text-on-surface-variant">Şüpheli gördüğünü Nazar'a gönder — hemen bakayım.</p>
        </div>
      </div>

      <textarea
        value={icerik}
        onChange={(e) => setIcerik(e.target.value)}
        rows={3}
        placeholder="Paylaşımı, mesajı ya da linki buraya yapıştır…"
        className="mt-4 w-full rounded-2xl border border-outline-variant/70 bg-surface-lowest p-4 text-[15px] text-on-surface soft outline-none focus:border-primary"
      />
      <button
        onClick={() => analizEt(icerik)}
        disabled={yukleniyor || icerik.trim().length < 3}
        className="press mt-3 w-full rounded-full py-3 text-sm font-semibold text-on-primary shadow-glow disabled:opacity-50"
        style={{ background: "var(--gradient-primary)" }}
      >
        {yukleniyor ? "Kontrol ediliyor…" : "Kontrol et"}
      </button>

      {/* Daha önce bildirilmiş mi? */}
      {paylasimSayisi !== null && paylasimSayisi > 1 && (
        <div className="fade-up mt-4 flex items-center gap-3 rounded-2xl bg-error/8 p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-error/15 text-error">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>groups</span>
          </span>
          <p className="text-sm text-on-surface">
            Bu içerik daha önce <b className="text-error">{paylasimSayisi} kişi</b> tarafından bildirildi.
          </p>
        </div>
      )}

      {k && (
        <div className="fade-up mt-4">
          <div className={`flex items-center gap-4 rounded-3xl p-5 ${GENEL[k.genel].kart}`}>
            <span className={`material-symbols-outlined ${GENEL[k.genel].renk}`} style={{ fontSize: 44 }}>{GENEL[k.genel].ikon}</span>
            <div>
              <div className={`font-display text-xl font-semibold ${GENEL[k.genel].renk}`}>{GENEL[k.genel].baslik}</div>
              <div className="text-sm text-on-surface-variant">{GENEL[k.genel].alt}</div>
            </div>
          </div>

          {k.guven !== "yok" && k.kategori !== "diger" && (
            <p className="mt-3 text-sm text-on-surface-variant">
              Bu içerik <b className="text-on-surface">{k.kategoriAdi}</b> gibi görünüyor (güven: {k.guven}).
            </p>
          )}

          {k.sonuclar.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-on-surface-variant">Bulunan ve kontrol edilenler</div>
              {k.sonuclar.map((s, i) => (
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
          )}

          {k.birincil && <OsintRaporu key={k.birincil} giris={k.birincil} />}

          <div className="mt-5 rounded-2xl bg-surface-lowest p-4 text-[15px] text-on-surface-variant soft">
            Başına bir şey mi geldi?{" "}
            <a href="/bildir" className="font-medium text-primary underline">Bildir</a> — rapor + hazır dilekçe çıkaralım.
          </div>
        </div>
      )}

      {hazir && !k && !yukleniyor && !icerik && (
        <p className="mt-4 text-xs text-on-surface-variant">
          İpucu: Bir link, mesaj ya da <b>sosyal medya hesabında</b> <b>Paylaş → MirLeon</b> dediğinde içerik buraya düşer. Hesap paylaşırsan doğrudan <b>gerçek mi / sahte mi + OSINT</b> analizine gider.
        </p>
      )}
    </div>
  );
}
