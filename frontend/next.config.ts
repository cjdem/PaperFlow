import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrlRaw = process.env.PAPERFLOW_BACKEND_URL || "http://127.0.0.1:8000";
    const backendUrl = backendUrlRaw.trim().replace(/\/+$/, "");

    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
