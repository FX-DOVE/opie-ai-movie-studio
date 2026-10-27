import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["playwright-core", "msedge-tts"],
  async redirects() { return [{ source: "/research/:path*", destination: "/studio", permanent: false }, { source: "/research", destination: "/studio", permanent: false }]; },
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
};
export default nextConfig;
