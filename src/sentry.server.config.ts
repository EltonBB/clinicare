// Sentry — Node.js server runtime. Loaded from instrumentation.ts when
// NEXT_RUNTIME === "nodejs". Disabled automatically when SENTRY_DSN is unset.
import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent, scrubSentrySpan } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Patient-data app: never send IP, headers, cookies, or other PII to Sentry,
  // and don't attach local variable values to stack frames — both can carry PHI.
  sendDefaultPii: false,

  // Redact identifiers and patient-entered query text before events/spans leave the
  // app — sendDefaultPii does not sanitize free-text error strings or URLs, and
  // provider errors (e.g. Twilio) echo recipient numbers. See lib/sentry-scrub.ts.
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendTransaction: (event) => scrubSentryEvent(event),
  beforeSendSpan: (span) => scrubSentrySpan(span),

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
