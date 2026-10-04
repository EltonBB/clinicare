import { describe, expect, it, vi } from "vitest";

import {
  classifySendError,
  createSendDeduper,
  IDEMPOTENCY_KEY_PATTERN,
  sendOutcomeResponse,
  TimeoutError,
  SessionNotConnectedError,
  type SendKeyRecord,
  type SendKeyStore,
  type SendOutcome,
} from "./send-dedupe";

const SENT: SendOutcome = { kind: "sent", result: { providerMessageId: "BAE_1", status: "SENT" } };
const REQUEST = { businessId: "biz_1", key: "follow-up:draft_1", to: "38344123456", body: "Hi" };
const TTL_MS = 1000;

/** The Postgres table, in memory: what survives a worker restart. */
function memoryStore() {
  const rows = new Map<string, SendKeyRecord & { expiresAt: number }>();
  const id = (businessId: string, key: string) => `${businessId}|${key}`;
  const store: SendKeyStore = {
    async reserve({ businessId, key, fingerprint, expiresAt, now }) {
      const row = rows.get(id(businessId, key));
      if (row && row.expiresAt > now.getTime()) {
        return { fingerprint: row.fingerprint, state: row.state, providerMessageId: row.providerMessageId };
      }
      rows.set(id(businessId, key), {
        fingerprint,
        state: "SENDING",
        providerMessageId: null,
        expiresAt: expiresAt.getTime(),
      });
      return null;
    },
    async settle({ businessId, key, state, providerMessageId }) {
      const row = rows.get(id(businessId, key));
      if (row) Object.assign(row, { state, providerMessageId });
    },
    async release({ businessId, key }) {
      rows.delete(id(businessId, key));
    },
  };
  return { store, rows };
}

function deduper(store: SendKeyStore = memoryStore().store, now: () => number = () => 0) {
  return createSendDeduper({ store, ttlMs: TTL_MS, fingerprintSecret: "bridge-secret", now });
}

