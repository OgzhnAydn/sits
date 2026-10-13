"use client";
import { useState } from "react";

type Node = { id: string; merkez?: boolean; risk?: number | null };
type Edge = { kaynak: string; hedef: string; nedenler: string[] };
type Graf = { ok: boolean; merkez: string; analizEdilmis: boolean; kumeBoyutu: number; kardesSayisi: number; nedenSayim: Record<string, number>; nodes: Node[]; edges: Edge[]; not?: string; hata?: string };

// Bağ nedeni → renk (öncelik sırası: Telegram en güçlü operatör izi).
const NEDEN_RENK: Record<string, string> = {
  "Telegram": "#e64980",
  "takip-ID": "#f59f00",
  "altyapı-DNA": "#4da3ff",
  "aynı sunucu (IP)": "#51cf66",
};
const ONCELIK = ["Telegram", "takip-ID", "altyapı-DNA", "aynı sunucu (IP)"];
const birincilNeden = (n: string[]) => ONCELIK.find((o) => n.includes(o)) || n[0] || "altyapı-DNA";
const kisa = (d: string) => (d.length > 26 ? d.slice(0, 24) + "…" : d);

export default function GrafSayfa() {
  const [domain, setDomain] = useState("");
  const [data, setData] = useState<Graf | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState("");

  const cek = async (d: string) => {
    const dom = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!dom) return;
    setYukleniyor(true); setHata(""); setData(null);
    try {
      const r = await fetch(`/api/kampanya-graf?domain=${encodeURIComponent(dom)}`, { cache: "no-store" });
      const j = (await r.json()) as Graf;
      if (j.hata) setHata(j.hata); else setData(j);
    } catch { setHata("Graf alınamadı (ağ/zaman aşımı)."); }
    finally { setYukleniyor(false); }
  };

  const kardes = data?.nodes.filter((n) => !n.merkez) || [];
  const W = 860, H = 620, cx = W / 2, cy = H / 2;
  const R = Math.max(120, Math.min(260, 70 + kardes.length * 14));
  const konum = (i: number) => {
    const a = (-90 + (i * 360) / Math.max(1, kardes.length)) * (Math.PI / 180);
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  };
  const edgeOf = (hedef: string) => data?.edges.find((e) => e.hedef === hedef);

  return (
    <main style={{ minHeight: "100vh", background: "#0a1420", color: "#e8eef4", fontFamily: "'IBM Plex Sans',system-ui,sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-.01em" }}>Kampanya Grafiği</h1>
        <p style={{ color: "#93a3b4", fontSize: 13.5, margin: "0 0 18px", maxWidth: 640 }}>
          Bir domain yaz; aynı saldırgana ait <b style={{ color: "#cfe3f5" }}>kardeş domainleri</b> bağ nedeniyle (altyapı-DNA · takip-ID · Telegram · aynı sunucu) birlikte görelim. <i>Tek yakalama → tüm küme.</i>
        </p>

        <form onSubmit={(e) => { e.preventDefault(); cek(domain); }} style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="örn. akbank-giris-dogrulama.xyz"
            style={{ flex: "1 1 260px", minWidth: 0, background: "#0f1d2d", border: "1px solid #203349", borderRadius: 8, color: "#e8eef4", padding: "10px 12px", fontSize: 14 }} />
          <button type="submit" disabled={yukleniyor}
            style={{ background: "#1f6feb", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
            {yukleniyor ? "Çiziliyor…" : "Grafı çiz"}
          </button>
        </form>

        {hata && <div style={{ color: "#ff8787", fontSize: 13, marginBottom: 12 }}>{hata}</div>}

        {data && (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, fontSize: 12.5, color: "#93a3b4" }}>
              <span>Küme: <b style={{ color: "#e8eef4" }}>{data.kumeBoyutu}</b> domain</span>
              <span>· Kardeş: <b style={{ color: "#e8eef4" }}>{data.kardesSayisi}</b></span>
              {Object.entries(data.nedenSayim).map(([n, s]) => (
                <span key={n} style={{ color: NEDEN_RENK[n] || "#93a3b4" }}>· {n}: {s}</span>
              ))}
            </div>

            {data.not && <div style={{ fontSize: 12.5, color: "#c7922b", background: "#1c160a", border: "1px solid #3a2e12", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>{data.not}</div>}

            {kardes.length === 0 ? (
              <div style={{ color: "#93a3b4", fontSize: 14, padding: "30px 0" }}>Bu domain için kardeş/küme bağı bulunamadı. (Analiz edilmemişse veya ayırt edici ortak altyapı yoksa küme boş olur — bu dürüst sonuçtur, uydurma bağ eklemeyiz.)</div>
            ) : (
              <div style={{ overflowX: "auto", border: "1px solid #203349", borderRadius: 12, background: "radial-gradient(circle at 50% 45%, #0f1d2d, #0a1420)" }}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", minWidth: 520 }}>
                  {/* kenarlar */}
                  {kardes.map((n, i) => {
                    const p = konum(i); const e = edgeOf(n.id); const renk = NEDEN_RENK[birincilNeden(e?.nedenler || [])] || "#4da3ff";
                    const coklu = (e?.nedenler.length || 0) > 1;
                    return <line key={"e" + n.id} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={renk} strokeWidth={coklu ? 2.4 : 1.3} opacity={coklu ? 0.9 : 0.6} />;
                  })}
                  {/* kardeş düğümler */}
                  {kardes.map((n, i) => {
                    const p = konum(i); const e = edgeOf(n.id); const renk = NEDEN_RENK[birincilNeden(e?.nedenler || [])] || "#4da3ff";
                    const sag = p.x >= cx;
                    return (
                      <g key={"n" + n.id}>
                        <circle cx={p.x} cy={p.y} r={7} fill="#0f1d2d" stroke={renk} strokeWidth={2} />
                        <text x={sag ? p.x + 11 : p.x - 11} y={p.y + 4} textAnchor={sag ? "start" : "end"} fontSize={11} fill="#c7d6e6" fontFamily="'IBM Plex Mono',monospace">{kisa(n.id)}</text>
                      </g>
                    );
                  })}
                  {/* merkez */}
                  <circle cx={cx} cy={cy} r={16} fill="#f5222d" />
                  <circle cx={cx} cy={cy} r={24} fill="none" stroke="#f5222d" strokeWidth={1} opacity={0.4} />
                  <text x={cx} y={cy + 38} textAnchor="middle" fontSize={12.5} fill="#fff" fontWeight={700} fontFamily="'IBM Plex Mono',monospace">{kisa(data.merkez)}</text>
                  {data.nodes[0]?.risk != null && <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={700}>{data.nodes[0].risk}</text>}
                </svg>
              </div>
            )}

            {/* lejant */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: 12, color: "#93a3b4" }}>
              {ONCELIK.map((n) => (
                <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 3, background: NEDEN_RENK[n], borderRadius: 2, display: "inline-block" }} />{n}
                </span>
              ))}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, background: "#f5222d", borderRadius: "50%", display: "inline-block" }} />yakalanan (merkez)</span>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
