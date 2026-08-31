"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function RizaKapisi() {
  const [goster, setGoster] = useState(false);
  const [onay, setOnay] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("sb_riza")) setGoster(true);
  }, []);

  if (!goster) return null;

  function kabul() {
    if (!onay) return;
    localStorage.setItem("sb_riza", new Date().toISOString());
    setGoster(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[88vh] w-full max-w-md flex-col rounded-3xl bg-surface-lowest shadow-xl">
        <div className="px-6 pt-6">
          <div className="mx-auto mb-3 h-14 w-14">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/casper-wave.webp" alt="" className="h-full w-full object-contain" />
          </div>
          <h2 className="text-center font-display text-xl font-semibold text-on-surface">Bilgilendirme</h2>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-6 text-[13.5px] leading-relaxed text-on-surface-variant">
          <p className="font-medium text-on-surface">Sevgili misafirimiz,</p>
          <p className="mt-2">
            Bu platform <b>bir devlet kurumu değildir</b>. Buradaki kontroller, mevcut teknik veriler ve açık
            kaynak bilgiler kullanılarak <b>bilgilendirme ve farkındalık</b> amacıyla yapılmaktadır.
          </p>
          <p className="mt-2">
            Kontrol sonucunuz <b>resmî ihbar, suç duyurusu veya kesin bir suç tespiti anlamına gelmez</b>.
          </p>
          <p className="mt-2">
            Şüpheli bir durumla karşılaştıysanız, kontrol sonucunda elde ettiğiniz bilgileri <b>Emniyet Genel
            Müdürlüğü Siber Suçlarla Mücadele</b> birimleri, <b>USOM</b> veya <b>Siber Güvenlik Başkanlığı</b> gibi
            ilgili resmî kanallara bildirebilirsiniz.
          </p>
          <p className="mt-2">Resmî ihbar için ilgili kurumların kendi başvuru kanallarını kullanınız.</p>

          <div className="mt-3 rounded-2xl bg-surface-low p-3">
            <p className="flex items-start gap-1.5 text-[12.5px]">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>lock</span>
              <span>
                <b className="text-on-surface">Kişisel verileriniz korunur.</b> Sorgularınız kimliğinizle
                ilişkilendirilmez; girdiğiniz şifreler cihazınızdan çıkmaz. Kişisel verileriniz reklam/pazarlama
                amacıyla saklanmaz, satılmaz veya üçüncü kişilerle paylaşılmaz. Platform, <b>6698 sayılı KVKK</b>{" "}
                ilkelerine uygun çalışır. Ayrıntılar{" "}
                <Link href="/gizlilik" className="font-medium text-primary underline">Gizlilik Politikası</Link> ve{" "}
                <Link href="/kosullar" className="font-medium text-primary underline">Kullanım Koşulları</Link>&apos;nda.
              </span>
            </p>
          </div>

          <p className="mt-3 text-center text-[11px]">Acil durumda 155 / 112.</p>
        </div>

        <div className="px-6 pb-6 pt-3">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-outline-variant/50 p-3">
            <input
              type="checkbox"
              checked={onay}
              onChange={(e) => setOnay(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ accentColor: "#0e3a6e" }}
            />
            <span className="text-[13px] font-medium text-on-surface">
              Okudum, anladım ve devam etmek istiyorum.
            </span>
          </label>
          <button
            onClick={kabul}
            disabled={!onay}
            className="mt-3 w-full rounded-full bg-primary py-3 text-sm font-semibold text-on-primary transition hover:bg-primary-container disabled:opacity-40"
          >
            Devam et
          </button>
        </div>
      </div>
    </div>
  );
}
