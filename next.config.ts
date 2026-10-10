import type { NextConfig } from "next";

/** The growth-platform API (backend/) runs beside the site on 127.0.0.1:4006;
    these rewrites make it same-origin so the console needs no CORS and nginx
    needs no change. See docs/platform/phase-1-spec.md. */
const API = process.env.GROWTH_API_ORIGIN ?? "http://127.0.0.1:4006";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/v2/:path*", destination: `${API}/api/v1/:path*` },
      { source: "/api/connect/:path*", destination: `${API}/api/v1/connect/:path*` },
      { source: "/unsubscribe/:token", destination: `${API}/api/v1/unsubscribe/:token` },
      { source: "/webhooks/resend", destination: `${API}/api/v1/webhooks/resend` },
    ];
  },
};

export default nextConfig;
