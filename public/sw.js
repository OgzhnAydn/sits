// SİTS — minimal service worker (yüklenebilirlik + paylaşım hedefi için gerekli).
// Ağ isteklerine karışmaz (passthrough); sadece PWA kriterlerini karşılar.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // passthrough — tarayıcı normal şekilde yüklesin
});
