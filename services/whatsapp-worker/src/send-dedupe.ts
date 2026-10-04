import { createHmac } from "node:crypto";

/**
 * Idempotent sends for POST /send. Kept free of Baileys/Express/Prisma imports so
 * it can be unit-tested on its own (src/send-dedupe.test.ts, run by the app's
 * Vitest); the durable record lives behind {@link SendKeyStore}
 * (src/send-key-store.ts).
 *
 * The app tags each logical message with an `idempotencyKey` (a follow-up draft
 * id, a reminder slot, an acknowledged inbound message). Within a workspace, a
 * repeat of a key never sends a second WhatsApp message:
 *   - sent    -> the first result is replayed (same providerMessageId);
 *   - unknown -> the socket send timed out, or the worker stopped mid-send, so
 *                the message may have left: every repeat is answered "unknown"
 *                again, never re-sent;
 *   - failed  -> nothing left (no connected session, or the socket was
 *                already closed before a byte was written): the record is
 *                dropped, so a retry really sends;
 *   - running -> a concurrent repeat waits for the same attempt's outcome.
 * A key reused for a different recipient or text is refused (key_conflict) —
 * nothing is sent, and since a failed send is never kept, the key's earlier
 * message was sent or may have been: the app treats it as uncertain.
 *
 * The record is written BEFORE the message is sent and kept in Postgres, so it
 * survives a worker restart: an attempt the worker never got to settle reads as
 * "unknown" afterwards (Codex #133). That is what lets the app retry a keyed
 * send whose answer it never got. Records hold no message text or phone number
 * — only an HMAC fingerprint (keyed with the bridge secret, so it stays stable
 * across restarts) and the provider message id.
 */

/** Marks a withTimeout rejection: the operation may still have completed. */
export class TimeoutError extends Error {}

/** Thrown by sendText when the workspace has no connected session — before Baileys is called. */
export class SessionNotConnectedError extends Error {}

/** Mirrors the app's IDEMPOTENCY_KEY_PATTERN (src/lib/messaging/limits.ts). */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

/** Stable code in the 409 body for a send whose outcome is unknown. */
export const SEND_OUTCOME_UNKNOWN_CODE = "send_outcome_unknown";

/**
 * Stable code in the 502 body for a send that definitely did not go out. The app
 * tells this worker answer apart from a proxy's 502, which proves nothing.
 */
export const SEND_FAILED_CODE = "send_failed";

export type SentResult = { providerMessageId: string | null; status: "SENT" };

export type SendOutcome =
  | { kind: "sent"; result: SentResult }
  | { kind: "unknown" }
  | { kind: "failed" }
  | { kind: "key_conflict" };

/**
 * Classifies a sendText failure. Only failures known to come before the
 * message frame is written mean "not sent": no connected session, or Baileys'
 * own check that the socket is open — its "Connection Closed" (status 428),
 * raised by sendRawMessage before it encodes a byte, or by a device/prekey
 * query that runs before the message is relayed. Anything else may come after
 * bytes left: a timeout, or a transport error from the write itself (Baileys
 * awaits the socket write's callback), so it is "unknown" (Codex #133).
 */
export function classifySendError(error: unknown): SendOutcome {
  return error instanceof SessionNotConnectedError || isBaileysConnectionClosed(error)
    ? { kind: "failed" }
    : { kind: "unknown" };
}

function isBaileysConnectionClosed(error: unknown): boolean {
  const boom = error as { isBoom?: unknown; message?: unknown; output?: { statusCode?: unknown } } | null;
  return boom?.isBoom === true && boom.message === "Connection Closed" && boom.output?.statusCode === 428;
}

/** The HTTP answer for an outcome. 502 + SEND_FAILED_CODE: definitely failed,
 * safe to retry; 409: may have left; 422: key reused for a different message. */
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
      return { status: 502, body: { error: "Send failed.", code: SEND_FAILED_CODE } };
  }
}

/** A key's durable record. SENDING: an attempt started and never settled. */
export type SendKeyRecord = {
  fingerprint: string;
  state: "SENDING" | "SENT" | "UNKNOWN";
  providerMessageId: string | null;
};

export type SendKeyStore = {
  /**
   * Claims the key for a new attempt (recorded SENDING until settled): null
   * when claimed — no record, or only an expired one — else the live record.
   */
  reserve(input: {
    businessId: string;
    key: string;
    fingerprint: string;
    expiresAt: Date;
    now: Date;
  }): Promise<SendKeyRecord | null>;
  settle(input: {
    businessId: string;
    key: string;
    state: "SENT" | "UNKNOWN";
    providerMessageId: string | null;
  }): Promise<void>;
  /** Drops the record of an attempt that definitely sent nothing. */
  release(input: { businessId: string; key: string }): Promise<void>;
};

