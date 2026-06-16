/**
 * PHI/PII scrubber for outbound Sentry events.
 *
 * WHY: `Sentry.init({ sendDefaultPii: false })` only suppresses *auto-collected*
 * PII (IP, headers, cookies, request bodies). It does NOT sanitize the free-text
 * of exception messages, and it does NOT strip query-string VALUES from the
 * request/URL fields Sentry attaches. Two concrete leaks this closes:
 *
 *   1. Provider errors echo identifiers — a failed Twilio send throws
 *      `new Error(payload.message)` whose text contains the recipient number
 *      ("The 'To' number whatsapp:+383… is not valid"). These reach Sentry via
 *      `logger.error(..., error)` AND via the SDK's automatic capture of
 *      unhandled errors.
 *   2. Workspace URLs carry patient-entered search text — `/clients?q=…` and
 *      `/api/search?q=…` — so an error or trace on a search for "Jane Doe" would
 *      otherwise ship that name in `request.url` / `request.query_string` / a
 *      navigation or fetch breadcrumb URL.
 *
 * Everything routes through `beforeSend` / `beforeSendTransaction`, so this is the
 * one place to redact. Two strategies:
 *   - Identifiers (emails, phones, long digit runs) are regex-redacted from any
 *     free text (message, exception value, breadcrumb message, extra).
 *   - Query strings are sanitized VALUE-side: keys are kept, every value becomes
 *     [redacted]. Search text never leaves the app, and there is no allowlist of
 *     "safe" params to forget to update when a new one is added.
 *
 * Defense-in-depth, not the only layer: callers pass IDs/counts only (never
 * names/PHI) in logger `context`, outbound messages stay minimum-necessary,
 * Session Replay is off, and local variables are not attached. Residual risk: a
 * patient name hand-embedded in a free-text exception message (not a query
 * string) would not match the identifier patterns — but error strings in this
 * codebase carry provider/DB/validation text and identifiers, not names.
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

// Breadcrumb data keys that hold URLs (fetch / xhr / navigation breadcrumbs).
const URL_DATA_KEYS = new Set(["url", "to", "from", "href"]);

const MAX_DEPTH = 6;

/** Redact identifiers from a single string. Safe to call on any text. */
export function scrubText(value: string): string {
  return value
    .replace(EMAIL, "[redacted-email]")
    .replace(PHONE, "[redacted-phone]")
    .replace(LONG_DIGITS, "[redacted-number]");
}

/**
 * Replace every query-string VALUE with [redacted], keeping keys, for the
 * "key=value&key2=value2" string form. Patient-entered search text (?q=Jane Doe)
 * lives in values, so value-stripping removes it without maintaining an allowlist.
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

/**
 * Strip query-string values from a URL while keeping the path (and redacting any
 * identifiers in the path). Keeps which route failed debuggable; drops search text.
 */
function sanitizeUrl(url: string): string {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) {
    return scrubText(url);
  }
  const path = url.slice(0, queryStart);
  let query = url.slice(queryStart + 1);
  let fragment = "";
  const hashStart = query.indexOf("#");
  if (hashStart !== -1) {
    fragment = query.slice(hashStart); // includes the leading '#'
    query = query.slice(0, hashStart);
  }
  return `${scrubText(path)}?${sanitizeQueryString(query)}${fragment}`;
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
  breadcrumbs?: Array<
    { message?: unknown; data?: Record<string, unknown> | null } | null
  > | null;
  request?: { url?: unknown; query_string?: unknown } | null;
  extra?: Record<string, unknown> | null;
}

// Breadcrumbs (especially fetch/xhr/navigation) carry URLs in their data — the
// same /clients?q= search-text vector as request.url — so URL-bearing keys get
// query-value stripping and the rest gets identifier redaction.
function scrubBreadcrumbData(data: Record<string, unknown>) {
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (typeof val === "string") {
      data[key] = URL_DATA_KEYS.has(key) ? sanitizeUrl(val) : scrubText(val);
    } else if (val && typeof val === "object") {
      data[key] = scrubValue(val, 0);
    }
  }
}

/**
 * Scrub identifiers and query-string values from a Sentry event in place. Generic
 * so it can be passed directly to both `beforeSend` and `beforeSendTransaction`
 * without fighting the SDK's event types; returns the same reference it was given.
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
      if (!crumb) {
        continue;
      }
      if (typeof crumb.message === "string") {
        crumb.message = scrubText(crumb.message);
      }
      if (crumb.data && typeof crumb.data === "object") {
        scrubBreadcrumbData(crumb.data);
      }
    }
  }

  if (target.request) {
    if (typeof target.request.url === "string") {
      target.request.url = sanitizeUrl(target.request.url);
    }
    if (target.request.query_string != null) {
      target.request.query_string = sanitizeQueryValue(target.request.query_string);
    }
  }

  if (target.extra && typeof target.extra === "object") {
    target.extra = scrubValue(target.extra, 0) as Record<string, unknown>;
  }

  return event;
}
