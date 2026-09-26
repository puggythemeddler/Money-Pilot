import type { NextConfig } from "next";

/**
 * The web app is frontend-only: every /api/* request is proxied, same-origin,
 * to the standalone MoneyPilot API (apps/api — Render in production, port
 * 4000 in local development). Because the proxy keeps browser requests
 * same-origin, auth cookies never need CORS/SameSite=None and the API enforces
 * CSRF itself against the forwarded origin headers.
 */
const apiOrigin = (process.env.MONEYPILOT_API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@moneypilot/shared"],
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
