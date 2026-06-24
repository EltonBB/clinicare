import pino from "pino";

/**
 * HIPAA note: never log message bodies or patient identifiers. Log businessId,
 * record ids, and counts only — same rule as the app's logger.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || "info",
});
