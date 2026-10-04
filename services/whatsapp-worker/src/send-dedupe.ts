import { createHmac, randomBytes } from "node:crypto";

/**
 * Idempotent sends for POST /send. Kept free of Baileys/Express imports so it can
 * be unit-tested on its own (src/send-dedupe.test.ts, run by the app's Vitest).
 *
 * The app tags each logical message with an `idempotencyKey` (a follow-up draft
 * id, a reminder slot, an acknowledged inbound message). Within a workspace, a
 * repeat of a key never sends a second WhatsApp message:
 *   - sent    -> the first result is replayed (same providerMessageId);
 *   - unknown -> the socket send timed out, so the message may have left: every
 *                repeat is answered "unknown" again, never re-sent;
 *   - failed  -> nothing left (not connected, or the socket refused before
 *                writing): not remembered, so a retry really sends;
 *   - running -> a concurrent repeat waits for the same attempt's outcome.
 * A key reused for a different recipient or text is refused (key_conflict) —
 * nothing is sent, and since a failed send is never remembered, the key's
 * earlier message was sent or may have been: the app treats it as uncertain.
 *
 * Memory only: nothing survives a restart, so a retry after a worker restart is
 * as unprotected as an unkeyed one. Entries hold no message text or phone number
 * — only a keyed HMAC fingerprint (the key is random per process) and the
 * provider message id.
 */

/** Marks a withTimeout rejection: the operation may still have completed. */
export class TimeoutError extends Error {}

/** Mirrors the app's IDEMPOTENCY_KEY_PATTERN (src/lib/messaging/limits.ts). */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

/** Stable code in the 409 body for a send whose outcome is unknown. */
export const SEND_OUTCOME_UNKNOWN_CODE = "send_outcome_unknown";

export type SentResult = { providerMessageId: string | null; status: "SENT" };

export type SendOutcome =
  | { kind: "sent"; result: SentResult }
  | { kind: "unknown" }
  | { kind: "failed" }
  | { kind: "key_conflict" };

/**
 * Classifies a sendText failure. Only a timeout is uncertain: Baileys' own
 * errors (connection closed, device/prekey lookups) are thrown before the frame
 * is written, and nothing after the write throws — so they mean "not sent".
 */
export function classifySendError(error: unknown): SendOutcome {
  return error instanceof TimeoutError ? { kind: "unknown" } : { kind: "failed" };
}

/** The HTTP answer for an outcome. 502 stays "definitely failed, safe to retry"
 * (what every app version already assumes); 409 is new and means "may have left". */
export function sendOutcomeResponse(outcome: SendOutcome): { status: number; body: unknown } {
  switch (outcome.kind) {
    case "sent":
      return { status: 200, body: outcome.result };
    case "unknown":
      return {
        status: 409,
        body: { error: "Send outcome unknown.", code: SEND_OUTCOME_UNKNOWN_CODE },
      };
    case "key_conflict":
      return {
        status: 422,
        body: { error: "Idempotency key already used for a different message.", code: "idempotency_key_conflict" },
      };
    case "failed":
      return { status: 502, body: { error: "Send failed." } };
  }
}

type Entry = {
  fingerprint: string;
  /** Infinity while the attempt is still running — never evicted then. */
  expiresAt: number;
  outcome: Promise<SendOutcome>;
};

export type SendDeduper = {
  run(
    request: { businessId: string; key?: string; to: string; body: string },
    send: () => Promise<SendOutcome>
  ): Promise<SendOutcome>;
  size(): number;
};

export function createSendDeduper(options: {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
}): SendDeduper {
  const { ttlMs, maxEntries, now = Date.now } = options;
  const entries = new Map<string, Entry>();
  const secret = randomBytes(32);

  function evict(): void {
    const time = now();
    for (const [scope, entry] of entries) {
      if (entry.expiresAt <= time) entries.delete(scope);
    }
    // Still over the cap: drop the oldest settled entries (Map keeps insertion order).
    for (const [scope, entry] of entries) {
      if (entries.size <= maxEntries) break;
      if (entry.expiresAt !== Infinity) entries.delete(scope);
    }
  }

  return {
    run(request, send) {
      if (!request.key) {
        return send();
      }

      // Scoped per workspace, so one tenant's key can never answer another's send.
      const scope = JSON.stringify([request.businessId, request.key]);
      const fingerprint = createHmac("sha256", secret)
        .update(JSON.stringify([request.to, request.body]))
        .digest("base64");

      const existing = entries.get(scope);
      if (existing && existing.expiresAt > now()) {
        return existing.fingerprint === fingerprint
          ? existing.outcome
          : Promise.resolve({ kind: "key_conflict" });
      }

      const entry: Entry = {
        fingerprint,
        expiresAt: Infinity,
        // An unexpected throw is treated as "may have left" — the safe side.
        outcome: Promise.resolve()
          .then(send)
          .catch((): SendOutcome => ({ kind: "unknown" })),
      };
      entries.delete(scope);
      entries.set(scope, entry);
      if (entries.size > maxEntries) {
        evict();
      }

      // Registered before the caller awaits, so the entry is settled before any
      // later request can read it.
      void entry.outcome.then((outcome) => {
        if (entries.get(scope) !== entry) return;
        if (outcome.kind === "failed") {
          entries.delete(scope);
        } else {
          entry.expiresAt = now() + ttlMs;
        }
      });

      return entry.outcome;
    },
    size: () => entries.size,
  };
}
