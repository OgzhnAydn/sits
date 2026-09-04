"use client";
// Marka girişi — e-posta/parola. Giriş sonrası hesap markasına kilitli /mercek'e gider.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { girisYap, kayitOl, markaDinle } from "@/lib/markaAuth";

export default function MarkaGiris() {
  const router = useRouter();
  const [mod, setMod] = useState<"giris" | "kayit">("giris");
  const [email, setEmail] = useState("");
  const [sifre, setSifre] = useState("");
  const [ad, setAd] = useState("");
  const [resmi, setResmi] = useState("");
  const [hata, setHata] = useState("");
  const [bekle, setBekle] = useState(false);

  // Zaten giriş yapılmışsa doğrudan panoya
  useEffect(() => markaDinle((user, hesap) => { if (user && hesap) router.replace("/mercek"); }), [router]);

  async function gonder(e: React.FormEvent) {
    e.preventDefault(); setHata(""); setBekle(true);
    try {
      if (mod === "giris") await girisYap(email, sifre);
      else {
        if (!resmi.trim()) throw new Error("En az bir resmî adres gir (ör. markam.com).");
        if (sifre.length < 6) throw new Error("Parola en az 6 karakter olmalı.");
        await kayitOl(email, sifre, ad, resmi);
      }
      router.replace("/mercek");
    } catch (err: unknown) {
      const m = (err as { code?: string; message?: string });
      setHata(cevir(m.code) || m.message || "Bir sorun oluştu.");
      setBekle(false);
    }
  }

  return (
    <div className="mg">
      <MgStyle />
      <div className="mg-card">
        <div className="mg-brand">
          <svg width="32" height="32" viewBox="0 0 30 30" fill="none">
            <circle cx="15" cy="15" r="13" stroke="#2f6fb0" strokeWidth="1.4" />
            <circle cx="15" cy="15" r="7" stroke="#4d9fe0" strokeWidth="1.1" />
            <circle cx="15" cy="15" r="2.4" fill="#39bdf8" />
          </svg>
          <div><b>Siber Mercek</b><i>Marka Tehdit Panosu</i></div>
        </div>
        <p className="mg-alt">{mod === "giris" ? "Markanın panosuna giriş yap — yalnız sana yönelik tehditleri görürsün." : "Marka hesabı oluştur — sadece kendi markanın verisine erişir."}</p>

        <form onSubmit={gonder} className="mg-form">
          <label>E-posta<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="marka@sirket.com" /></label>
          {mod === "kayit" && (
            <>
              <label>Marka adı<input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ör. Garanti BBVA" /></label>
              <label>Resmî adresleriniz
                <textarea value={resmi} onChange={(e) => setResmi(e.target.value)} rows={3} required
                  placeholder={"garanti.com.tr\ngarantibbva.com.tr\n(her satıra bir tane)"} />
                <span className="mg-ip">Bu adresler <b>güvenli listeniz</b> olur — bunların DIŞINDA markanızın adını taşıyan her site otomatik <b>sahte</b> olarak yakalanır.</span>
              </label>
            </>
          )}
          <label>Parola<input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} required autoComplete={mod === "giris" ? "current-password" : "new-password"} placeholder={mod === "kayit" ? "en az 6 karakter" : ""} /></label>
          {hata && <div className="mg-hata">{hata}</div>}
          <button type="submit" disabled={bekle} className="mg-btn">{bekle ? "…" : mod === "giris" ? "Giriş yap" : "Hesap oluştur"}</button>
        </form>

        <div className="mg-switch">
          {mod === "giris"
            ? <>Hesabın yok mu? <button onClick={() => { setMod("kayit"); setHata(""); }}>Marka hesabı oluştur</button></>
            : <>Zaten hesabın var mı? <button onClick={() => { setMod("giris"); setHata(""); }}>Giriş yap</button></>}
        </div>
        <Link href="/" className="mg-geri">← Ana sayfa</Link>
      </div>
    </div>
  );
}

