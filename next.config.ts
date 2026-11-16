import type { NextConfig } from "next";

/** The growth-platform API (backend/) runs beside the site on 127.0.0.1:4006;
    these rewrites make it same-origin so the console needs no CORS and nginx
    needs no change. See docs/platform/phase-1-spec.md. */
const API = process.env.GROWTH_API_ORIGIN ?? "http://127.0.0.1:4006";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // The editor frames the public site from the same origin.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
      {
        source: "/api/sign/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/api/connect/:path*", destination: `${API}/api/v1/connect/:path*` },
      { source: "/unsubscribe/:token", destination: `${API}/api/v1/unsubscribe/:token` },
      { source: "/webhooks/resend", destination: `${API}/api/v1/webhooks/resend` },
    ];
  },
};

export default nextConfig;
