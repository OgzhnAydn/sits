"use client";

import { useEffect } from "react";

// Service worker'ı kaydeder (PWA yüklenebilirlik + paylaşım hedefi için).
export default function PWA() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
