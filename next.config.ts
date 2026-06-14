import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Standalone output → Docker image waży ~150 MB (zamiast 1.5 GB z node_modules).
  // Next.js generuje `.next/standalone/server.js` z minimalną kopią node_modules
  // potrzebnych do runtime. Docker CMD wskazuje na `server.js`.
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.vercel-storage.com" },
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      // ACRO4F — zdjęcia produktów linkowane zewnętrznie (IOF feed)
      { protocol: "https", hostname: "acro4f.com" },
      { protocol: "https", hostname: "*.acro4f.com" },
    ],
    // Next.js 16 wymaga jawnej whitelisty quality. Domyślnie pozwala tylko 75
    // i 100. My używamy q=70 dla mniejszych miniaturek (np. lista produktów),
    // q=75 jako default, q=100 dla pełnego detalu.
    qualities: [50, 65, 70, 75, 80, 90, 100],
    // Whitelist dla lokalnych ścieżek serwowanych z public/ — uploads
    // mogą siedzieć w głębokich katalogach (products/<id>/images/<file>).
    localPatterns: [{ pathname: "/uploads/**" }],
  },
};

export default nextConfig;
