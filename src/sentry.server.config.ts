// Sentry — Node.js server runtime. Loaded from instrumentation.ts when
// NEXT_RUNTIME === "nodejs". Disabled automatically when SENTRY_DSN is unset.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Patient-data app: never send IP, headers, cookies, or other PII to Sentry,
  // and don't attach local variable values to stack frames — both can carry PHI.
  sendDefaultPii: false,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
