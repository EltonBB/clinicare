import pino from "pino";

/**
 * HIPAA note: never log message bodies or patient identifiers. Log businessId,
 * record ids, and counts only — same rule as the app's logger.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || "info",
});

/**
 * Turn an unknown error into a safe log string. Baileys errors routinely embed
 * the recipient JID (the patient's phone number) in their message — e.g.
 * "failed to send to 38344123456@s.whatsapp.net". The app has a Sentry PHI
 * scrubber; the worker logs to plain stdout, so we redact here before logging.
 * Strips WhatsApp JIDs and any phone-length digit run; status codes are short
 * enough to survive.
 */
export function scrubError(error: unknown): string {
  let raw: string;
  try {
    raw =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
  } catch {
    return "unserializable error";
  }
  return raw
    .replace(/[\w.+-]+@(?:s\.whatsapp\.net|g\.us|c\.us|lid|broadcast)/gi, "[jid]")
    .replace(/\d{7,}/g, "[redacted]");
}
