"use client";

// KAYIT DIŞI E-TİCARET RADARI — Ticaret Bakanlığı ekranı. CT akışından TR e-ticaret siteleri
// yakalanır, ETBİS siciliyle çapraz kontrol edilir; KAYITSIZ olanlar canlı listelenir.
// Kurumsal MirLeon dili: IBM Plex + lacivert dark ops-konsol.

import { useEffect, useRef, useState } from "react";

type Aday = {
  domain: string; guven: number; platform: string | null; odemeGecitleri: string[];
  sinyaller: string[]; etbisKayitli: boolean; etbisDogrulanmis: boolean | null; zaman: number;
};
type Kpi = { toplam: number; dogrulanmis: number; son24: number };

function zamanKisa(ms: number): string {
  const dk = Math.floor((Date.now() - ms) / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dk`;
  const s = Math.floor(dk / 60);
  return s < 24 ? `${s} sa` : `${Math.floor(s / 24)} g`;
}
function guvenRenk(g: number): string {
  if (g >= 70) return "#f5623d";
  if (g >= 55) return "#f2a33c";
  return "#8fa6bd";
}

export default function EticaretRadar() {
  const [liste, setListe] = useState<Aday[] | null>(null);
  const [kpi, setKpi] = useState<Kpi>({ toplam: 0, dogrulanmis: 0, son24: 0 });
  const [ctEvren, setCtEvren] = useState(0);
  const [tarandi, setTarandi] = useState(0);
  const [analiz, setAnaliz] = useState(0);
  const durdu = useRef(false);

  useEffect(() => {
    durdu.current = false;
    async function cek() {
      try {
        const d = await (await fetch("/api/eticaret-radar", { cache: "no-store" })).json();
        if (durdu.current) return;
        setListe(Array.isArray(d.liste) ? d.liste : []);
        setKpi(d.kpi || { toplam: 0, dogrulanmis: 0, son24: 0 });
        setCtEvren(d.ctEvren || 0);
        setTarandi((t) => t + (d.tarandi || 0));
        setAnaliz((a) => a + (d.analizEdildi || 0));
      } catch { if (!durdu.current) setListe((l) => l ?? []); }
    }
    cek();
    const t = setInterval(cek, 6000);
    return () => { durdu.current = true; clearInterval(t); };
  }, []);

  return (
    <div className="er">
      <Stil />
      {/* ÜST ÇUBUK */}
      <div className="er-bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mirleon-white.svg" alt="MirLeon" className="er-logo" />
        <span className="er-ayrac" />
        <div className="er-baslik">
          <b>Kayıt Dışı E-Ticaret Radarı</b>
          <i>Ticaret Bakanlığı · ETBİS çapraz denetimi</i>
        </div>
        <div className="er-canli"><span className="er-nokta" />CANLI</div>
      </div>

      <div className="er-govde">
        {/* KPI */}
        <div className="er-kpi">
          <div className="er-k">
            <div className="er-kv" style={{ color: "#f5623d" }}>{kpi.toplam.toLocaleString("tr-TR")}</div>
            <div className="er-kl">kayıt dışı e-ticaret adayı</div>
          </div>
          <div className="er-k">
            <div className="er-kv" style={{ color: "#f2a33c" }}>{kpi.son24.toLocaleString("tr-TR")}</div>
            <div className="er-kl">son 24 saatte yakalanan</div>
          </div>
          <div className="er-k">
            <div className="er-kv" style={{ color: "#31c8a0" }}>{(ctEvren / 1e9).toFixed(2)}B</div>
            <div className="er-kl">taranan sertifika (CT)</div>
          </div>
          <div className="er-k">
            <div className="er-kv er-spin"><span className="material-symbols-outlined">radar</span>{analiz.toLocaleString("tr-TR")}</div>
            <div className="er-kl">site analiz edildi</div>
          </div>
        </div>

        {/* AÇIKLAMA */}
        <div className="er-bilgi">
          <span className="material-symbols-outlined">info</span>
          <span>Sertifika akışından Türkiye&apos;ye satış yapan e-ticaret sitelerini <b>doğdukları an</b> yakalar, <b>ETBİS siciliyle</b> çapraz kontrol ederiz. <b style={{ color: "#f5623d" }}>ETBİS&apos;te bulunmayan</b> = kayıt dışı e-ticaret adayı. Bu bir <b>örnekleme radarıdır</b>; kesin &quot;kayıtsız&quot; hükmü için resmî ETBİS teyidi gerekir.</span>
        </div>

        {/* LİSTE */}
        {liste === null && <div className="er-durum"><span className="material-symbols-outlined er-donuyor">progress_activity</span>Akış taranıyor…</div>}
        {liste?.length === 0 && <div className="er-bos">Henüz kayıt dışı e-ticaret adayı yakalanmadı. Radar akışı taradıkça burada belirir.</div>}

        {liste && liste.length > 0 && (
          <div className="er-liste">
            {liste.map((a) => (
              <div key={a.domain} className="er-satir">
                <div className="er-s-sol">
                  <div className="er-dom">{a.domain}</div>
                  <div className="er-sinyaller">
                    {a.platform && <span className="er-cip er-plat">{a.platform}</span>}
                    {(a.odemeGecitleri || []).slice(0, 2).map((g) => <span key={g} className="er-cip er-odeme">{g}</span>)}
                    {(a.sinyaller || []).slice(0, 2).map((s, i) => <span key={i} className="er-sinyal">{s}</span>)}
                  </div>
                </div>
                <div className="er-s-sag">
                  <span className="er-etbis">ETBİS&apos;te YOK</span>
                  <span className="er-guven" style={{ color: guvenRenk(a.guven), borderColor: guvenRenk(a.guven) }}>güven {a.guven}</span>
                  <span className="er-zaman">{zamanKisa(a.zaman)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="er-alt">MirLeon · Kayıt Dışı E-Ticaret Radarı · gerçek CT akışı + yerel ETBİS sicili ({new Date().getFullYear()})</div>
    </div>
  );
}

function Stil() {
  return (
    <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@600&display=swap');
    .er{position:fixed;inset:0;display:flex;flex-direction:column;background:#080f1a;color:#e9f2fa;font-family:'IBM Plex Sans',system-ui,sans-serif;overflow:hidden}
    .er *{box-sizing:border-box}
    .er-bar{display:flex;align-items:center;gap:12px;padding:11px 20px;border-bottom:1px solid #17293c;background:#0a1420;flex-shrink:0}
    .er-logo{height:20px;width:auto}
    .er-ayrac{width:1px;height:18px;background:#1f3652}
    .er-baslik b{font-family:'IBM Plex Serif',serif;font-weight:600;font-size:15px;display:block;line-height:1.1}
    .er-baslik i{font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#5c748b;letter-spacing:.1em;text-transform:uppercase;font-style:normal}
    .er-canli{margin-left:auto;display:flex;align-items:center;gap:6px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;color:#31c8a0}
    .er-nokta{width:8px;height:8px;border-radius:4px;background:#31c8a0;animation:erYan 1.4s ease-in-out infinite}
    @keyframes erYan{0%,100%{opacity:1}50%{opacity:.3}}
    .er-govde{flex:1;min-height:0;overflow-y:auto;padding:16px 20px 20px}
    .er-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    @media(max-width:640px){.er-kpi{grid-template-columns:repeat(2,1fr)}}
    .er-k{border:1px solid #17293c;border-radius:12px;background:#0d1a29;padding:13px 15px}
    .er-kv{font-family:'IBM Plex Mono',monospace;font-size:24px;font-weight:700;line-height:1;display:flex;align-items:center;gap:6px}
    .er-kv .material-symbols-outlined{font-size:19px;color:#4d9fe0}
    .er-spin{color:#4d9fe0}
    .er-spin .material-symbols-outlined{animation:erDon 3s linear infinite}
    @keyframes erDon{to{transform:rotate(360deg)}}
    .er-kl{font-size:11px;color:#5c748b;margin-top:6px}
    .er-bilgi{display:flex;gap:9px;align-items:flex-start;margin-top:12px;padding:11px 14px;border:1px solid #17293c;border-radius:12px;background:rgba(77,159,224,.06);font-size:12px;line-height:1.55;color:#8fa6bd}
    .er-bilgi .material-symbols-outlined{font-size:17px;color:#4d9fe0;flex-shrink:0}
    .er-durum{display:flex;align-items:center;gap:8px;margin-top:22px;font-size:13px;color:#8fa6bd}
    .er-donuyor{animation:erDon 1.2s linear infinite;color:#4d9fe0}
    .er-bos{margin-top:26px;border:1px dashed #1f3652;border-radius:12px;padding:26px;text-align:center;font-size:13px;color:#5c748b}
    .er-liste{margin-top:14px;display:flex;flex-direction:column;gap:8px}
    .er-satir{display:flex;align-items:center;gap:12px;padding:11px 14px;border:1px solid #17293c;border-left:3px solid #f5623d;border-radius:10px;background:#0d1a29;animation:erGir .4s ease}
    @keyframes erGir{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    .er-s-sol{flex:1;min-width:0}
    .er-dom{font-family:'IBM Plex Mono',monospace;font-size:13.5px;font-weight:600;color:#e9f2fa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .er-sinyaller{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    .er-cip{font-size:9.5px;font-weight:700;padding:1px 8px;border-radius:20px;white-space:nowrap}
    .er-plat{background:#1e3a5f;color:#9cc7f0}
    .er-odeme{background:#123a2e;color:#5fd0a8}
    .er-sinyal{font-size:10px;color:#7690aa;background:#101d2e;padding:1px 8px;border-radius:20px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .er-s-sag{display:flex;align-items:center;gap:10px;flex-shrink:0}
    .er-etbis{font-size:9.5px;font-weight:700;letter-spacing:.04em;color:#160a0e;background:#f5623d;padding:2px 9px;border-radius:20px;white-space:nowrap}
    .er-guven{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;border:1px solid;padding:1px 8px;border-radius:20px;white-space:nowrap}
    .er-zaman{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#5c748b;width:42px;text-align:right}
    .er-alt{flex-shrink:0;padding:8px 20px;border-top:1px solid #12202e;font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#5c748b}
    .er-govde::-webkit-scrollbar{width:9px}
    .er-govde::-webkit-scrollbar-track{background:#0a1420}
    .er-govde::-webkit-scrollbar-thumb{background:#1f3652;border-radius:5px;border:2px solid #0a1420}
    @media(max-width:640px){.er-sinyal{display:none}.er-s-sag{gap:7px}}
    `}</style>
  );
}