describe("createSendDeduper", () => {
  it("replays a successful send for a repeated key without sending again", async () => {
    const dedupe = deduper();
    const send = vi.fn(async () => SENT);

    expect(await dedupe.run(REQUEST, send)).toEqual(SENT);
    expect(await dedupe.run(REQUEST, send)).toEqual(SENT);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never re-sends a key whose send timed out — every repeat is answered unknown", async () => {
    const dedupe = deduper();
    const send = vi.fn(async (): Promise<SendOutcome> => ({ kind: "unknown" }));

    expect(await dedupe.run(REQUEST, send)).toEqual({ kind: "unknown" });
    expect(await dedupe.run(REQUEST, send)).toEqual({ kind: "unknown" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("forgets a definite failure, so a retry with the same key really sends", async () => {
    const { store, rows } = memoryStore();
    const dedupe = deduper(store);
    const send = vi
      .fn<() => Promise<SendOutcome>>()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValueOnce(SENT);

    expect(await dedupe.run(REQUEST, send)).toEqual({ kind: "failed" });
    expect(rows.size).toBe(0);
    expect(await dedupe.run(REQUEST, send)).toEqual(SENT);
    expect(send).toHaveBeenCalledTimes(2);
  });

  // Codex #133: the record has to outlive the process, or a worker restart
  // between a send and its retry lets the retry deliver the message twice.
  describe("across a worker restart (a fresh deduper on the same store)", () => {
    it("replays a send the previous process completed", async () => {
      const { store } = memoryStore();
      await deduper(store).run(REQUEST, async () => SENT);

      const send = vi.fn(async () => SENT);
      expect(await deduper(store).run(REQUEST, send)).toEqual(SENT);
      expect(send).not.toHaveBeenCalled();
    });

    it("answers unknown for a send the previous process started and never settled", async () => {
      const { store } = memoryStore();
      // The process dies mid-send: the record was written, the outcome never was.
      void deduper(store).run(REQUEST, () => new Promise<SendOutcome>(() => {}));
      await Promise.resolve();

      const send = vi.fn(async () => SENT);
      expect(await deduper(store).run(REQUEST, send)).toEqual({ kind: "unknown" });
      expect(send).not.toHaveBeenCalled();
    });

    it("tells a different message under a used key apart, with the same fingerprint secret", async () => {
      const { store } = memoryStore();
      await deduper(store).run(REQUEST, async () => SENT);

      expect(await deduper(store).run({ ...REQUEST, body: "Other" }, async () => SENT)).toEqual({
        kind: "key_conflict",
      });
    });
  });

  it("records the key before sending and the outcome after", async () => {
    const { store, rows } = memoryStore();
    const dedupe = deduper(store);
    const states: string[] = [];

    await dedupe.run(REQUEST, async () => {
      states.push(rows.get("biz_1|follow-up:draft_1")?.state ?? "none");
      return SENT;
    });

    expect(states).toEqual(["SENDING"]);
    expect(rows.get("biz_1|follow-up:draft_1")).toMatchObject({ state: "SENT", providerMessageId: "BAE_1" });
  });

  it("refuses to send, as a definite failure, when the key can't be recorded", async () => {
    const { store } = memoryStore();
    store.reserve = vi.fn(async () => {
      throw new Error("database down");
    });
    const onStoreError = vi.fn();
    const send = vi.fn(async () => SENT);
    const dedupe = createSendDeduper({ store, ttlMs: TTL_MS, fingerprintSecret: "s", onStoreError });

    expect(await dedupe.run(REQUEST, send)).toEqual({ kind: "failed" });
    expect(send).not.toHaveBeenCalled();
    expect(onStoreError).toHaveBeenCalledOnce();
  });

  it("still answers with the send's outcome when recording it fails (the record stays SENDING: unknown)", async () => {
    const { store, rows } = memoryStore();
    store.settle = vi.fn(async () => {
      throw new Error("database down");
    });
    const dedupe = deduper(store);

    expect(await dedupe.run(REQUEST, async () => SENT)).toEqual(SENT);
    expect(rows.get("biz_1|follow-up:draft_1")?.state).toBe("SENDING");
    expect(await dedupe.run(REQUEST, async () => SENT)).toEqual({ kind: "unknown" });
  });

  // Codex #133: a definite failure whose record couldn't be dropped stayed
  // SENDING, so the caller's retry read "unknown" and marked an unsent message sent.
  describe("a definite failure whose record couldn't be released", () => {
    const failingRelease = () => {
      const { store, rows } = memoryStore();
      const release = store.release;
      store.release = vi.fn(release).mockRejectedValueOnce(new Error("database down"));
      return { store, rows };
    };

    it("still really sends on this process's retry, dropping the stale record first", async () => {
      const { store, rows } = failingRelease();
      const dedupe = deduper(store);
      const send = vi
        .fn<() => Promise<SendOutcome>>()
        .mockResolvedValueOnce({ kind: "failed" })
        .mockResolvedValueOnce(SENT);

      expect(await dedupe.run(REQUEST, send)).toEqual({ kind: "failed" });
      expect(rows.get("biz_1|follow-up:draft_1")?.state).toBe("SENDING");

      expect(await dedupe.run(REQUEST, send)).toEqual(SENT);
      expect(send).toHaveBeenCalledTimes(2);
      expect(rows.get("biz_1|follow-up:draft_1")?.state).toBe("SENT");
    });

    it("refuses the retry, sending nothing, while the record still can't be released", async () => {
      const { store } = memoryStore();
      store.release = vi.fn(async () => {
        throw new Error("database down");
      });
      const dedupe = deduper(store);
      const send = vi.fn<() => Promise<SendOutcome>>().mockResolvedValue({ kind: "failed" });

      await dedupe.run(REQUEST, send);
      expect(await dedupe.run(REQUEST, send)).toEqual({ kind: "failed" });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it("after a worker restart, reads the stale record as unknown — never a second message", async () => {
      const { store } = failingRelease();
      await deduper(store).run(REQUEST, async () => ({ kind: "failed" }));

      const send = vi.fn(async () => SENT);
      expect(await deduper(store).run(REQUEST, send)).toEqual({ kind: "unknown" });
      expect(send).not.toHaveBeenCalled();
    });
  });

  it("lets a concurrent repeat wait for the running attempt instead of sending in parallel", async () => {
    const dedupe = deduper();
    let finish: (outcome: SendOutcome) => void = () => {};
    const send = vi.fn(() => new Promise<SendOutcome>((resolve) => (finish = resolve)));

    const first = dedupe.run(REQUEST, send);
    const second = dedupe.run(REQUEST, send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    finish(SENT);

    expect(await first).toEqual(SENT);
    expect(await second).toEqual(SENT);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refuses a key reused for a different recipient or text", async () => {
    const dedupe = deduper();
    const send = vi.fn(async () => SENT);
    await dedupe.run(REQUEST, send);

    expect(await dedupe.run({ ...REQUEST, body: "Other" }, send)).toEqual({ kind: "key_conflict" });
    expect(await dedupe.run({ ...REQUEST, to: "38344000000" }, send)).toEqual({ kind: "key_conflict" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refuses a different message under a key whose attempt is still running", async () => {
    const dedupe = deduper();
    void dedupe.run(REQUEST, () => new Promise<SendOutcome>(() => {}));

    expect(await dedupe.run({ ...REQUEST, body: "Other" }, async () => SENT)).toEqual({ kind: "key_conflict" });
  });

  it("scopes keys per workspace", async () => {
    const dedupe = deduper();
    const send = vi.fn(async () => SENT);
    await dedupe.run(REQUEST, send);
    await dedupe.run({ ...REQUEST, businessId: "biz_2" }, send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("always sends an unkeyed request, recording nothing", async () => {
    const { store, rows } = memoryStore();
    const dedupe = deduper(store);
    const send = vi.fn(async () => SENT);
    await dedupe.run({ ...REQUEST, key: undefined }, send);
    await dedupe.run({ ...REQUEST, key: undefined }, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(rows.size).toBe(0);
  });

  it("sends again once the record has expired", async () => {
    let time = 0;
    const dedupe = deduper(memoryStore().store, () => time);
    const send = vi.fn(async () => SENT);
    await dedupe.run(REQUEST, send);
    time = TTL_MS + 1;
    await dedupe.run(REQUEST, send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("treats an unexpected throw as unknown, never as safe to retry", async () => {
    const dedupe = deduper();
    const send = vi.fn(async (): Promise<SendOutcome> => {
      throw new Error("bug");
    });
    expect(await dedupe.run(REQUEST, send)).toEqual({ kind: "unknown" });
    expect(await dedupe.run(REQUEST, send)).toEqual({ kind: "unknown" });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("classifySendError", () => {
  // Baileys' Boom shape, as its sendRawMessage raises it before writing.
  const boom = (message: string, statusCode: number) =>
    Object.assign(new Error(message), { isBoom: true, output: { statusCode } });

  it("is a definite failure only when nothing can have been written", () => {
    expect(classifySendError(new SessionNotConnectedError("WhatsApp session is not connected."))).toEqual({
      kind: "failed",
    });
    expect(classifySendError(boom("Connection Closed", 428))).toEqual({ kind: "failed" });
  });

  // Codex #133: Baileys awaits the socket write's callback, so a transport
  // error from the write can follow bytes that already left.
  it("treats a timeout, a transport error or anything unrecognised as unknown", () => {
    expect(classifySendError(new TimeoutError("timed out"))).toEqual({ kind: "unknown" });
    expect(classifySendError(Object.assign(new Error("write ECONNRESET"), { code: "ECONNRESET" }))).toEqual({
      kind: "unknown",
    });
    expect(classifySendError(boom("Timed Out", 408))).toEqual({ kind: "unknown" });
    expect(classifySendError(boom("Connection Closed", 500))).toEqual({ kind: "unknown" });
    expect(classifySendError(new Error("WhatsApp session is not connected."))).toEqual({ kind: "unknown" });
  });
});

describe("sendOutcomeResponse", () => {
  it("maps each outcome to its HTTP answer", () => {
    expect(sendOutcomeResponse(SENT)).toEqual({ status: 200, body: SENT.kind === "sent" ? SENT.result : null });
    expect(sendOutcomeResponse({ kind: "unknown" }).status).toBe(409);
    expect(sendOutcomeResponse({ kind: "key_conflict" }).status).toBe(422);
    // The worker's own "definitely not sent" carries a code, so the app can tell
    // it from a proxy's 502 (Codex #133).
    expect(sendOutcomeResponse({ kind: "failed" })).toEqual({
      status: 502,
      body: { error: "Send failed.", code: "send_failed" },
    });
  });
});

describe("IDEMPOTENCY_KEY_PATTERN", () => {
  it("accepts short opaque keys and refuses anything else", () => {
    expect(IDEMPOTENCY_KEY_PATTERN.test("reminder:clx1:FIRST:1700000000000")).toBe(true);
    expect(IDEMPOTENCY_KEY_PATTERN.test("")).toBe(false);
    expect(IDEMPOTENCY_KEY_PATTERN.test("a".repeat(129))).toBe(false);
    expect(IDEMPOTENCY_KEY_PATTERN.test("has space")).toBe(false);
  });
});