function cevir(code?: string): string {
  const m: Record<string, string> = {
    "auth/invalid-credential": "E-posta veya parola hatalı.",
    "auth/user-not-found": "Bu e-posta ile hesap yok.",
    "auth/wrong-password": "Parola hatalı.",
    "auth/email-already-in-use": "Bu e-posta zaten kayıtlı — giriş yap.",
    "auth/invalid-email": "Geçersiz e-posta.",
    "auth/weak-password": "Parola en az 6 karakter olmalı.",
    "auth/too-many-requests": "Çok fazla deneme — biraz sonra tekrar dene.",
  };
  return code ? m[code] || "" : "";
}

function MgStyle() {
  return (
    <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@500&display=swap');
    body{overflow-x:hidden}
    .mg,.mg *,.mg *::before,.mg *::after{box-sizing:border-box}
    .mg{min-height:100vh;min-height:100dvh;width:100%;max-width:100%;overflow-x:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:24px 20px calc(104px + env(safe-area-inset-bottom, 0px));font-family:'IBM Plex Sans',system-ui,sans-serif;
      background:radial-gradient(900px 500px at 55% -10%,#0f2740 0,transparent 60%),linear-gradient(#070e16,#081019);color:#e9f2fa}
    .mg-card{width:100%;max-width:400px;background:linear-gradient(180deg,#0f2033,#0b1622);border:1px solid #234561;border-radius:18px;padding:28px;box-shadow:0 30px 80px -30px rgba(0,0,0,.8)}
    @media (max-width:420px){.mg{padding:16px 14px calc(100px + env(safe-area-inset-bottom, 0px))}.mg-card{padding:22px 18px}}
    .mg-brand{display:flex;align-items:center;gap:11px;margin-bottom:14px}
    .mg-brand b{font-family:'IBM Plex Serif',serif;font-weight:500;font-size:17px;display:block;line-height:1}
    .mg-brand i{font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#5c748b;letter-spacing:.12em;text-transform:uppercase;font-style:normal}
    .mg-alt{font-size:12.5px;color:#8fa6bd;line-height:1.5;margin-bottom:20px}
    .mg-form{display:flex;flex-direction:column;gap:13px}
    .mg-form label{display:flex;flex-direction:column;gap:6px;font-size:11px;color:#8fa6bd;letter-spacing:.03em}
    .mg-form input,.mg-form select,.mg-form textarea{background:#0a1622;border:1px solid #234561;border-radius:9px;padding:11px 12px;color:#e9f2fa;font-size:14px;font-family:inherit;width:100%;resize:vertical}
    .mg-form textarea{font-family:'IBM Plex Mono',monospace;font-size:13px;line-height:1.5}
    .mg-form input:focus,.mg-form select:focus,.mg-form textarea:focus{outline:none;border-color:#39bdf8}
    .mg-ip{font-size:10.5px;color:#5c748b;line-height:1.5;margin-top:2px}
    .mg-ip b{color:#8fa6bd}
    .mg-hata{font-size:12px;color:#f0524f;background:rgba(240,82,79,.1);border:1px solid rgba(240,82,79,.25);border-radius:8px;padding:9px 11px}
    .mg-btn{margin-top:4px;padding:12px;border:none;border-radius:10px;cursor:pointer;background:linear-gradient(180deg,#2f6fb0,#204d80);color:#fff;font-weight:600;font-size:14px;font-family:inherit}
    .mg-btn:hover{filter:brightness(1.12)}.mg-btn:disabled{opacity:.6}
    .mg-switch{margin-top:18px;font-size:12.5px;color:#8fa6bd;text-align:center}
    .mg-switch button{background:none;border:none;color:#39bdf8;font:inherit;font-weight:600;cursor:pointer;padding:0}
    .mg-geri{display:block;margin-top:14px;text-align:center;font-size:12px;color:#5c748b;text-decoration:none}
    .mg-geri:hover{color:#8fa6bd}
    `}</style>
  );
}
