import { checkRateLimit, type RateLimitRule } from "@/lib/rate-limit";

// The clinic's WhatsApp is linked through Baileys, not the official API: a
// burst of sends from one number is exactly what gets it flagged or banned.
// Every WhatsApp send — reminders, staff sends, automatic answers — shares one
// clinic-wide ceiling (CLINIC_SEND_LIMITS, checked by sendMessage itself, Codex
// #136); the narrower per-flow budgets below sit inside it.

/** All WhatsApp sends from one clinic's number, whatever sent them. */
const CLINIC_SEND_LIMITS: RateLimitRule[] = [
  { limit: 30, windowMs: 60_000 },
  { limit: 300, windowMs: 60 * 60_000 },
];

/** Staff-initiated sends (Inbox replies, follow-ups), per clinic. */
const MANUAL_SEND_LIMITS: RateLimitRule[] = [
  { limit: 20, windowMs: 60_000 },
  { limit: 200, windowMs: 60 * 60_000 },
];

/**
 * Automatic confirm/cancel answers, per patient: a patient (or an auto-replier
 * looping with the clinic number) who keeps sending "1" would otherwise get an
 * answer to every one. Keyed by the client's record id — never a phone number,
 * since the counters live in the shared rate-limit store.
 */
const REPLY_ACK_LIMIT: RateLimitRule = { limit: 3, windowMs: 60 * 60_000 };

/**
 * And per clinic: many patients answering one reminder run each get their own
 * per-patient budget, so without a shared cap a busy hour could still make the
 * number send a burst (Codex #136). Same shape as the staff budget.
 */
const CLINIC_REPLY_ACK_LIMITS: RateLimitRule[] = [
  { limit: 20, windowMs: 60_000 },
  { limit: 200, windowMs: 60 * 60_000 },
];

/** The message naming the wait a blocking rule actually imposes (Codex #136). */
function sendWaitMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `You've sent a lot of messages in a short time. Wait ${
    minutes === 1 ? "a minute" : `about ${minutes} minutes`
  }, then send again.`;
}

export type SendRefusal = { error: string; retryAfterSeconds: number };

async function firstRefusal(
  prefix: string,
  businessId: string,
  rules: RateLimitRule[]
): Promise<SendRefusal | null> {
  for (const rule of rules) {
    const result = await checkRateLimit(`${prefix}:${rule.windowMs}:${businessId}`, rule);
    if (!result.allowed) {
      return { error: sendWaitMessage(result.retryAfterSeconds), retryAfterSeconds: result.retryAfterSeconds };
    }
  }
  return null;
}

/**
 * Null while the clinic is within its staff-send budget; otherwise the message
 * to show, naming the wait the blocking rule actually imposes.
 */
export async function manualSendRefusal(businessId: string): Promise<string | null> {
  return (await firstRefusal("whatsapp-manual", businessId, MANUAL_SEND_LIMITS))?.error ?? null;
}

/**
 * Null while the clinic's number is within its overall ceiling; otherwise the
 * message to show and how long until a send fits again. Checked by sendMessage
 * for every WhatsApp send.
 */
export function clinicSendRefusal(businessId: string): Promise<SendRefusal | null> {
  return firstRefusal("whatsapp-all", businessId, CLINIC_SEND_LIMITS);
}

export async function allowReplyAck(businessId: string, clientId: string): Promise<boolean> {
  if (!(await checkRateLimit(`whatsapp-reply-ack:${businessId}:${clientId}`, REPLY_ACK_LIMIT)).allowed) {
    return false;
  }
  for (const rule of CLINIC_REPLY_ACK_LIMITS) {
    if (!(await checkRateLimit(`whatsapp-reply-ack:${rule.windowMs}:${businessId}`, rule)).allowed) {
      return false;
    }
  }
  return true;
}
