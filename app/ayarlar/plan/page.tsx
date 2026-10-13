"use client";
// PLANLAR & KULLANIM PANOSU (Faz 1 — ödemesiz). Mevcut plan + 30-gün kullanım + plan kartları.
// Yükselt: Faz 1'de anında plan geçişi (ödeme yok); Faz 2'de Stripe Checkout olacak.
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { markaDinle, operatorMu } from "@/lib/markaAuth";
import { hesapPlanGetir, hesapPlanAta, kullanimOzet, type KullanimOzet } from "@/lib/store";
import { PLANLAR, type PlanAnahtar, KULLANIM_ETIKET, type KullanimTuru } from "@/lib/planlar";
import type { User } from "firebase/auth";

const SIRA: PlanAnahtar[] = ["pro", "business", "enterprise"];

export default function PlanSayfasi() {
  const [durum, setDurum] = useState<"yukleniyor" | "girisyok" | "hazir">("yukleniyor");
  const [user, setUser] = useState<User | null>(null);
  const [hesap, setHesap] = useState<{ marka: string; ad: string; email?: string } | null>(null);
  const [plan, setPlan] = useState<PlanAnahtar>("pro");
  const [kullanim, setKullanim] = useState<KullanimOzet | null>(null);
  const [gecis, setGecis] = useState(false);

  const yukle = useCallback(async (uid: string) => {
    const [p, k] = await Promise.all([hesapPlanGetir(uid), kullanimOzet(uid)]);
    setPlan(operatorMu() ? "enterprise" : p);
    setKullanim(k);
  }, []);

  useEffect(() => {
    const un = markaDinle(async (u, h) => {
      if (!u) { setDurum("girisyok"); return; }
      setUser(u); setHesap(h);
      await yukle(u.uid);
      setDurum("hazir");
    });
    return un;
  }, [yukle]);

  const planDegistir = async (hedef: PlanAnahtar) => {
    if (!user || operatorMu() || hedef === plan) return;
    setGecis(true);
    try { await hesapPlanAta(user.uid, hedef); setPlan(hedef); } catch { /* */ }
    setGecis(false);
  };

  const u = (t: KullanimTuru) => kullanim?.turBazli.find((x) => x.tur === t)?.adet || 0;
  const lim = PLANLAR[plan].limitler;
  const limMetin = (n: number) => (n < 0 ? "sınırsız" : String(n));
  const maxGun = Math.max(1, ...(kullanim?.gunBazli.map((g) => g.adet) || [0]));

  return (
    <div className="pl">
      <style>{css}</style>
      <header className="pl-top">
        <Link href="/mercek" className="pl-logo">
          <svg viewBox="0 0 30 30" fill="none"><circle cx="15" cy="15" r="13.2" stroke="var(--pl-lac)" strokeWidth="1.5" /><circle cx="15" cy="15" r="7" stroke="var(--pl-teal)" strokeWidth="1.2" /><circle cx="15" cy="15" r="2.6" fill="var(--pl-teal)" /></svg>
          MirLeon
        </Link>
        <Link href="/mercek" className="pl-geri">← Panele dön</Link>
      </header>

      {durum === "yukleniyor" && <div className="pl-bos">Yükleniyor…</div>}

      {durum === "girisyok" && (
        <div className="pl-bos">
          <p>Planınızı görmek için giriş yapın.</p>
          <Link href="/marka-giris" className="pl-btn primary" style={{ display: "inline-block", marginTop: 12 }}>Giriş / Kayıt</Link>
        </div>
      )}

      {durum === "hazir" && (
        <main className="pl-wrap">
          <h1 className="pl-h1">Planlar ve kullanım</h1>
          <p className="pl-sub">{hesap?.ad ? <><b>{hesap.ad}</b> · </> : null}Abonelik planınızı ve kullanımınızı yönetin.</p>

          {/* ÜST: mevcut plan + kullanım özeti */}
          <div className="pl-grid2">
            <section className="pl-card">
              <div className="pl-crow">
                <div>
                  <div className="pl-eye">MEVCUT PLAN</div>
                  <div className="pl-planad">MirLeon {PLANLAR[plan].ad}</div>
                  <div className="pl-fiil">{PLANLAR[plan].fiil}</div>
                </div>
                <span className="pl-rozet">{PLANLAR[plan].fiyat}<span>{PLANLAR[plan].birim}</span></span>
              </div>
              <div className="pl-usehead">Bu dönem kullanım</div>
              {[
                { t: "derin_analiz" as KullanimTuru, limit: lim.aylikDerinAnaliz },
                { t: "rapor" as KullanimTuru, limit: lim.aylikRapor },
              ].map(({ t, limit }) => {
                const used = u(t); const yuzde = limit < 0 ? Math.min(100, used ? 12 : 0) : limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
                return (
                  <div key={t} className="pl-meter">
                    <div className="pl-meter-h"><span>{KULLANIM_ETIKET[t]}</span><span className="pl-meter-v">{used} / {limMetin(limit)}</span></div>
                    <div className="pl-bar"><i style={{ width: yuzde + "%", background: limit === 0 ? "var(--pl-faint)" : "var(--pl-teal)" }} /></div>
                    {limit === 0 && <div className="pl-lock">Bu özellik {PLANLAR.business.ad} planında açılır</div>}
                  </div>
                );
              })}
              <div className="pl-mini">
                <span>Marka hakkı: <b>{limMetin(lim.marka)}</b></span>
                <span>Yönetilen takedown / yıl: <b>{limMetin(lim.takedownYil)}</b></span>
              </div>
            </section>

            <section className="pl-card">
              <div className="pl-crow">
                <div className="pl-eye">SON 30 GÜN</div>
                <div className="pl-big">{kullanim?.toplam || 0}<span> işlem</span></div>
              </div>
              <div className="pl-spark">
                {(kullanim?.gunBazli || []).length === 0
                  ? <div className="pl-sparkbos">Bu dönemde kayıtlı işlem yok</div>
                  : (kullanim?.gunBazli || []).map((g) => <i key={g.gun} title={`${g.gun}: ${g.adet}`} style={{ height: Math.max(4, (g.adet / maxGun) * 100) + "%" }} />)}
              </div>
              <div className="pl-usehead" style={{ marginTop: 14 }}>Türe göre</div>
              {(kullanim?.turBazli || []).length === 0
                ? <div className="pl-lock" style={{ marginTop: 6 }}>Henüz işlem yok — analiz/rapor yaptıkça burada görünür.</div>
                : (kullanim?.turBazli || []).map((x) => (
                  <div key={x.tur} className="pl-trow"><span>{KULLANIM_ETIKET[x.tur] || x.tur}</span><span className="pl-trv">{x.adet}</span></div>
                ))}
            </section>
          </div>

          {/* PLAN KARTLARI */}
          <h2 className="pl-h2">Planını değiştir</h2>
          {!operatorMu() && <p className="pl-note">Faz 1: yükseltme <b>anında</b> ve ücretsizdir (ödeme entegrasyonu Faz 2). Plan değiştirince özellikler hemen açılır/kapanır.</p>}
          <div className="pl-plans">
            {SIRA.map((pk) => {
              const P = PLANLAR[pk]; const mevcut = pk === plan;
              return (
                <div key={pk} className={"pl-plan" + (P.populer ? " pop" : "") + (mevcut ? " mevcut" : "")}>
                  {P.populer && <span className="pl-badge">EN POPÜLER</span>}
                  <div className="pl-p-eye">{P.fiil}</div>
                  <div className="pl-p-ad">{P.ad}</div>
                  <div className="pl-p-fiyat">{P.fiyat}<span>{P.birim}</span></div>
                  <div className="pl-p-tanim">{P.tanim}</div>
                  <button className={"pl-btn" + (mevcut ? " mevcut-btn" : P.populer ? " primary" : "")} disabled={mevcut || gecis || operatorMu()} onClick={() => planDegistir(pk)}>
                    {mevcut ? "✓ Mevcut planınız" : SIRA.indexOf(pk) > SIRA.indexOf(plan) ? "Yükselt" : "Bu plana geç"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="pl-note" style={{ textAlign: "center", marginTop: 18 }}>
            Fiyatlar temsilîdir. Tüm özellikler için <Link href="/mirleon-landing.html">planları karşılaştırın</Link>.
          </p>
        </main>
      )}
    </div>
  );
}

const css = `
.pl{--pl-bg:#f6f8fb;--pl-panel:#fff;--pl-fg:#11243a;--pl-muted:#5d7085;--pl-faint:#9aacbf;--pl-lac:#0c3557;--pl-teal:#12808a;--pl-tealsoft:#e6f3f4;--pl-line:#e4e9f0;
  min-height:100vh;background:var(--pl-bg);color:var(--pl-fg);font-family:'IBM Plex Sans',system-ui,sans-serif;}
.pl *{box-sizing:border-box}
.pl-top{display:flex;align-items:center;justify-content:space-between;max-width:1060px;margin:0 auto;padding:18px 20px}
.pl-logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:17px;color:var(--pl-fg);text-decoration:none}
.pl-logo svg{width:24px;height:24px}
.pl-geri{color:var(--pl-muted);text-decoration:none;font-size:13.5px}
.pl-geri:hover{color:var(--pl-teal)}
.pl-bos{max-width:1060px;margin:60px auto;text-align:center;color:var(--pl-muted)}
.pl-wrap{max-width:1060px;margin:0 auto;padding:8px 20px 70px}
.pl-h1{font-family:'IBM Plex Serif',Georgia,serif;font-weight:700;font-size:30px;margin:14px 0 4px;letter-spacing:-.02em}
.pl-sub{color:var(--pl-muted);font-size:15px;margin:0 0 26px}
.pl-grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:760px){.pl-grid2{grid-template-columns:1fr}}
.pl-card{background:var(--pl-panel);border:1px solid var(--pl-line);border-radius:16px;padding:22px}
.pl-crow{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.pl-eye{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.12em;color:var(--pl-teal)}
.pl-planad{font-family:'IBM Plex Serif',serif;font-weight:700;font-size:23px;margin-top:6px}
.pl-fiil{color:var(--pl-muted);font-size:13px;margin-top:2px}
.pl-rozet{font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:600;color:var(--pl-fg);white-space:nowrap}
.pl-rozet span{font-size:11px;color:var(--pl-muted);margin-left:3px}
.pl-usehead{font-size:12px;color:var(--pl-faint);font-family:'IBM Plex Mono',monospace;letter-spacing:.04em;margin:20px 0 10px;text-transform:uppercase}
.pl-meter{margin-bottom:13px}
.pl-meter-h{display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px}
.pl-meter-v{font-family:'IBM Plex Mono',monospace;color:var(--pl-muted)}
.pl-bar{height:7px;border-radius:5px;background:var(--pl-line);overflow:hidden}
.pl-bar i{display:block;height:100%;border-radius:5px;transition:width .4s}
.pl-lock{font-size:11.5px;color:var(--pl-faint);margin-top:4px}
.pl-mini{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:16px;padding-top:14px;border-top:1px solid var(--pl-line);font-size:12.5px;color:var(--pl-muted)}
.pl-mini b{color:var(--pl-fg)}
.pl-big{font-family:'IBM Plex Serif',serif;font-weight:700;font-size:30px;text-align:right}
.pl-big span{font-size:13px;color:var(--pl-muted);font-family:'IBM Plex Sans',sans-serif;font-weight:400;margin-left:4px}
.pl-spark{display:flex;align-items:flex-end;gap:3px;height:74px;margin-top:16px;padding:8px;background:var(--pl-bg);border-radius:10px}
.pl-spark i{flex:1;min-width:2px;background:var(--pl-teal);border-radius:2px 2px 0 0;opacity:.85}
.pl-sparkbos{width:100%;text-align:center;align-self:center;color:var(--pl-faint);font-size:12.5px}
.pl-trow{display:flex;justify-content:space-between;font-size:13.5px;padding:7px 0;border-bottom:1px solid var(--pl-line)}
.pl-trow:last-child{border-bottom:none}
.pl-trv{font-family:'IBM Plex Mono',monospace;font-weight:600}
.pl-h2{font-family:'IBM Plex Serif',serif;font-weight:700;font-size:21px;margin:38px 0 4px}
.pl-note{color:var(--pl-muted);font-size:13px;margin:0 0 18px}
.pl-note a{color:var(--pl-teal)}
.pl-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media(max-width:760px){.pl-plans{grid-template-columns:1fr}}
.pl-plan{position:relative;background:var(--pl-panel);border:1px solid var(--pl-line);border-radius:15px;padding:22px;display:flex;flex-direction:column}
.pl-plan.pop{border-color:var(--pl-teal)}
.pl-plan.mevcut{box-shadow:inset 0 0 0 1.5px var(--pl-teal)}
.pl-badge{position:absolute;top:-11px;left:22px;background:var(--pl-teal);color:#fff;font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.07em;padding:3px 11px;border-radius:100px}
.pl-p-eye{font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--pl-teal)}
.pl-p-ad{font-family:'IBM Plex Serif',serif;font-weight:700;font-size:22px;margin-top:6px}
.pl-p-fiyat{font-family:'IBM Plex Serif',serif;font-weight:700;font-size:24px;margin-top:12px}
.pl-p-fiyat span{font-size:12px;color:var(--pl-muted);font-family:'IBM Plex Sans',sans-serif;font-weight:400;margin-left:5px}
.pl-p-tanim{color:var(--pl-muted);font-size:13px;line-height:1.5;margin:10px 0 18px;flex:1}
.pl-btn{font-family:inherit;font-weight:600;font-size:14px;padding:11px;border-radius:10px;border:1.5px solid var(--pl-line);background:transparent;color:var(--pl-fg);cursor:pointer;text-decoration:none;text-align:center;transition:filter .14s}
.pl-btn:hover:not(:disabled){filter:brightness(.97)}
.pl-btn.primary{background:var(--pl-teal);border-color:var(--pl-teal);color:#fff}
.pl-btn.mevcut-btn{background:var(--pl-tealsoft);border-color:var(--pl-tealsoft);color:var(--pl-teal);cursor:default}
.pl-btn:disabled{opacity:.7;cursor:default}
`;
