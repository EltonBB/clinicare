import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV !== "production";

// Allow the browser Supabase client (auth + realtime) to reach the project's
// origin. Derived from the public URL so it tracks the configured project.
function supabaseConnectSources() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!raw) {
    return [];
  }

  try {
    const url = new URL(raw);
    return [url.origin, `wss://${url.host}`];
  } catch {
    return [];
  }
}

function devAllowedOrigins() {
  return (process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

function contentSecurityPolicy() {
  // Paddle (billing): Paddle.js and its stylesheet from its CDN, its checkout in
  // a frame, and its checkout/pricing APIs (live and sandbox).
  const connectSrc = ["'self'", ...supabaseConnectSources(), "https://*.paddle.com"];

  if (isDev) {
    // Next dev server needs eval (HMR) and a websocket to the dev host.
    connectSrc.push("ws:", "wss:");
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Paddle.js loads its overlay stylesheet from its CDN.
    "style-src 'self' 'unsafe-inline' https://cdn.paddle.com https://sandbox-cdn.paddle.com",
    // Next/React inject inline bootstrap scripts; without per-request nonces this
    // needs 'unsafe-inline'. Dev additionally needs 'unsafe-eval' for HMR.
    `script-src 'self' 'unsafe-inline' https://cdn.paddle.com${isDev ? " 'unsafe-eval'" : ""}`,
    `connect-src ${connectSrc.join(" ")}`,
    "frame-src https://buy.paddle.com https://sandbox-buy.paddle.com",
  ];

  return directives.join("; ");
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
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy(),
          },
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
