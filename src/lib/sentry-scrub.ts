/**
 * PHI/PII scrubber for outbound Sentry events and spans.
 *
 * WHY: `Sentry.init({ sendDefaultPii: false })` only suppresses *auto-collected*
 * PII (IP, headers, cookies, request bodies). It does NOT sanitize free-text
 * exception messages, and it does NOT strip query-string VALUES from the URL
 * fields Sentry attaches to events, breadcrumbs, or spans. Leaks this closes:
 *
 *   1. Provider errors echo identifiers — a failed Twilio send throws
 *      `new Error(payload.message)` whose text contains the recipient number
 *      ("The 'To' number whatsapp:+383… is not valid"). These reach Sentry via
 *      `logger.error(..., error)` AND the SDK's automatic capture of unhandled
 *      errors.
 *   2. Workspace URLs carry patient-entered search text — `/clients?q=…` and
 *      `/api/search?q=…`. With tracing on, that text appears in `request.url`,
 *      `request.query_string`, navigation/fetch breadcrumb URLs, AND span
 *      `description` / `data` (the span path is sanitized via `beforeSendSpan`,
 *      not `beforeSendTransaction`, which never walks spans).
 *
 * Hooks: `beforeSend` + `beforeSendTransaction` → `scrubSentryEvent`;
 * `beforeSendSpan` → `scrubSentrySpan`. Two strategies:
 *   - Free text (messages, exception values, breadcrumb/span descriptions) goes
 *     through `scrubFreeText`: any embedded URL has its query values stripped,
 *     then identifiers (emails, phones, long digit runs) are redacted.
 *   - Query strings are sanitized VALUE-side: keys kept, every value → [redacted].
 *     Search text never leaves the app, and there is no allowlist of "safe"
 *     params to forget to update when a new one is added.
 *
 * Defense-in-depth, not the only layer: callers pass IDs/counts only (never
 * names/PHI) in logger `context`, outbound messages stay minimum-necessary,
 * Session Replay is off, and local variables are not attached. Residual risk: a
 * patient name hand-embedded in a non-URL free-text exception message would not
 * match the identifier patterns — but error strings here carry provider/DB/
 * validation text and identifiers, not names.
 *
 * Targeted by design: only message/exception/breadcrumb/request/span/extra
 * fields are scrubbed, never SDK metadata (event_id, trace ids, release), so
 * issue grouping and source-map symbolication are unaffected.
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

// Span/breadcrumb data keys holding a raw query string (no path) — value-stripped
// directly since there is no "?" for scrubFreeText to key off.
const QUERY_KEYS = new Set([
  "http.query",
  "http.request.query",
  "url.query",
  "query",
  "query_string",
]);

const MAX_DEPTH = 6;

/** Redact identifiers (emails, phones, long digit runs) from a string. */
export function scrubText(value: string): string {
  return value
    .replace(EMAIL, "[redacted-email]")
    .replace(PHONE, "[redacted-phone]")
    .replace(LONG_DIGITS, "[redacted-number]");
}

/**
 * Replace every query-string VALUE with [redacted], keeping keys, for the
 * "key=value&key2=value2" form. Patient-entered search text (?q=Jane Doe) lives
 * in values, so value-stripping removes it without maintaining an allowlist.
 */
function sanitizeQueryString(query: string): string {
  return query
    .split("&")
    .map((pair) => {
      if (!pair) {
        return pair;
      }
      const eq = pair.indexOf("=");
      if (eq === -1) {
        return pair; // bare flag, no value to leak
      }
      return `${pair.slice(0, eq)}=[redacted]`;
    })
    .join("&");
}

/** Strip query values from a URL, keeping path and fragment. No identifier scrub. */
function stripUrlQuery(text: string): string {
  const queryStart = text.indexOf("?");
  if (queryStart === -1) {
    return text;
  }
  const head = text.slice(0, queryStart);
  let query = text.slice(queryStart + 1);
  let fragment = "";
  const hashStart = query.indexOf("#");
  if (hashStart !== -1) {
    fragment = query.slice(hashStart); // includes the leading '#'
    query = query.slice(0, hashStart);
  }
  return `${head}?${sanitizeQueryString(query)}${fragment}`;
}

/**
 * Sanitize any free text: strip query values from an embedded URL (everything
 * after the first "?"), then redact identifiers. Used for messages, exception
 * values, transaction names, breadcrumb/span descriptions, and request URLs.
 */
