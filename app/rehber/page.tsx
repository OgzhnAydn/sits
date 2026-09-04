import Link from "next/link";

export const metadata = { title: "Rehber" };

const REHBER = [
  { s: "Dolandırıldım, param gitti", a: "Vakit kaybetmeden bankanı ara, işlemi bildir ve karşı hesabın bloke edilmesini iste. Sonra ihbarweb.org.tr'den resmi ihbar oluştur.", icon: "account_balance_wallet" },
  { s: "Sahte hesap / taklit profil", a: "Platforma (Instagram, X vb.) şikayet et; ekran görüntülerini sakla. Gerekirse Cumhuriyet Savcılığına başvur.", icon: "person_off" },
  { s: "Tehdit / şantaj aldım", a: "Yanıt verme, kanıtları sakla. Acil durumda 155'i ara; ardından savcılığa suç duyurusunda bulun.", icon: "gpp_maybe" },
  { s: "Yasa dışı içerik gördüm", a: "ihbarweb.org.tr veya BTK üzerinden ihbar et. İçeriğin linkini ve ekran görüntüsünü ekle.", icon: "flag" },
];

export default function Rehber() {
  return (
    <div className="px-5 pt-3 pb-6">
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="MirLeon maskotu" className="h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-on-surface">Rehber</h1>
          <p className="text-[13px] text-on-surface-variant">
            Başına bir şey geldiyse, ne yapman gerektiği kısaca burada.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {REHBER.map((r, i) => (
          <div key={i} className="flex gap-3 rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4 shadow-sm">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-container/50 text-secondary">
              <span className="material-symbols-outlined">{r.icon}</span>
            </span>
            <div>
              <div className="text-sm font-medium text-on-surface">{r.s}</div>
              <div className="mt-1 text-sm text-on-surface-variant">{r.a}</div>
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/bildir"
        className="mt-4 flex items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-on-primary transition hover:bg-primary-container"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_alert</span>
        Sana özel yönlendirme için bildir
      </Link>
    </div>
  );
}
