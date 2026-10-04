import { describe, expect, it, vi } from "vitest";

import {
  classifySendError,
  createSendDeduper,
  IDEMPOTENCY_KEY_PATTERN,
  sendOutcomeResponse,
  TimeoutError,
  type SendOutcome,
} from "./send-dedupe";

const SENT: SendOutcome = { kind: "sent", result: { providerMessageId: "BAE_1", status: "SENT" } };
const REQUEST = { businessId: "biz_1", key: "follow-up:draft_1", to: "38344123456", body: "Hi" };

function deduper(now: () => number = () => 0) {
  return createSendDeduper({ ttlMs: 1000, maxEntries: 3, now });
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
    const dedupe = deduper();
    const send = vi
      .fn<() => Promise<SendOutcome>>()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValueOnce(SENT);

    expect(await dedupe.run(REQUEST, send)).toEqual({ kind: "failed" });
    expect(await dedupe.run(REQUEST, send)).toEqual(SENT);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("lets a concurrent repeat wait for the running attempt instead of sending in parallel", async () => {
    const dedupe = deduper();
    let finish: (outcome: SendOutcome) => void = () => {};
    const send = vi.fn(() => new Promise<SendOutcome>((resolve) => (finish = resolve)));

    const first = dedupe.run(REQUEST, send);
    const second = dedupe.run(REQUEST, send);
    await Promise.resolve();
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

  it("scopes keys per workspace", async () => {
    const dedupe = deduper();
    const send = vi.fn(async () => SENT);
    await dedupe.run(REQUEST, send);
    await dedupe.run({ ...REQUEST, businessId: "biz_2" }, send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("always sends an unkeyed request, remembering nothing", async () => {
    const dedupe = deduper();
    const send = vi.fn(async () => SENT);
    await dedupe.run({ ...REQUEST, key: undefined }, send);
    await dedupe.run({ ...REQUEST, key: undefined }, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(dedupe.size()).toBe(0);
  });

  it("sends again once the remembered outcome has expired", async () => {
    let time = 0;
    const dedupe = deduper(() => time);
    const send = vi.fn(async () => SENT);
    await dedupe.run(REQUEST, send);
    time = 1001;
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

  it("stays within its cap by dropping the oldest settled entries, never a running one", async () => {
    const dedupe = deduper();
    const running = dedupe.run({ ...REQUEST, key: "running" }, () => new Promise<SendOutcome>(() => {}));
    void running;
    for (const key of ["a", "b", "c", "d"]) {
      await dedupe.run({ ...REQUEST, key }, async () => SENT);
    }
    expect(dedupe.size()).toBe(3);

    // The running attempt is still shared, not started again.
    const again = vi.fn(async () => SENT);
    void dedupe.run({ ...REQUEST, key: "running" }, again);
    await Promise.resolve();
    expect(again).not.toHaveBeenCalled();
  });
});

describe("classifySendError", () => {
  it("only a timeout is uncertain", () => {
    expect(classifySendError(new TimeoutError("timed out"))).toEqual({ kind: "unknown" });
    expect(classifySendError(new Error("WhatsApp session is not connected."))).toEqual({ kind: "failed" });
  });
});

describe("sendOutcomeResponse", () => {
  it("maps each outcome to its HTTP answer", () => {
    expect(sendOutcomeResponse(SENT)).toEqual({ status: 200, body: SENT.kind === "sent" ? SENT.result : null });
    expect(sendOutcomeResponse({ kind: "unknown" }).status).toBe(409);
    expect(sendOutcomeResponse({ kind: "key_conflict" }).status).toBe(422);
    // 502 keeps meaning "definitely not sent" for every app version.
    expect(sendOutcomeResponse({ kind: "failed" }).status).toBe(502);
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