export function scrubFreeText(value: string): string {
  return scrubText(stripUrlQuery(value));
}

/** Sanitize Sentry's request.query_string, which may be a string, object, or pairs. */
function sanitizeQueryValue(query: unknown): unknown {
  if (typeof query === "string") {
    return sanitizeQueryString(query);
  }
  if (Array.isArray(query)) {
    return query.map((pair) =>
      Array.isArray(pair) && pair.length > 0 ? [pair[0], "[redacted]"] : pair
    );
  }
  if (query && typeof query === "object") {
    const record = query as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      out[key] = "[redacted]";
    }
    return out;
  }
  return query;
}

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return scrubFreeText(value);
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

// Span / trace-context data: query-string keys are value-stripped, every other
// string is run through scrubFreeText (which also strips embedded URL queries).
function scrubData(data: Record<string, unknown>) {
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (typeof val === "string") {
      data[key] = QUERY_KEYS.has(key)
        ? sanitizeQueryString(val)
        : scrubFreeText(val);
    } else if (val && typeof val === "object") {
      data[key] = scrubValue(val, 0);
    }
  }
}

interface ScrubbableSpan {
  description?: unknown;
  data?: Record<string, unknown> | null;
}

function scrubSpanInPlace(span: ScrubbableSpan) {
  if (typeof span.description === "string") {
    span.description = scrubFreeText(span.description);
  }
  if (span.data && typeof span.data === "object") {
    scrubData(span.data);
  }
}

// Minimal structural views of the fields we sanitize. Kept local so this module
// imports no Sentry types and stays usable from every runtime (node/edge/browser).
interface ScrubbableEvent {
  message?: unknown;
  transaction?: unknown;
  logentry?: { message?: unknown } | null;
  exception?: { values?: Array<{ value?: unknown } | null> | null } | null;
  breadcrumbs?: Array<
    { message?: unknown; data?: Record<string, unknown> | null } | null
  > | null;
  request?: { url?: unknown; query_string?: unknown } | null;
  spans?: Array<ScrubbableSpan | null> | null;
  contexts?: { trace?: { data?: Record<string, unknown> | null } | null } | null;
  extra?: Record<string, unknown> | null;
}

/**
 * Scrub a single span (used as `beforeSendSpan`). Generic so it can be passed
 * directly without fighting the SDK's span type; returns the same reference.
 */
export function scrubSentrySpan<T>(span: T): T {
  scrubSpanInPlace(span as unknown as ScrubbableSpan);
  return span;
}

/**
 * Scrub identifiers and query-string values from a Sentry event in place (used as
 * `beforeSend` and `beforeSendTransaction`). Generic so it can be passed directly
 * without fighting the SDK's event types; returns the same reference.
 */
export function scrubSentryEvent<T>(event: T): T {
  const target = event as unknown as ScrubbableEvent;

  if (typeof target.message === "string") {
    target.message = scrubFreeText(target.message);
  }

  if (typeof target.transaction === "string") {
    target.transaction = scrubFreeText(target.transaction);
  }

  if (target.logentry && typeof target.logentry.message === "string") {
    target.logentry.message = scrubFreeText(target.logentry.message);
  }

  const values = target.exception?.values;
  if (Array.isArray(values)) {
    for (const entry of values) {
      if (entry && typeof entry.value === "string") {
        entry.value = scrubFreeText(entry.value);
      }
    }
  }

  if (Array.isArray(target.breadcrumbs)) {
    for (const crumb of target.breadcrumbs) {
      if (!crumb) {
        continue;
      }
      if (typeof crumb.message === "string") {
        crumb.message = scrubFreeText(crumb.message);
      }
      if (crumb.data && typeof crumb.data === "object") {
        scrubData(crumb.data);
      }
    }
  }

  if (target.request) {
    if (typeof target.request.url === "string") {
      target.request.url = scrubFreeText(target.request.url);
    }
    if (target.request.query_string != null) {
      target.request.query_string = sanitizeQueryValue(target.request.query_string);
    }
  }

  if (Array.isArray(target.spans)) {
    for (const span of target.spans) {
      if (span) {
        scrubSpanInPlace(span);
      }
    }
  }

  const traceData = target.contexts?.trace?.data;
  if (traceData && typeof traceData === "object") {
    scrubData(traceData);
  }

  if (target.extra && typeof target.extra === "object") {
    target.extra = scrubValue(target.extra, 0) as Record<string, unknown>;
  }

  return event;
}
