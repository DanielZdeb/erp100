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
  },
};

export default nextConfig;
