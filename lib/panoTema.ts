"use client";
// Operatör pano ekranları (mercek/kontrol/canli) için koyu/açık tema durumu.
// Kök öğeye className="pano" + data-tema={tema} verilir; renkler globals.css'teki
// --c-* değişkenlerinden gelir. Tercih localStorage'da paylaşılır (tüm panolar aynı).
import { useEffect, useState } from "react";

export type PanoTema = "dark" | "light";

export function usePanoTema() {
  const [tema, setTema] = useState<PanoTema>("dark");
  useEffect(() => {
    try { const v = localStorage.getItem("pano_tema"); if (v === "light" || v === "dark") setTema(v); } catch { /* yok say */ }
  }, []);
  const degistir = () =>
    setTema((t) => {
      const n: PanoTema = t === "dark" ? "light" : "dark";
      try { localStorage.setItem("pano_tema", n); } catch { /* yok say */ }
      return n;
    });
  return { tema, koyu: tema === "dark", degistir };
}

// Ant ConfigProvider token'ları (gerçek hex — Ant renk-matematiği var() işleyemez).
export const antTokenKoyu = { colorPrimary: "#4d9fe0", borderRadius: 12, colorBgLayout: "#080f1a", colorBgContainer: "#0b1726", colorBorderSecondary: "#17293c" };
export const antTokenAcik = { colorPrimary: "#2478c9", borderRadius: 12, colorBgLayout: "#eef1f6", colorBgContainer: "#ffffff", colorBorderSecondary: "#dbe3ee" };
