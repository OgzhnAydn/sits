"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConfigProvider, theme, Flex, Typography, Button, Badge, Empty } from "antd";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";

const { Text, Title } = Typography;

type Mesaj = { rol: "musteri" | "uzman" | "sistem"; metin: string; zaman: number };
type Konusma = { id: string; marka: string; markaAdi: string; durum: string; bekliyor?: boolean; guncelleme?: { seconds: number } | null; mesajlar: Mesaj[] };

// Yeni müşteri mesajı geldiğinde kısa bip (WebAudio) — dış servis yok.
function bip() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const o = ac.createOscillator(); const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.frequency.value = 880; g.gain.value = 0.06;
    o.start(); o.frequency.setValueAtTime(660, ac.currentTime + 0.12);
    setTimeout(() => { o.stop(); ac.close().catch(() => {}); }, 240);
  } catch { /* ses yoksa geç */ }
}

export default function DestekPanosu() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [konusmalar, setKonusmalar] = useState<Konusma[]>([]);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [girdi, setGirdi] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const kaydir = useRef<HTMLDivElement>(null);
  const oncekiSon = useRef<Record<string, number>>({}); // konusma → son müşteri mesaj zamanı (bildirim tespiti)

  useEffect(() => {
    if (!auth) { setUser(null); return; }
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const q = query(collection(db, "destek_konusma"), orderBy("guncelleme", "desc"), limit(60));
    const unsub = onSnapshot(q, (snap) => {
      const list: Konusma[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Konusma, "id">) }));
      // Bildirim: bir konuşmanın SON mesajı müşteriden ve öncekinden yeniyse → bip + tarayıcı bildirimi.
      for (const k of list) {
        const son = k.mesajlar?.[k.mesajlar.length - 1];
        if (son && son.rol === "musteri") {
          const onceki = oncekiSon.current[k.id] || 0;
          if (son.zaman > onceki && onceki !== 0) {
            bip();
            try { if (document.hidden && Notification?.permission === "granted") new Notification(`${k.markaAdi || k.marka} · yeni mesaj`, { body: son.metin.slice(0, 80) }); } catch { /* */ }
          }
          oncekiSon.current[k.id] = son.zaman;
        }
      }
      setKonusmalar(list);
    }, () => { /* kural/yetki hatası */ });
    return () => unsub();
  }, [user]);

  const aciklar = useMemo(() => konusmalar.filter((k) => k.durum !== "kapali"), [konusmalar]);
  const secili = konusmalar.find((k) => k.id === seciliId) || null;

  useEffect(() => { const el = kaydir.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [secili?.mesajlar?.length]);

  async function yanitla() {
    const t = girdi.trim(); if (!t || !seciliId || !db || gonderiliyor) return;
    setGonderiliyor(true); setGirdi("");
    try {
      await updateDoc(doc(db, "destek_konusma", seciliId), {
        mesajlar: arrayUnion({ rol: "uzman", metin: t, zaman: Date.now() }), guncelleme: serverTimestamp(), bekliyor: false,
      });
    } catch { setGirdi(t); } finally { setGonderiliyor(false); }
  }
  async function kapat(id: string) {
    if (!db) return;
    try { await updateDoc(doc(db, "destek_konusma", id), { durum: "kapali", guncelleme: serverTimestamp() }); } catch { /* */ }
    if (seciliId === id) setSeciliId(null);
  }

  const zaman = (ms: number) => new Date(ms).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: "#2478c9", fontFamily: "'IBM Plex Sans',system-ui,sans-serif" } }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
      <div style={{ position: "fixed", inset: 0, background: "#080f1a", color: "#e9f2fa", display: "flex", flexDirection: "column", fontFamily: "'IBM Plex Sans',sans-serif" }}>
        <Flex align="center" gap={12} style={{ padding: "12px 18px", borderBottom: "1px solid #17293c", flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#31c8a0" }}>headset_mic</span>
          <Title level={5} style={{ margin: 0, color: "#e9f2fa" }}>Destek Panosu</Title>
          <Badge count={aciklar.filter((k) => k.bekliyor).length} style={{ backgroundColor: "#ff5468" }} />
          <Text style={{ marginLeft: "auto", fontSize: 11, color: "#8fa6bd" }}>{aciklar.length} açık konuşma</Text>
          {typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted" && (
            <Button size="small" onClick={() => Notification.requestPermission()}>Masaüstü bildirimi aç</Button>
          )}
        </Flex>

        {user === undefined ? (
          <Flex flex={1} align="center" justify="center"><Text style={{ color: "#8fa6bd" }}>Yükleniyor…</Text></Flex>
        ) : !user ? (
          <Flex flex={1} vertical align="center" justify="center" gap={10}>
            <Text style={{ color: "#8fa6bd" }}>Bu pano operatör girişi gerektirir.</Text>
            <Button type="primary" href="/marka-giris">Operatör girişi</Button>
          </Flex>
        ) : (
          <Flex flex={1} style={{ minHeight: 0 }}>
            {/* Sol: konuşma listesi */}
            <div style={{ width: 320, borderRight: "1px solid #17293c", overflowY: "auto", flexShrink: 0 }}>
              {aciklar.length === 0 && <div style={{ padding: 24 }}><Empty description={<Text style={{ color: "#8fa6bd" }}>Açık konuşma yok</Text>} /></div>}
              {aciklar.map((k) => {
                const son = k.mesajlar?.[k.mesajlar.length - 1];
                const bekliyor = son?.rol === "musteri";
                return (
                  <div key={k.id} onClick={() => setSeciliId(k.id)}
                    style={{ padding: "11px 14px", borderBottom: "1px solid #0f1b2e", cursor: "pointer", background: seciliId === k.id ? "#152337" : "transparent", borderLeft: bekliyor ? "3px solid #ff5468" : "3px solid transparent" }}>
                    <Flex align="center" gap={8}>
                      <Text strong style={{ fontSize: 12.5, color: "#e9f2fa", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.markaAdi || k.marka}</Text>
                      {bekliyor && <span style={{ width: 8, height: 8, borderRadius: 4, background: "#ff5468" }} />}
                      <Text style={{ fontSize: 9.5, color: "#5c748b" }}>{son ? zaman(son.zaman) : ""}</Text>
                    </Flex>
                    <Text style={{ fontSize: 11, color: bekliyor ? "#ff9aa4" : "#8fa6bd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{son?.rol === "uzman" ? "Siz: " : ""}{son?.metin || "—"}</Text>
                  </div>
                );
              })}
            </div>

            {/* Sağ: seçili konuşma */}
            {secili ? (
              <Flex vertical flex={1} style={{ minHeight: 0 }}>
                <Flex align="center" gap={10} style={{ padding: "10px 16px", borderBottom: "1px solid #17293c", flexShrink: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ color: "#e9f2fa", display: "block" }}>{secili.markaAdi || secili.marka}</Text>
                    <Text style={{ fontSize: 10.5, color: "#8fa6bd" }}>marka koruma panosu müşterisi · konuşma {secili.id.slice(0, 6)}</Text>
                  </div>
                  <Button size="small" onClick={() => kapat(secili.id)} icon={<span className="material-symbols-outlined" style={{ fontSize: 15, lineHeight: 1 }}>check</span>}>Kapat</Button>
                </Flex>
                <div ref={kaydir} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  {(secili.mesajlar || []).map((m, i) => m.rol === "sistem" ? (
                    <div key={i} style={{ alignSelf: "center" }}><Text style={{ fontSize: 10, color: "#5c748b" }}>{m.metin}</Text></div>
                  ) : (
                    <div key={i} style={{ alignSelf: m.rol === "uzman" ? "flex-end" : "flex-start", maxWidth: "78%" }}>
                      <Text style={{ fontSize: 9, color: m.rol === "uzman" ? "#31c8a0" : "#8fb0d4", display: "block", marginBottom: 2, textAlign: m.rol === "uzman" ? "right" : "left" }}>{m.rol === "uzman" ? "Siz (Uzman)" : "Müşteri"} · {zaman(m.zaman)}</Text>
                      <div style={{ padding: "9px 12px", borderRadius: m.rol === "uzman" ? "12px 12px 3px 12px" : "12px 12px 12px 3px", background: m.rol === "uzman" ? "#1e5285" : "#152337", color: "#e9f2fa", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.metin}</div>
                    </div>
                  ))}
                </div>
                <Flex gap={8} align="flex-end" style={{ padding: 12, borderTop: "1px solid #17293c", flexShrink: 0 }}>
                  <textarea value={girdi} onChange={(e) => setGirdi(e.target.value)} rows={1} placeholder="Yanıtınızı yazın…"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); yanitla(); } }}
                    style={{ flex: 1, resize: "none", maxHeight: 120, background: "#0b1726", color: "#e9f2fa", border: "1px solid #1d3350", borderRadius: 9, padding: "10px 12px", fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", outline: "none" }} />
                  <Button type="primary" onClick={yanitla} loading={gonderiliyor} disabled={!girdi.trim()} icon={<span className="material-symbols-outlined" style={{ fontSize: 18, lineHeight: 1 }}>send</span>} style={{ height: 40 }} />
                </Flex>
              </Flex>
            ) : (
              <Flex flex={1} align="center" justify="center"><Text style={{ color: "#5c748b" }}>Soldan bir konuşma seçin</Text></Flex>
            )}
          </Flex>
        )}
      </div>
    </ConfigProvider>
  );
}
