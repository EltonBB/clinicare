// Sentry — browser/client runtime. Next.js loads this directly. Disabled
// automatically when NEXT_PUBLIC_SENTRY_DSN is unset.
import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Patient-data app: never send IP/headers/PII to Sentry. Session Replay is
  // intentionally NOT enabled — it would record patient screens to a third party.
  // If added later, it must run with strict masking (maskAllText / maskAllInputs /
  // blockAllMedia) and a BAA in place.
  sendDefaultPii: false,

  // Redact identifiers from exception messages before they leave the browser
  // (see lib/sentry-scrub.ts).
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendTransaction: (event) => scrubSentryEvent(event),

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

// App Router navigation instrumentation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
