// Sentry — Edge runtime (middleware / edge routes). Loaded from instrumentation.ts
// when NEXT_RUNTIME === "edge". Disabled automatically when SENTRY_DSN is unset.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Patient-data app: never send PII to Sentry (see sentry.server.config.ts).
  sendDefaultPii: false,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
