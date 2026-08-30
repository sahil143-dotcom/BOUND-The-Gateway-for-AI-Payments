import type { NextConfig } from "next";

const boundApi = (process.env.BOUND_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/bound-api/:path*",
        destination: `${boundApi}/:path*`,
      },
    ];
  },
};

export default nextConfig;
