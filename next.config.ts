import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["playwright-core", "msedge-tts"],
  async redirects() { return [{ source: "/research/:path*", destination: "/studio", permanent: false }, { source: "/research", destination: "/studio", permanent: false }]; },
  // the desktop stream WebSocket (Next proxies the upgrade; on the VPS Caddy routes /desk/ws straight to the desk)
  async rewrites() { return [{ source: "/desk/ws", destination: (process.env.DESK_URL || "http://127.0.0.1:7900") + "/ws" }]; },
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
};
export default nextConfig;
