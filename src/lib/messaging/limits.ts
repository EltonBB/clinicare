/**
 * Maximum send-body length. MUST mirror the worker's cap
 * (`services/whatsapp-worker/src/index.ts`). The seam rejects an over-limit body
 * so the stored message body always equals what the worker actually sends —
 * never a truncated send recorded as the full text.
 *
 * Its own module so a caller that stores a body BEFORE it is sent (a follow-up
 * draft the operator edited) can refuse an over-limit one up front with the
 * same cap and wording, instead of persisting text the seam is going to reject
 * (Codex #130).
 */
export const MAX_MESSAGE_BODY_LENGTH = 8000;

export const MESSAGE_TOO_LONG_ERROR = "The message is too long to send.";

/**
 * Shape of a send's idempotency key. MUST mirror the worker's pattern
 * (`services/whatsapp-worker/src/send-dedupe.ts`), which refuses anything else.
 * Build keys from record ids only — never a phone number or message text.
 */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
