"use client";

import { useEffect, useState } from "react";

// E-posta ihlal + şifre sızıntı kontrolü.
// ŞİFRE: tamamen tarayıcıda SHA-1'lenir; yalnızca özetin ilk 5 hanesi HIBP'ye
// gider (k-anonimlik) — şifre hiçbir yere açık gönderilmez.

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export default function Guvenlik() {
  // E-posta
  const [email, setEmail] = useState("");
  const [eYuk, setEYuk] = useState(false);
  const [eSonuc, setESonuc] = useState<{ bulundu: boolean; adet: number; sizintilar: string[]; detaylar?: { ad: string; alan?: string; yil?: string; veriler: string[]; sifreVar: boolean; kayit: number }[]; sifreliSizinti?: number; veriTurleri?: string[]; itibar?: { disposable: boolean; fraudSkoru: number; recentAbuse: boolean; gecerli: boolean } | null; footprint?: { platformlar: string[]; skor: number } | null } | null>(null);
  const [eHata, setEHata] = useState("");
  const [tumSizinti, setTumSizinti] = useState(false); // ihlal listesini genişlet/daralt
  // Periyodik izleme aboneliği
  const [izPeriyot, setIzPeriyot] = useState("haftalik");
  const [izDurum, setIzDurum] = useState<"" | "gonderiliyor" | "ok" | "hata">("");
  const [izMesaj, setIzMesaj] = useState("");

  async function abonelOl() {
    if (!email.trim() || izDurum === "gonderiliyor") return;
    setIzDurum("gonderiliyor"); setIzMesaj("");
    try {
      const r = await fetch("/api/izle-eposta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), periyot: izPeriyot }),
      });
      const d = await r.json();
      if (r.ok) { setIzDurum("ok"); setIzMesaj(`Tamam! Bu e-postayı ${izPeriyot === "aylik" ? "aylık" : "haftalık"} izleyip yeni sızıntı çıkarsa sana haber vereceğim.`); }
      else { setIzDurum("hata"); setIzMesaj(d.hata || "Kaydedilemedi."); }
    } catch { setIzDurum("hata"); setIzMesaj("Bağlantı hatası."); }
  }

  // Şifre
  const [sifre, setSifre] = useState("");
  const [sYuk, setSYuk] = useState(false);
  const [sSayi, setSSayi] = useState<number | null>(null);
  const [sHata, setSHata] = useState("");

  // Kullanıcı adı ayak izi (self-check)
  const [kad, setKad] = useState("");
  const [kYuk, setKYuk] = useState(false);
  const [kSonuc, setKSonuc] = useState<{ adet: number; hesaplar: { platform: string; url?: string }[] } | null>(null);
  const [kHata, setKHata] = useState("");

  async function ayakiziKontrol() {
    const q = kad.trim().replace(/^@/, "");
    if (!q || kYuk) return;
    setKYuk(true); setKHata(""); setKSonuc(null);
    try {
      const r = await fetch("/api/ayakizi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kullanici: q }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.hata || "Hata");
      setKSonuc(d);
    } catch (err) {
      setKHata(err instanceof Error ? err.message : "Kontrol edilemedi.");
    } finally {
      setKYuk(false);
    }
  }

  // Ana sayfadan ?email= ile gelindiyse otomatik doldur + kontrol et
  useEffect(() => {
    const em = new URLSearchParams(window.location.search).get("email");
    if (em) { setEmail(em); setTimeout(() => emailKontrolIle(em), 50); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function emailKontrolIle(hedef: string) {
    setEYuk(true); setEHata(""); setESonuc(null); setTumSizinti(false);
    try {
      const r = await fetch("/api/sizinti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: hedef }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.hata || "Hata");
      setESonuc(d);
    } catch (err) {
      setEHata(err instanceof Error ? err.message : "Kontrol edilemedi.");
    } finally {
      setEYuk(false);
    }
  }

  async function emailKontrol() {
    setEYuk(true); setEHata(""); setESonuc(null); setTumSizinti(false);
    try {
      const r = await fetch("/api/sizinti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.hata || "Hata");
      setESonuc(d);
    } catch (err) {
      setEHata(err instanceof Error ? err.message : "Kontrol edilemedi.");
    } finally {
      setEYuk(false);
    }
  }

  async function sifreKontrol() {
    if (!sifre) return;
    setSYuk(true); setSHata(""); setSSayi(null);
    try {
      const hash = await sha1Hex(sifre);
      const onEk = hash.slice(0, 5);
      const sonEk = hash.slice(5);
      const r = await fetch(`https://api.pwnedpasswords.com/range/${onEk}`);
      const t = await r.text();
      let sayi = 0;
      for (const satir of t.split("\n")) {
        const [suf, adet] = satir.trim().split(":");
        if (suf === sonEk) { sayi = parseInt(adet, 10) || 0; break; }
      }
      setSSayi(sayi);
      setSifre(""); // şifreyi bellekte tutma
    } catch {
      setSHata("Kontrol edilemedi, tekrar dene.");
    } finally {
      setSYuk(false);
    }
  }

  return (
    <div className="px-5 pt-3 pb-6">
      <h1 className="font-display text-2xl font-semibold text-on-surface">Hesabım güvende mi?</h1>
      <p className="mt-1 text-[15px] text-on-surface-variant">
        E-postan veri ihlallerinde geçmiş mi, şifren çalınmış listelerde var mı — öğren.
      </p>

      {/* E-POSTA */}
      <div className="mt-5 rounded-3xl border border-outline-variant/40 bg-surface-lowest p-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>mail</span>
          <span className="text-sm font-semibold text-on-surface">E-posta veri ihlali</span>
        </div>
        <p className="mt-1 text-[13px] text-on-surface-variant">Bu e-posta hangi sızıntılarda görülmüş? (E-postan saklanmaz.)</p>
        <div className="mt-3 flex gap-2">
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@eposta.com"
            className="min-w-0 flex-1 rounded-2xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-[15px] text-on-surface outline-none focus:border-primary"
          />
          <button
            onClick={emailKontrol}
            disabled={eYuk || !email}
            className="press shrink-0 rounded-2xl bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {eYuk ? "…" : "Kontrol"}
          </button>
        </div>
        {eHata && <p className="mt-2 text-sm text-error">{eHata}</p>}
        {eSonuc && (
          <div className="mt-3">
            {/* IPQS itibar — kullan-at / riskli e-posta uyarısı (ihlalden bağımsız) */}
            {eSonuc.itibar && (eSonuc.itibar.disposable || eSonuc.itibar.recentAbuse || eSonuc.itibar.fraudSkoru >= 85) && (
              <div className="mb-2 rounded-2xl border border-error/30 bg-error/5 p-3.5">
                <p className="text-sm font-bold text-error">Bu e-posta adresi riskli görünüyor</p>
                <ul className="mt-1 list-disc pl-5 text-[13px] text-on-surface">
                  {eSonuc.itibar.disposable && <li><b>Kullan-at (geçici) e-posta</b> — dolandırıcılar kimliklerini gizlemek için sıkça kullanır.</li>}
                  {eSonuc.itibar.recentAbuse && <li>Yakın zamanda <b>kötüye kullanım</b> kayıtlarında görüldü.</li>}
                  {eSonuc.itibar.fraudSkoru >= 85 && <li>Yüksek dolandırıcılık risk skoru ({eSonuc.itibar.fraudSkoru}/100).</li>}
                </ul>
              </div>
            )}
            {/* SEON dijital ayak izi — hangi platformlarda kayıtlı (anahtar varsa) */}
            {eSonuc.footprint && eSonuc.footprint.platformlar.length > 0 && (
              <div className="mb-2 rounded-2xl border border-outline-variant/40 bg-surface-lowest p-3.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 17 }}>travel_explore</span>
                  Dijital ayak izin: {eSonuc.footprint.platformlar.length} platform
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {eSonuc.footprint.platformlar.map((p, i) => (
                    <span key={i} className="rounded-full bg-primary/8 px-2.5 py-1 text-[12px] font-medium text-primary">{p}</span>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-on-surface-variant">Bu e-posta bu platformlarda kayıtlı görünüyor. Kullanmadıklarını kapatmayı düşün.</p>
              </div>
            )}
            {eSonuc.bulundu ? (
              <div className="rounded-2xl bg-error-container p-3.5">
                <p className="text-sm font-bold text-error">Bu e-posta {eSonuc.adet} veri ihlalinde bulundu.</p>
                {eSonuc.veriTurleri && eSonuc.veriTurleri.length > 0 && (
                  <p className="mt-1.5 text-[13px] text-on-surface">
                    <b>Sızan veri türleri:</b> {eSonuc.veriTurleri.join(", ")}
                  </p>
                )}
                {/* ŞİFRE sızan ihlaller özel uyarı */}
                {(eSonuc.sifreliSizinti ?? 0) > 0 && (
                  <p className="mt-2 rounded-xl bg-error/10 px-2.5 py-1.5 text-[12.5px] font-semibold text-error">
                    Bunların {eSonuc.sifreliSizinti} tanesinde <b>şifren de</b> sızdı — aşağıda işaretli siteleri <b>öncelikle</b> değiştir.
                  </p>
                )}
                {/* DETAYLI LİSTE: hangi site, hangi yıl, ne sızdı */}
                {eSonuc.detaylar && eSonuc.detaylar.length > 0 ? (
                  <>
                    <div className="mt-2.5 space-y-1.5">
                      {(tumSizinti ? eSonuc.detaylar : eSonuc.detaylar.slice(0, 8)).map((d, i) => (
                        <div key={i} className="rounded-xl bg-surface-lowest px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-bold text-on-surface">
                              {d.sifreVar && ""}{d.ad}
                            </span>
                            {d.yil && <span className="shrink-0 text-[11px] font-medium text-on-surface-variant">{d.yil}</span>}
                          </div>
                          {d.veriler.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {d.veriler.map((v, j) => (
                                <span key={j} className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${v === "şifre" ? "bg-error/15 text-error" : "bg-surface-container text-on-surface-variant"}`}>{v}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {eSonuc.detaylar.length > 8 && (
                      <button onClick={() => setTumSizinti((v) => !v)} className="mt-2 text-[12.5px] font-semibold text-primary">
                        {tumSizinti ? "− Daha az göster" : `+ ${eSonuc.detaylar.length - 8} ihlal daha göster`}
                      </button>
                    )}
                  </>
                ) : eSonuc.sizintilar.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {eSonuc.sizintilar.map((s, i) => (
                      <span key={i} className="rounded-full bg-surface-lowest px-2 py-0.5 text-[11px] font-medium text-on-surface">{s}</span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 text-[13px] leading-relaxed text-on-surface">
                  <b>Ne yapmalısın:</b>
                  <ul className="mt-1 list-disc pl-5">
                    <li>Bu e-postayla giriş yaptığın yerlerde şifreni <b>değiştir</b>.</li>
                    <li>Aynı şifreyi başka hesaplarda kullandıysan <b>hepsini</b> değiştir.</li>
                    <li>Mümkün olan her yerde <b>iki adımlı doğrulama (2FA)</b> aç.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-secondary-container p-3.5">
                <p className="text-sm font-semibold text-on-surface">Bilinen ihlallerde bu e-posta görünmüyor.</p>
                <p className="mt-1 text-[13px] text-on-surface-variant">Yine de güçlü, benzersiz şifre + 2FA kullanmaya devam et.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PERİYODİK İZLEME ABONELİĞİ */}
      <div className="mt-4 rounded-3xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>notifications_active</span>
          <span className="text-sm font-semibold text-on-surface">Beni düzenli izle</span>
        </div>
        <p className="mt-1 text-[13px] text-on-surface-variant">
          E-postanı yaz, periyodunu seç — yeni bir sızıntı çıkarsa <b>sana e-posta ile haber verelim</b>. (Anlık kontrol zaten yukarıda, ücretsiz.)
        </p>
        <div className="mt-3 flex gap-2">
          <select
            value={izPeriyot}
            onChange={(e) => setIzPeriyot(e.target.value)}
            className="rounded-2xl border border-outline-variant/70 bg-surface-lowest px-3 py-3 text-[14px] text-on-surface outline-none focus:border-primary"
          >
            <option value="haftalik">Haftalık</option>
            <option value="aylik">Aylık</option>
          </select>
          <button
            onClick={abonelOl}
            disabled={izDurum === "gonderiliyor" || !email.trim()}
            className="press flex-1 rounded-2xl bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {izDurum === "gonderiliyor" ? "…" : "Beni izle"}
          </button>
        </div>
        {!email.trim() && <p className="mt-1.5 text-[11px] text-on-surface-variant">Önce yukarıya e-postanı yaz.</p>}
        {izMesaj && <p className={`mt-2 text-[13px] ${izDurum === "ok" ? "text-secondary" : "text-error"}`}>{izMesaj}</p>}
      </div>

      {/* ŞİFRE */}
      <div className="mt-4 rounded-3xl border border-outline-variant/40 bg-surface-lowest p-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>password</span>
          <span className="text-sm font-semibold text-on-surface">Şifre sızıntı kontrolü</span>
        </div>
        <p className="mt-1 flex items-start gap-1.5 text-[13px] text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary" style={{ fontSize: 15 }}>lock</span>
          <span>Şifren cihazından <b>çıkmaz</b>. Sadece şifreli özetinin ilk 5 hanesi sorgulanır (k-anonimlik).</span>
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            autoComplete="off"
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            placeholder="Kontrol edilecek şifre"
            className="min-w-0 flex-1 rounded-2xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-[15px] text-on-surface outline-none focus:border-primary"
          />
          <button
            onClick={sifreKontrol}
            disabled={sYuk || !sifre}
            className="press shrink-0 rounded-2xl bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {sYuk ? "…" : "Kontrol"}
          </button>
        </div>
        {sHata && <p className="mt-2 text-sm text-error">{sHata}</p>}
        {sSayi !== null && (
          <div className="mt-3">
            {sSayi > 0 ? (
              <div className="rounded-2xl bg-error-container p-3.5">
                <p className="text-sm font-bold text-error">Bu şifre sızıntılarda {sSayi.toLocaleString("tr-TR")} kez görüldü.</p>
                <p className="mt-1 text-[13px] text-on-surface">Bu şifreyi <b>hiçbir hesapta kullanma</b>. Kullandığın her yerde hemen değiştir.</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-secondary-container p-3.5">
                <p className="text-sm font-semibold text-on-surface">Bu şifre bilinen sızıntılarda görünmüyor.</p>
                <p className="mt-1 text-[13px] text-on-surface-variant">Yine de her hesapta farklı şifre + 2FA en güvenlisidir.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* KULLANICI ADI AYAK İZİ (self-check) */}
      <div className="mt-4 rounded-3xl border border-outline-variant/40 bg-surface-lowest p-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>travel_explore</span>
          <span className="text-sm font-semibold text-on-surface">Kullanıcı adım nerede görünüyor?</span>
        </div>
        <p className="mt-1 flex items-start gap-1.5 text-[13px] text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary" style={{ fontSize: 15 }}>info</span>
          <span><b>Kendi</b> kullanıcı adını gir — aynı adın hangi platformlarda açık göründüğünü öğren. (Başkasını araştırma aracı değildir; kişisel veri göstermez.)</span>
        </p>
        <div className="mt-3 flex gap-2">
          <input
            autoCapitalize="none"
            value={kad}
            onChange={(e) => setKad(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ayakiziKontrol()}
            placeholder="@kullaniciadim"
            className="min-w-0 flex-1 rounded-2xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-[15px] text-on-surface outline-none focus:border-primary"
          />
          <button
            onClick={ayakiziKontrol}
            disabled={kYuk || !kad.trim()}
            className="press shrink-0 rounded-2xl bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {kYuk ? "…" : "Tara"}
          </button>
        </div>
        {kHata && <p className="mt-2 text-sm text-error">{kHata}</p>}
        {kSonuc && (
          <div className="mt-3">
            {kSonuc.adet > 0 ? (
              <div className="rounded-2xl bg-primary-container/30 p-3.5">
                <p className="text-sm font-semibold text-on-surface">Bu kullanıcı adı <b>{kSonuc.adet}</b> platformda açık görünüyor:</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {kSonuc.hesaplar.map((h, i) =>
                    h.url ? (
                      <a key={i} href={h.url} target="_blank" rel="noopener noreferrer nofollow"
                        className="press rounded-full bg-surface-lowest px-2.5 py-1 text-[12px] font-medium text-primary underline-offset-2 hover:underline">
                        {h.platform}
                      </a>
                    ) : (
                      <span key={i} className="rounded-full bg-surface-lowest px-2.5 py-1 text-[12px] font-medium text-on-surface">{h.platform}</span>
                    )
                  )}
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-on-surface">
                  <b>Ne yapmalısın:</b> Kullanmadığın hesapları kapat; kalanlarda farklı şifre + 2FA kullan. Aynı kullanıcı adı çok yerde açıksa, dolandırıcının seni tanıması kolaylaşır.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-secondary-container p-3.5">
                <p className="text-sm font-semibold text-on-surface">Taranan platformlarda bu kullanıcı adı açık görünmüyor.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] text-on-surface-variant">
        Veri kaynakları: XposedOrNot · Have I Been Pwned · WhatsMyName. Şifre kontrolü cihazında yapılır.
      </p>
    </div>
  );
}
