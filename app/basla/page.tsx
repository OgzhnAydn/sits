"use client";
// DEĞER-ÖNCE KAYIT — müşteri tek alan (web sitesi) girer, markasını ANINDA tararız, taklitleri
// GÖSTERİRİZ, beğenirse tek tıkla hesap oluşturur. "Boş form + parola" sürtünmesi yok; önce değer.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { kayitOl } from "@/lib/markaAuth";

type Aday = { domain: string; skor: number; durum?: string };

function sade(x: string) { return x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""); }
function sevRenk(s: number) { return s >= 60 ? "#e5484d" : s >= 45 ? "#f2a33c" : "#f0b93b"; }

export default function Basla() {
  const router = useRouter();
  const [asama, setAsama] = useState<"giris" | "taraniyor" | "sonuc">("giris");
  const [site, setSite] = useState("");
  const [anahtar, setAnahtar] = useState("");
  const [markaAdi, setMarkaAdi] = useState("");
  const [adaylar, setAdaylar] = useState<Aday[]>([]);
  const [hata, setHata] = useState("");
  const [bekle, setBekle] = useState(false);
  // hesap
  const [email, setEmail] = useState("");
  const [sifre, setSifre] = useState("");
  const durdu = useRef(false);

  useEffect(() => () => { durdu.current = true; }, []);

  async function basla(e: React.FormEvent) {
    e.preventDefault(); setHata("");
    const dom = sade(site);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) { setHata("Geçerli bir web adresi girin (ör. markam.com)."); return; }
    setBekle(true);
    try {
      const r = await fetch("/api/marka-kayit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resmi: [dom] }) });
      const j = await r.json();
      if (!r.ok || !j.anahtar) throw new Error(j.hata || "Marka çözümlenemedi.");
      setAnahtar(j.anahtar); setMarkaAdi(j.markaAdi || dom); setAsama("taraniyor");
      // geçmiş taramayı başlat + sonuçları poll et
      fetch(`/api/marka-tara-tekil?marka=${encodeURIComponent(j.anahtar)}`, { cache: "no-store" }).catch(() => {});
      pollEt(j.anahtar);
    } catch (err) { setHata((err as Error).message || "Bir sorun oluştu."); setBekle(false); }
  }

  function pollEt(ah: string) {
    let tur = 0;
    const t = setInterval(async () => {
      tur++;
      try {
        const j = await (await fetch(`/api/marka-adaylari?marka=${encodeURIComponent(ah)}`, { cache: "no-store" })).json();
        if (durdu.current) { clearInterval(t); return; }
        const a: Aday[] = (j.adaylar || []).sort((x: Aday, y: Aday) => (y.skor || 0) - (x.skor || 0));
        setAdaylar(a);
        // ilk sonuçlar geldi ya da ~24sn doldu → sonucu göster
        if (a.length > 0 || tur >= 8) { clearInterval(t); setAsama("sonuc"); setBekle(false); }
      } catch { if (tur >= 8) { clearInterval(t); setAsama("sonuc"); setBekle(false); } }
    }, 3000);
  }

  async function hesapOlustur(e: React.FormEvent) {
    e.preventDefault(); setHata("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setHata("Geçerli bir e-posta girin."); return; }
    if (sifre.length < 6) { setHata("Parola en az 6 karakter olmalı."); return; }
    setBekle(true);
    try {
      await kayitOl(email, sifre, markaAdi, sade(site)); // markayı hesaba bağlar (yeniden-kayıt idempotent)
      router.replace("/mercek");
    } catch (err) {
      const m = err as { code?: string; message?: string };
      const map: Record<string, string> = { "auth/email-already-in-use": "Bu e-posta zaten kayıtlı — giriş yapın.", "auth/invalid-email": "Geçersiz e-posta.", "auth/weak-password": "Parola en az 6 karakter olmalı." };
      setHata((m.code && map[m.code]) || m.message || "Hesap oluşturulamadı."); setBekle(false);
    }
  }

  return (
    <div className="bs">
      <Stil />
      <div className="bs-nav">
        <Link href="/" className="bs-logo"><svg width="26" height="26" viewBox="0 0 30 30" fill="none"><circle cx="15" cy="15" r="13.2" stroke="#0c3557" strokeWidth="1.5" /><circle cx="15" cy="15" r="7" stroke="#2f6fb0" strokeWidth="1.2" /><circle cx="15" cy="15" r="2.6" fill="#12a594" /></svg>MirLeon</Link>
        <Link href="/marka-giris" className="bs-link">Giriş yap</Link>
      </div>

      <div className="bs-wrap">
        {asama === "giris" && (
          <div className="bs-card bs-in">
            <div className="bs-eyebrow">ÜCRETSİZ · 30 SANİYE</div>
            <h1>Markanız internette taklit ediliyor mu?</h1>
            <p className="bs-alt">Web sitenizi girin — markanızı taklit eden sahte adresleri <b>anında</b> tarayıp gösterelim. Hesap gerekmez.</p>
            <form onSubmit={basla} className="bs-form">
              <div className="bs-input"><span>https://</span><input autoFocus value={site} onChange={(e) => setSite(e.target.value)} placeholder="markam.com" inputMode="url" /></div>
              <button className="bs-btn" disabled={bekle}>{bekle ? "Çözümleniyor…" : "Taklitleri Göster →"}</button>
            </form>
            {hata && <div className="bs-hata">{hata}</div>}
            <div className="bs-mini">Örnek: karaca.com · toki.gov.tr · ticaret.gov.tr</div>
          </div>
        )}

        {asama === "taraniyor" && (
          <div className="bs-card bs-in" style={{ textAlign: "center" }}>
            <div className="bs-spin" />
            <h2 style={{ marginTop: 18 }}><b>{markaAdi}</b> için internet taranıyor…</h2>
            <p className="bs-alt">Certificate Transparency akışı ve geçmiş kayıtlar üzerinde markanızı taklit eden adresler aranıyor. Birkaç saniye.</p>
          </div>
        )}

        {asama === "sonuc" && (
          <div className="bs-sonuc bs-in">
            <div className="bs-ozet">
              {adaylar.length > 0 ? (
                <>
                  <div className="bs-rakam" style={{ color: "#e5484d" }}>{adaylar.length}</div>
                  <h2><b>{markaAdi}</b> markasını taklit eden adres bulundu</h2>
                  <p className="bs-alt">Bunlar yalnızca ilk tarama. Hesap oluşturun; sürekli izleyip <b>yeni taklitleri doğdukları an</b> yakalayalım.</p>
                </>
              ) : (
                <>
                  <div className="bs-rakam" style={{ color: "#12a594" }}>✓</div>
                  <h2><b>{markaAdi}</b> için şu an aktif taklit görünmüyor</h2>
                  <p className="bs-alt">Temiz görünüyor — ama taklit siteler her gün doğar. Hesap oluşturun; sürekli izleyip <b>ilk taklit çıktığı an</b> haber verelim.</p>
                </>
              )}
            </div>

            {adaylar.length > 0 && (
              <div className="bs-liste">
                {adaylar.slice(0, 8).map((a) => (
                  <div className="bs-row" key={a.domain}>
                    <span className="bs-dot" style={{ background: sevRenk(a.skor) }} />
                    <span className="bs-dom">{a.domain}</span>
                    <span className="bs-skor" style={{ color: sevRenk(a.skor), borderColor: sevRenk(a.skor) }}>risk {a.skor}</span>
                  </div>
                ))}
                {adaylar.length > 8 && <div className="bs-daha">+{adaylar.length - 8} taklit daha — hesapta tümünü görün</div>}
              </div>
            )}

            <form onSubmit={hesapOlustur} className="bs-hesap">
              <div className="bs-hesap-h">Hesap oluşturup takibe alın</div>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta" autoComplete="email" />
              <input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} placeholder="Parola (en az 6 karakter)" autoComplete="new-password" />
              <button className="bs-btn" disabled={bekle}>{bekle ? "Oluşturuluyor…" : "Hesabı Oluştur ve İzlemeye Al →"}</button>
              {hata && <div className="bs-hata">{hata}</div>}
              <div className="bs-mini">Kart gerekmez. Yalnız kendi markanıza yönelik tehditleri görürsünüz.</div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function Stil() {
  return (
    <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@600;700&display=swap');
    .bs,.bs *{box-sizing:border-box}
    .bs{min-height:100vh;min-height:100dvh;background:#fff;color:#0c1a2b;font-family:'IBM Plex Sans',system-ui,sans-serif}
    .bs-nav{display:flex;align-items:center;justify-content:space-between;max-width:1080px;margin:0 auto;padding:16px 20px}
    .bs-logo{display:flex;align-items:center;gap:9px;font-family:'IBM Plex Serif',serif;font-weight:700;font-size:19px;color:#0c1a2b;text-decoration:none}
    .bs-link{font-size:13.5px;color:#5a7089;text-decoration:none}.bs-link:hover{color:#0c3557}
    .bs-wrap{max-width:560px;margin:0 auto;padding:clamp(24px,7vw,70px) 20px 60px}
    .bs-in{animation:bsUp .5s ease}@keyframes bsUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
    .bs-card{text-align:center}
    .bs-eyebrow{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;color:#12a594;margin-bottom:14px}
    .bs h1{font-family:'IBM Plex Serif',serif;font-weight:700;font-size:clamp(27px,5.4vw,40px);line-height:1.08;letter-spacing:-.02em;margin:0;text-wrap:balance}
    .bs h2{font-family:'IBM Plex Serif',serif;font-weight:600;font-size:clamp(20px,3.6vw,27px);margin:0;letter-spacing:-.01em;text-wrap:balance}
    .bs h2 b,.bs h1 b{color:#0c3557}
    .bs-alt{color:#5a7089;font-size:15.5px;line-height:1.55;margin:14px auto 0;max-width:42ch;text-wrap:balance}
    .bs-form{margin-top:26px;display:flex;flex-direction:column;gap:11px}
    .bs-input{display:flex;align-items:center;border:1.5px solid #d7e0ec;border-radius:12px;overflow:hidden;transition:border-color .15s}
    .bs-input:focus-within{border-color:#2f6fb0}
    .bs-input span{padding:0 4px 0 15px;color:#8699ad;font-family:'IBM Plex Mono',monospace;font-size:15px}
    .bs-input input{flex:1;border:none;outline:none;padding:15px 14px 15px 2px;font-size:17px;font-family:'IBM Plex Mono',monospace;background:transparent;color:#0c1a2b;min-width:0}
    .bs-btn{background:#0c3557;color:#fff;border:none;border-radius:12px;padding:15px;font-size:15.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:filter .15s}
    .bs-btn:hover{filter:brightness(1.12)}.bs-btn:disabled{opacity:.6;cursor:default}
    .bs-hata{margin-top:12px;font-size:13px;color:#d93a3f;background:rgba(229,72,77,.08);border:1px solid rgba(229,72,77,.22);border-radius:9px;padding:9px 12px}
    .bs-mini{margin-top:14px;font-size:12px;color:#8699ad;font-family:'IBM Plex Mono',monospace}
    .bs-spin{width:46px;height:46px;border:3px solid #e3eaf2;border-top-color:#2f6fb0;border-radius:50%;margin:10px auto 0;animation:bsSpin .9s linear infinite}
    @keyframes bsSpin{to{transform:rotate(360deg)}}
    .bs-ozet{text-align:center}
    .bs-rakam{font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:clamp(46px,11vw,70px);line-height:1}
    .bs-liste{margin-top:26px;display:flex;flex-direction:column;gap:8px}
    .bs-row{display:flex;align-items:center;gap:11px;border:1px solid #e3eaf2;border-radius:10px;padding:12px 15px;background:#fff}
    .bs-dot{width:8px;height:8px;border-radius:50%;flex:none}
    .bs-dom{flex:1;min-width:0;font-family:'IBM Plex Mono',monospace;font-size:13.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bs-skor{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;border:1px solid;border-radius:20px;padding:2px 9px;white-space:nowrap}
    .bs-daha{text-align:center;font-size:12.5px;color:#8699ad;font-family:'IBM Plex Mono',monospace;padding:4px}
    .bs-hesap{margin-top:30px;background:#f7f9fc;border:1px solid #e3eaf2;border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:11px}
    .bs-hesap-h{font-weight:600;font-size:15px;text-align:center;margin-bottom:4px}
    .bs-hesap input{border:1.5px solid #d7e0ec;border-radius:10px;padding:13px 14px;font-size:15px;font-family:inherit;outline:none;background:#fff;color:#0c1a2b}
    .bs-hesap input:focus{border-color:#2f6fb0}
    @media (prefers-reduced-motion:reduce){*{animation:none!important}}
    `}</style>
  );
}
