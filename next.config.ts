import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV !== "production";

function devAllowedOrigins() {
  return (process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

const nextConfig: NextConfig = {
  // Don't announce the framework on every response (2026-10-06 QA).
  poweredByHeader: false,
  // Lets the dev server's own LAN address request its HMR/chunk assets —
  // otherwise Next blocks them as cross-origin and every client chunk
  // fails-then-retries on first load, stalling hydration for several
  // seconds. Comma-separated hosts in DEV_ALLOWED_ORIGINS; no effect outside dev.
  allowedDevOrigins: isDev ? devAllowedOrigins() : undefined,
  async headers() {
    return [
      {
        // Images skip proxy.ts (its matcher), so they get no page policy; an SVG
        // opened on its own is a document, so it may run nothing.
        source: "/:all*(svg|png|jpg|jpeg|gif|webp)",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; sandbox" }],
      },
      {
        source: "/:path*",
        // Content-Security-Policy is set per request in proxy.ts (private
        // pages get a nonce); see lib/content-security-policy.ts.
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            // Paddle's checkout frame may use the Payment Request API (Apple Pay, Google Pay).
            value:
              'camera=(), microphone=(), geolocation=(), payment=(self "https://buy.paddle.com" "https://sandbox-buy.paddle.com"), usb=(), fullscreen=(self)',
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry org/project + source-map upload token come from env (set in Vercel/CI);
  // upload is skipped gracefully when they're absent.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a wider set of client files for better stack traces.
  widenClientFileUpload: true,

  // Route browser events through a same-origin API path so they satisfy the strict
  // CSP (connect-src 'self') and dodge ad-blockers. proxy.ts excludes this path.
  tunnelRoute: "/monitoring",

  // Quiet build output except in CI.
  silent: !process.env.CI,
});
