// Sentry — Edge runtime (middleware / edge routes). Loaded from instrumentation.ts
// when NEXT_RUNTIME === "edge". Disabled automatically when SENTRY_DSN is unset.
import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent, scrubSentrySpan } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Patient-data app: never send PII to Sentry (see sentry.server.config.ts).
  sendDefaultPii: false,

  // Redact identifiers and query text from events/spans before they leave the app
  // (see lib/sentry-scrub.ts).
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendTransaction: (event) => scrubSentryEvent(event),
  beforeSendSpan: (span) => scrubSentrySpan(span),

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