export type SendDeduper = {
  run(
    request: { businessId: string; key?: string; to: string; body: string },
    send: () => Promise<SendOutcome>
  ): Promise<SendOutcome>;
};

export function createSendDeduper(options: {
  store: SendKeyStore;
  ttlMs: number;
  /** Keys the fingerprint HMAC; must stay the same across restarts. */
  fingerprintSecret: string;
  onStoreError?: (message: string, error: unknown) => void;
  now?: () => number;
}): SendDeduper {
  const { store, ttlMs, fingerprintSecret, onStoreError = () => {}, now = Date.now } = options;
  // Attempts still running in this process, so a concurrent repeat waits for
  // the one attempt instead of reading its SENDING record as "unknown".
  const running = new Map<string, { fingerprint: string; outcome: Promise<SendOutcome> }>();
  // Keys whose send definitely failed but whose record couldn't be dropped
  // (a database error): left SENDING, a retry would read it as "unknown" and
  // the caller would mark a message sent that never left (Codex #133). This
  // process knows better, so a retry drops the record first. Only a database
  // error AND a worker restart before the retry lose that knowledge — and then
  // the record reads "unknown": a message possibly not sent, never one sent
  // twice. Grows only on such errors, and shrinks as retries repair them.
  const failedUnreleased = new Set<string>();

  async function attempt(
    scope: string,
    record: { businessId: string; key: string },
    fingerprint: string,
    send: () => Promise<SendOutcome>
  ): Promise<SendOutcome> {
    if (failedUnreleased.has(scope)) {
      try {
        await store.release(record);
        failedUnreleased.delete(scope);
      } catch (error) {
        // Still can't drop it: refuse this one too (nothing is sent), so a
        // later retry tries again.
        onStoreError("send refused: a failed send's key still couldn't be released", error);
        return { kind: "failed" };
      }
    }

    let existing: SendKeyRecord | null;
    try {
      existing = await store.reserve({
        ...record,
        fingerprint,
        expiresAt: new Date(now() + ttlMs),
        now: new Date(now()),
      });
    } catch (error) {
      // Nothing was sent: refuse, so the caller retries once the record can be kept.
      onStoreError("send refused: its key couldn't be recorded", error);
      return { kind: "failed" };
    }

    if (existing) {
      if (existing.fingerprint !== fingerprint) return { kind: "key_conflict" };
      if (existing.state === "SENT") {
        return { kind: "sent", result: { providerMessageId: existing.providerMessageId, status: "SENT" } };
      }
      // UNKNOWN, or SENDING left behind by a worker that stopped mid-send.
      return { kind: "unknown" };
    }

    // An unexpected throw is treated as "may have left" — the safe side.
    const outcome = await send().catch((): SendOutcome => ({ kind: "unknown" }));
    try {
      if (outcome.kind === "failed") {
        await store.release(record);
      } else if (outcome.kind === "sent") {
        await store.settle({ ...record, state: "SENT", providerMessageId: outcome.result.providerMessageId });
      } else {
        await store.settle({ ...record, state: "UNKNOWN", providerMessageId: null });
      }
    } catch (error) {
      // The record stays SENDING, which a repeat reads as "unknown": for a send
      // that went out (or may have), never a second message. A definite failure
      // is remembered here instead, so this process's retry still really sends.
      if (outcome.kind === "failed") {
        failedUnreleased.add(scope);
      }
      onStoreError("a send's outcome couldn't be recorded", error);
    }
    return outcome;
  }

  return {
    run(request, send) {
      const key = request.key;
      if (!key) {
        return send();
      }

      // Scoped per workspace, so one tenant's key can never answer another's send.
      const scope = JSON.stringify([request.businessId, key]);
      const fingerprint = createHmac("sha256", fingerprintSecret)
        .update(JSON.stringify([request.to, request.body]))
        .digest("base64");

      const inFlight = running.get(scope);
      if (inFlight) {
        return inFlight.fingerprint === fingerprint ? inFlight.outcome : Promise.resolve({ kind: "key_conflict" });
      }

      const outcome = attempt(scope, { businessId: request.businessId, key }, fingerprint, send).finally(() => {
        running.delete(scope);
      });
      running.set(scope, { fingerprint, outcome });
      return outcome;
    },
  };
}
