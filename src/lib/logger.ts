/**
 * Single server-side logging seam.
 *
 * Today it writes structured lines to the platform logs (Vercel). It exists so
 * error reporting (Sentry / Logtail / etc.) can be wired in ONE place later
 * without touching call sites — add the capture call inside `logger.error`.
 *
 * HIPAA: callers must pass record IDs and counts only in `context` — never
 * patient names, contact details, message bodies, or clinical data. The error
 * object is serialized for diagnostics; never log a value that may carry PHI.
 */

import * as Sentry from "@sentry/nextjs";

type LogContext = Record<string, string | number | boolean | null | undefined>;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }

  return { message: String(error) };
}

export const logger = {
  error(message: string, error?: unknown, context?: LogContext) {
    // Forward handled errors to Sentry (no-op until SENTRY_DSN is set). Context is
    // IDs/counts only (see HIPAA note above) and PII capture is disabled, so no
    // patient data leaves the app.
    Sentry.captureException(error ?? new Error(message), {
      extra: { message, ...(context ?? {}) },
    });
    console.error(message, {
      ...(context ?? {}),
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    });
  },
  warn(message: string, context?: LogContext) {
    console.warn(message, context ?? {});
  },
  info(message: string, context?: LogContext) {
    console.info(message, context ?? {});
  },
};
