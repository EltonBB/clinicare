import * as Sentry from "@sentry/nextjs";

// Runs once when the server process starts. We use it to fail fast on a broken
// environment instead of discovering missing configuration deep inside a request,
// and to initialize Sentry for the active runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateServerEnv } = await import("@/lib/env");
    validateServerEnv();
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture unhandled server-side request errors (RSC render, route handlers,
// server actions). Requires @sentry/nextjs >= 8.28.
export const onRequestError = Sentry.captureRequestError;
