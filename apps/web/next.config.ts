import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript; let Next compile them.
  transpilePackages: [
    "@rubiksdna/db",
    "@rubiksdna/clocks",
    "@rubiksdna/ingest",
    "@rubiksdna/axes",
    "@rubiksdna/report",
    "@rubiksdna/claims",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
