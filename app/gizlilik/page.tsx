import Link from "next/link";

export const metadata = { title: "Gizlilik Politikası" };

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

export default function Gizlilik() {
  return (
    <div className="px-5 pt-3 pb-6">
      <Link href="/" className="text-sm text-primary">← Ana sayfa</Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-on-surface">
        Gizlilik Politikası
      </h1>
      <p className="mt-1 text-xs text-on-surface-variant">KVKK Aydınlatma Metni</p>

      <div className="mt-3 rounded-xl bg-primary-container/15 p-3 text-xs text-on-surface-variant">
        Not: Bu metin bir <b>taslaktır</b>. Yayına çıkmadan önce köşeli parantezli
        alanlar ([...]) doldurulmalı ve bir hukukçu tarafından onaylanmalıdır.
      </div>

      <Bolum baslik="1. Veri Sorumlusu">
        <p>
          MirLeon (&quot;Uygulama&quot;), [Şirket/Kişi Adı] tarafından işletilir.
          İletişim: [e-posta] · [adres].
        </p>
      </Bolum>

      <Bolum baslik="2. İşlenen Veriler">
        <p>Uygulama şu verileri işler:</p>
        <ul className="list-disc pl-5">
          <li><b>Sorgu verileri:</b> girdiğin telefon/IBAN/site (sorgulama için).</li>
          <li><b>Bildirim verileri:</b> anlattığın olay ve tespit edilen dolandırıcılık göstergeleri (URL, IBAN, telefon).</li>
          <li><b>Anonim cihaz kimliği:</b> mükerrer/sahte bildirimi önlemek için rastgele üretilir; kimliğini içermez.</li>
          <li><b>Cihazında saklananlar:</b> güvenlik puanın ve sorgu geçmişin yalnızca senin cihazında (tarayıcı belleğinde) tutulur.</li>
        </ul>
      </Bolum>

      <Bolum baslik="3. İşleme Amacı ve Hukuki Dayanak">
        <p>
          Veriler; siber dolandırıcılığı önlemek, kullanıcıları uyarmak ve
          topluluğu korumak amacıyla işlenir. Hukuki dayanak, KVKK m.5/2-f
          kapsamındaki <b>meşru menfaat</b>tir (dolandırıcılık önleme).
        </p>
      </Bolum>

      <Bolum baslik="4. Kişisel Veri ve Satış Yasağı">
        <p>
          IBAN veya telefon numarası kişisel veri niteliği taşıyabilir. Bunlar
          yalnızca <b>dolandırıcılık göstergesi</b> olarak, topluluk tarafından
          birden çok bağımsız bildirimle doğrulandığında işlenir. Bildiren
          kişilerin kimlik verileri <b>hiçbir şekilde satılmaz</b> veya ticari
          amaçla paylaşılmaz.
        </p>
      </Bolum>

      <Bolum baslik="5. Saklama Süresi">
        <p>
          Göstergeler, dolandırıcılık önleme amacı sürdüğü müddetçe saklanır;
          amacı ortadan kalkan veriler [saklama süresi, ör. 2 yıl] içinde silinir
          veya anonimleştirilir.
        </p>
      </Bolum>

      <Bolum baslik="6. Üçüncü Taraf ve Altyapı">
        <p>
          Veriler Google Firebase (Firestore) altyapısında barındırılır; sunucular
          Avrupa (europe-west) bölgesindedir. Yapay zeka analizi için Anthropic
          (Claude) servisine, kişisel veri içermeyecek şekilde metin gönderilebilir.
        </p>
      </Bolum>

      <Bolum baslik="7. Haklarınız (KVKK m.11)">
        <p>
          Kişisel verilerinize ilişkin öğrenme, düzeltme, silme, işlemeye itiraz ve
          zararın giderilmesini talep etme haklarına sahipsiniz. Bir gösterge hakkında
          <b> haksız listelendiğini</b> düşünüyorsanız [e-posta] üzerinden başvurabilirsiniz.
        </p>
      </Bolum>

      <Bolum baslik="8. Resmi Kurum Değiliz">
        <p>
          MirLeon resmi bir devlet uygulaması değildir. Suç ihbarı için resmi kanallar
          (155, ihbarweb.org.tr, Cumhuriyet Savcılığı) kullanılmalıdır.
        </p>
      </Bolum>

      <p className="mt-6 text-xs text-on-surface-variant">Son güncelleme: [tarih]</p>
    </div>
  );
}
