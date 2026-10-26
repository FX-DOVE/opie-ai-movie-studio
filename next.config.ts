import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["playwright-core", "msedge-tts"],
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
};
export default nextConfig;
