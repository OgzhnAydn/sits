import { NextRequest, NextResponse } from "next/server";
import { coz } from "@/lib/sifrele";
import { epostaIzlemelerGetir, epostaIzlemeGuncelle } from "@/lib/store";
import { sizintiSay } from "@/lib/sizintiSay";
import { mailGonder, mailSablon, mailVar } from "@/lib/mail";
import { yenidenTaraBatch } from "@/lib/yenidenTara";

export const runtime = "nodejs";
export const maxDuration = 60;

const PERIYOT_MS: Record<string, number> = {
  haftalik: 7 * 24 * 3600 * 1000,
  aylik: 30 * 24 * 3600 * 1000,
};

// Periyodik e-posta sızıntı izleme. Vercel Cron (günde 1) çağırır; zamanı gelen
// abonelikleri kontrol eder, YENİ sızıntı çıktıysa ya da periyot dolduysa mail atar.
export async function GET(req: NextRequest) {
  const sir = process.env.CRON_SECRET;
  if (sir && req.headers.get("authorization") !== `Bearer ${sir}`) {
    return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  }
  // Günlük YENİDEN TARAMA: aktif adayların bir batch'ini yeniden analiz et → risk
  // yörüngesine nokta ekle (mail servisinden bağımsız çalışır). Ayrı cron limiti yemez.
  const yorunge = await yenidenTaraBatch(6).catch(() => ({ taranan: 0, kaydedilen: 0, aktif: 0, yukselen: 0 }));

  if (!mailVar()) return NextResponse.json({ ok: true, gonderilen: 0, yorunge, not: "mail servisi kapalı" });

  const now = Date.now();
  const aboneler = await epostaIzlemelerGetir();
  let gonderilen = 0;

  for (const ab of aboneler) {
    const periyotMs = PERIYOT_MS[ab.periyot] || PERIYOT_MS.haftalik;
    const zamaniGeldi = now - (ab.sonBildirim || 0) >= periyotMs;
    const email = coz(ab.emailEnc);
    if (!email) continue;

    const durum = await sizintiSay(email);
    if (durum.hata) continue; // kontrol edilemedi → bir sonraki turda dene

    const yeniSizinti = durum.sayi > (ab.sonSizinti || 0);
    // Yeni sızıntı çıktıysa HEMEN; yoksa yalnız periyot dolduğunda "durum" raporu.
    if (!yeniSizinti && !zamaniGeldi) continue;

    const konu = yeniSizinti
      ? "E-postan yeni bir veri ihlalinde görüldü"
      : durum.sayi > 0
      ? "E-posta güvenlik raporu"
      : "E-posta güvenlik raporu — temiz";

    const govde = yeniSizinti
      ? `<p><b>Dikkat:</b> izlediğimiz kaynaklarda e-postanın <b>yeni bir veri ihlalinde</b> görüldüğünü tespit ettik (toplam ${durum.sayi} ihlal).</p>
         <p><b>Görüldüğü sızıntılar:</b> ${durum.isimler.join(", ") || "-"}</p>
         <p><b>Ne yapmalısın:</b> bu e-postayla giriş yaptığın yerlerde şifreni değiştir, aynı şifreyi kullandığın hesapları da güncelle, mümkün olan her yerde iki adımlı doğrulama (2FA) aç.</p>`
      : durum.sayi > 0
      ? `<p>E-postan bilinen <b>${durum.sayi}</b> veri ihlalinde görünüyor (yeni bir değişiklik yok).</p>
         <p><b>Sızıntılar:</b> ${durum.isimler.join(", ") || "-"}</p>
         <p>Güçlü, benzersiz şifre + 2FA kullanmaya devam et. Merak etme, seni izlemeye devam ediyoruz.</p>`
      : `<p>İyi haber — izlediğimiz kaynaklarda e-postanla ilgili <b>yeni bir sızıntı yok</b>. Her şey yolunda görünüyor </p>
         <p>Seni izlemeye devam ediyoruz; bir şey çıkarsa hemen haber veririz.</p>`;

    const ok = await mailGonder(email, konu, mailSablon("E-posta sızıntı izleme", govde));
    if (ok) {
      gonderilen++;
      await epostaIzlemeGuncelle(ab.id, now, durum.sayi);
    }
  }

  return NextResponse.json({ ok: true, gonderilen, toplam: aboneler.length, yorunge });
}
