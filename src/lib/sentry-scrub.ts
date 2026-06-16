/**
 * PHI/PII scrubber for outbound Sentry events.
 *
 * WHY: `Sentry.init({ sendDefaultPii: false })` only suppresses *auto-collected*
 * PII (IP, headers, cookies, request bodies). It does NOT sanitize the free-text
 * of exception messages. Provider errors carry identifiers — e.g. a failed Twilio
 * send throws `new Error(payload.message)` whose message echoes the recipient
 * number ("The 'To' number whatsapp:+383… is not valid") — and those reach Sentry
 * via `logger.error(..., error)` AND via the SDK's automatic capture of unhandled
 * errors. Both paths flow through `beforeSend`, so this is the one place to redact.
 *
 * This redacts the concrete identifiers that show up in error strings (emails,
 * phone numbers, long digit runs). It is a defense-in-depth layer, not the only
 * one: callers still pass IDs/counts only (never names/PHI) in logger `context`,
 * outbound messages stay minimum-necessary, Session Replay is off, and local
 * variables are not attached. Residual risk: a free-text name inside an exception
 * message would not match these patterns — but error strings in this codebase
 * carry provider/DB/validation text and identifiers, not patient names.
 *
 * Targeted by design: only message/exception/breadcrumb/request/extra fields are
 * scrubbed, never SDK metadata (event_id, trace ids, release), so issue grouping
 * and source-map symbolication are unaffected.
 */

// Emails, e.g. patient@example.com
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// E.164-style phone numbers (the Twilio recipient-echo case), e.g. +38344123456,
// "whatsapp:+1 (555) 010-1234". Space is literal (not \s) so it never spans
// newlines in a stack trace.
const PHONE = /\+\d[\d ().-]{5,}\d/g;
// Bare unformatted runs of 7+ digits (phone numbers written without a "+").
// 7+ contiguous digits never matches dates ("2026-06-16"), line numbers, ports,
// small counts, or hex/cuid ids, so it is safe to redact broadly.
const LONG_DIGITS = /\b\d{7,}\b/g;

const MAX_DEPTH = 6;

/** Redact identifiers from a single string. Safe to call on any text. */
export function scrubText(value: string): string {
  return value
    .replace(EMAIL, "[redacted-email]")
    .replace(PHONE, "[redacted-phone]")
    .replace(LONG_DIGITS, "[redacted-number]");
}

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return scrubText(value);
  }

  if (depth >= MAX_DEPTH) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      record[key] = scrubValue(record[key], depth + 1);
    }
    return record;
  }

  return value;
}

// Minimal structural view of the Sentry event fields we sanitize. Kept local so
// this module imports no Sentry types and stays usable from every runtime
// (node/edge/browser) without bundling concerns.
interface ScrubbableEvent {
  message?: unknown;
  logentry?: { message?: unknown } | null;
  exception?: { values?: Array<{ value?: unknown } | null> | null } | null;
  breadcrumbs?: Array<{ message?: unknown } | null> | null;
  request?: { url?: unknown; query_string?: unknown } | null;
  extra?: Record<string, unknown> | null;
}

/**
 * Scrub identifiers from a Sentry event in place. Generic so it can be passed
 * directly to both `beforeSend` and `beforeSendTransaction` without fighting the
 * SDK's event types; returns the same reference it was given.
 */
export function scrubSentryEvent<T>(event: T): T {
  const target = event as unknown as ScrubbableEvent;

  if (typeof target.message === "string") {
    target.message = scrubText(target.message);
  }

  if (target.logentry && typeof target.logentry.message === "string") {
    target.logentry.message = scrubText(target.logentry.message);
  }

  const values = target.exception?.values;
  if (Array.isArray(values)) {
    for (const entry of values) {
      if (entry && typeof entry.value === "string") {
        entry.value = scrubText(entry.value);
      }
    }
  }

  if (Array.isArray(target.breadcrumbs)) {
    for (const crumb of target.breadcrumbs) {
      if (crumb && typeof crumb.message === "string") {
        crumb.message = scrubText(crumb.message);
      }
    }
  }

  if (target.request) {
    if (typeof target.request.url === "string") {
      target.request.url = scrubText(target.request.url);
    }
    if (typeof target.request.query_string === "string") {
      target.request.query_string = scrubText(target.request.query_string);
    }
  }

  if (target.extra && typeof target.extra === "object") {
    target.extra = scrubValue(target.extra, 0) as Record<string, unknown>;
  }

  return event;
}
