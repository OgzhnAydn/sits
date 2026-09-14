import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF raporları için gömülü font dosyaları serverless fonksiyona dahil edilsin (Vercel).
  // TÜM api rotaları kapsanır: /api/rapor, /api/marka-rapor-pdf, /api/bahis-liste-pdf hepsi Tinos/Roboto okur.
  outputFileTracingIncludes: {
    "/api/**": ["./assets/fonts/**"],
  },
};

export default nextConfig;
