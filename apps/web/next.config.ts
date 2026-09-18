import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@moneypilot/shared"],
  serverExternalPackages: ["@prisma/client"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;