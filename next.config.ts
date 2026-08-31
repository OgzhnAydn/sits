import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF raporu için gömülü font dosyaları serverless fonksiyona dahil edilsin (Vercel).
  outputFileTracingIncludes: {
    "/api/rapor": ["./assets/fonts/**"],
  },
};

export default nextConfig;
