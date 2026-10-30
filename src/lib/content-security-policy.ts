const isDev = process.env.NODE_ENV !== "production";

export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

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

/**
 * The page's Content-Security-Policy: only scripts carrying this request's
 * nonce (Next stamps it on its own) and the scripts they load may run. Every
 * page renders per request (the root layout awaits `connection()`), so every
 * page's HTML carries the nonce.
 */
export function contentSecurityPolicy(nonce: string): string {
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
    // Styles stay 'unsafe-inline' (React style attributes can't carry a nonce);
    // Paddle.js loads its overlay stylesheet from its CDN.
    "style-src 'self' 'unsafe-inline' https://cdn.paddle.com https://sandbox-cdn.paddle.com",
    // 'strict-dynamic' lets a nonced script load others (Next's chunks, Paddle.js
    // added by use-paddle), so the host list only matters to older browsers.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdn.paddle.com${isDev ? " 'unsafe-eval'" : ""}`,
    `connect-src ${connectSrc.join(" ")}`,
    "frame-src https://buy.paddle.com https://sandbox-buy.paddle.com",
  ];

  return directives.join("; ");
}
