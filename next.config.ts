import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/feed.xml', destination: '/api/feed' }];
  },
};

export default nextConfig;
