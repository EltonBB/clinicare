import { checkRateLimit, type RateLimitRule } from "@/lib/rate-limit";

// The clinic's WhatsApp is linked through Baileys, not the official API: a
// burst of sends from one number is exactly what gets it flagged or banned, and
// nothing else caps how fast these paths can send. Reminders are left out —
// they run once an hour, already capped by their own circuit breaker.

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

export const MANUAL_SEND_LIMIT_ERROR =
  "You're sending messages very quickly. Wait a minute, then send again.";

export async function allowManualSend(businessId: string): Promise<boolean> {
  for (const rule of MANUAL_SEND_LIMITS) {
    const result = await checkRateLimit(`whatsapp-manual:${rule.windowMs}:${businessId}`, rule);
    if (!result.allowed) return false;
  }
  return true;
}

export async function allowReplyAck(businessId: string, clientId: string): Promise<boolean> {
  return (await checkRateLimit(`whatsapp-reply-ack:${businessId}:${clientId}`, REPLY_ACK_LIMIT)).allowed;
}
