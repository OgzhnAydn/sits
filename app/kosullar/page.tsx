import Link from "next/link";

export const metadata = { title: "Kullanım Koşulları" };

function Bolum({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="font-display text-lg font-medium text-on-surface">{baslik}</h2>
      <div className="mt-1 space-y-2 text-sm leading-relaxed text-on-surface-variant">
        {children}
      </div>
    </section>
  );
}

export default function Kosullar() {
  return (
    <div className="px-5 pt-3 pb-6">
      <Link href="/" className="text-sm text-primary">← Ana sayfa</Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-on-surface">
        Kullanım Koşulları
      </h1>

      <div className="mt-3 rounded-xl bg-primary-container/15 p-3 text-xs text-on-surface-variant">
        Not: Bu metin bir <b>taslaktır</b> ve yayına çıkmadan önce hukukçu onayı gerektirir.
      </div>

      <Bolum baslik="1. Hizmetin Niteliği">
        <p>
          SİTS; siber olaylarda kullanıcılara yol gösteren, topluluk destekli bir
          bilgilendirme ve sorgulama aracıdır. <b>Resmi bir kurum değildir</b>,
          hukuki tavsiye vermez ve bir sonucu garanti etmez.
        </p>
      </Bolum>

      <Bolum baslik="2. Kullanıcı Yükümlülükleri">
        <ul className="list-disc pl-5">
          <li>Yalnızca gerçekten yaşadığın/karşılaştığın olayları bildir.</li>
          <li><b>Sahte, iftira niteliğinde veya intikam amaçlı bildirim yapmak yasaktır.</b> Bu tür bildirimler hem hesabının kısıtlanmasına hem hukuki sorumluluğuna yol açabilir.</li>
          <li>Uygulamayı otomatik/toplu şekilde kötüye kullanmak (spam, veri kazıma) yasaktır.</li>
        </ul>
      </Bolum>

      <Bolum baslik="3. Sorgu Sonuçlarının Anlamı">
        <p>
          &quot;Az sayıda bildirim&quot; bir sonucun <b>kesin</b> olduğu anlamına
          gelmez; yalnızca birkaç bildirim geldiğini gösterir. &quot;Dolandırıcı
          olarak bildirildi&quot; sonucu, birden çok bağımsız kullanıcının
          bildirimine dayanır ancak yine de nihai bir hüküm değildir. Kararlarını
          bu bilgiyi tek başına esas alarak verme.
        </p>
      </Bolum>

      <Bolum baslik="4. İtiraz ve Kaldırma">
        <p>
          Bir gösterge hakkında haksız yere listelendiğini düşünüyorsan [e-posta]
          üzerinden itiraz edebilirsin. İtirazlar incelenerek gerekirse kayıt
          kaldırılır.
        </p>
      </Bolum>

      <Bolum baslik="5. Sorumluluğun Sınırlandırılması">
        <p>
          Uygulama &quot;olduğu gibi&quot; sunulur. İçeriğin doğruluğu veya bir
          zararın önlenmesi garanti edilmez. Acil ve ciddi durumlarda 155 (Polis)
          veya 112 aranmalıdır.
        </p>
      </Bolum>

      <Bolum baslik="6. Değişiklikler">
        <p>Koşullar zaman zaman güncellenebilir. Güncel sürüm bu sayfada yayınlanır.</p>
      </Bolum>

      <p className="mt-6 text-xs text-on-surface-variant">Son güncelleme: [tarih]</p>
    </div>
  );
}
