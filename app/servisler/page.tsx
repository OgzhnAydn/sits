"use client";

import Link from "next/link";

type Servis = { href: string; ikon: string; baslik: string; alt: string; rozet?: string };

const BIREYSEL: Servis[] = [
  { href: "/sahte-hesap", ikon: "person_search", baslik: "Sahte hesap mı?", alt: "Sosyal medya hesabını gerçek/sahte diye analiz et + ilişki grafiği." },
  { href: "/guvenlik", ikon: "shield_person", baslik: "Hesabım güvende mi?", alt: "E-posta sızıntısı + şifre kontrolü. \"Beni izle\" ile periyodik uyarı al.", rozet: "izleme" },
  { href: "/gorsel", ikon: "photo_camera", baslik: "Fotoğrafla sor", alt: "Ekran görüntüsü / fotoğrafı yükle — dolandırıcılık mı, AI mı, çalıntı mı?" },
  { href: "/nazar", ikon: "forum", baslik: "Nazar'a danış", alt: "Şüpheni yaz, birlikte bakalım." },
];

const KURUMSAL: Servis[] = [
  { href: "/kontrol", ikon: "admin_panel_settings", baslik: "Kontrol Odası", alt: "Sistem-geneli operatör paneli: tüm markalar, sistem sağlığı, kanal durumu (iOS/Android/Google/Meta) ve son tespitler — tek ekranda.", rozet: "admin" },
  { href: "/mercek", ikon: "satellite_alt", baslik: "Siber Mercek — Operasyon Merkezi", alt: "Canlı tehdit evreni + yakalanan sahteleri tek ekranda incele: risk, neden şüphelendik, saldırı aşaması, altyapı DNA'sı ve kardeş kampanyalar.", rozet: "operatör" },
  { href: "/marka-koruma", ikon: "verified_user", baslik: "Marka Koruma", alt: "Markanı taklit eden sahte siteleri tara + her gün rapor al.", rozet: "kurumsal" },
  { href: "/kampanya", ikon: "hub", baslik: "Kampanya Çözümleme", alt: "Bir sahte siteden tüm operasyonu çıkar: kardeş domainler, IP/ASN, ne topluyor.", rozet: "yeni" },
  { href: "/canli", ikon: "radar", baslik: "Canlı Tehdit İstihbaratı", alt: "Dünyada yayınlanan sahte siteleri yayınlandıkları an yakalayan gerçek-zamanlı operasyon paneli.", rozet: "canlı" },
  { href: "/marka-avci", ikon: "radar", baslik: "Marka Avcısı", alt: "yakalanan sahte-site adayları (inceleme kuyruğu) — park/aktif ayrımıyla.", rozet: "operatör" },
  { href: "/kayitlar", ikon: "inventory_2", baslik: "Kanıt Deposu", alt: "Yakaladığımız ve analiz ettiğimiz her adres — kalıcı kayıt, geçmişe dönük erişim.", rozet: "operatör" },
  { href: "/kalibrasyon", ikon: "fact_check", baslik: "Kalibrasyon", alt: "Motor bilinen temiz/kötü sitelerde doğru mu? Yanlış-pozitif/negatif raporu.", rozet: "operatör" },
];

function Kart({ s }: { s: Servis }) {
  return (
    <Link href={s.href} className="press flex items-start gap-3 rounded-2xl border border-outline-variant/30 bg-surface-lowest p-3.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{s.ikon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-on-surface">{s.baslik}</p>
          {s.rozet && <span className="rounded-full bg-secondary/12 px-1.5 py-0.5 text-[9px] font-bold uppercase text-secondary">{s.rozet}</span>}
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-on-surface-variant">{s.alt}</p>
      </div>
      <span className="material-symbols-outlined shrink-0 self-center text-on-surface-variant" style={{ fontSize: 18 }}>chevron_right</span>
    </Link>
  );
}

export default function Servisler() {
  return (
    <div className="px-5 pt-3 pb-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Servisler</h1>
          <p className="text-[13px] text-on-surface-variant">Nazar'ın tüm koruma araçları tek yerde.</p>
        </div>
      </div>

      <p className="mt-5 px-1 text-xs font-bold uppercase tracking-wide text-on-surface-variant">Sana özel</p>
      <div className="mt-2 space-y-2">
        {BIREYSEL.map((s) => <Kart key={s.href} s={s} />)}
      </div>

      <p className="mt-6 px-1 text-xs font-bold uppercase tracking-wide text-on-surface-variant">Marka / Kurumsal</p>
      <div className="mt-2 space-y-2">
        {KURUMSAL.map((s) => <Kart key={s.href} s={s} />)}
      </div>

      <p className="mt-6 px-1 text-xs font-bold uppercase tracking-wide text-on-surface-variant">Daha fazla</p>
      <div className="mt-2 space-y-2">
        <Kart s={{ href: "/rehber", ikon: "menu_book", baslik: "Rehber", alt: "Dolandırıcılıktan korunma ipuçları + resmi ihbar kanalları." }} />
        <Kart s={{ href: "/bildir", ikon: "flag", baslik: "Bildir", alt: "Başına gelen dolandırıcılığı bildir — başkalarını koru." }} />
      </div>
    </div>
  );
}
