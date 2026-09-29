import type { NextConfig } from "next";

/**
 * Optional same-origin proxy.
 *
 * If API_PROXY_TARGET is set (e.g. https://librarp-api.onrender.com), requests
 * to /api/* on the frontend domain are forwarded to the backend. Leave
 * NEXT_PUBLIC_API_URL empty in that case: the refresh cookie then becomes a
 * first-party cookie, which avoids third-party-cookie blocking in Safari.
 */
const proxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return proxyTarget ? [{ source: "/api/:path*", destination: `${proxyTarget}/api/:path*` }] : [];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
