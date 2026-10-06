import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...args: unknown[]) => checkRateLimit(...args) }));

import { allowManualSend, allowReplyAck } from "./send-limits";

const allowed = { allowed: true, remaining: 1, retryAfterSeconds: 0 };
const refused = { allowed: false, remaining: 0, retryAfterSeconds: 30 };

beforeEach(() => {
  checkRateLimit.mockReset().mockResolvedValue(allowed);
});

describe("allowManualSend", () => {
  it("checks a per-minute and a per-hour budget for the clinic", async () => {
    await expect(allowManualSend("biz_1")).resolves.toBe(true);
    expect(checkRateLimit).toHaveBeenCalledWith("whatsapp-manual:60000:biz_1", { limit: 20, windowMs: 60_000 });
    expect(checkRateLimit).toHaveBeenCalledWith("whatsapp-manual:3600000:biz_1", { limit: 200, windowMs: 3_600_000 });
  });

  it.each([
    ["minute", [refused]],
    ["hour", [allowed, refused]],
  ])("refuses once the %s budget is spent", async (_label, results) => {
    for (const result of results) checkRateLimit.mockResolvedValueOnce(result);
    await expect(allowManualSend("biz_1")).resolves.toBe(false);
  });
});

describe("allowReplyAck", () => {
  it("allows a few automatic answers an hour per patient, keyed by record id", async () => {
    await expect(allowReplyAck("biz_1", "client_1")).resolves.toBe(true);
    expect(checkRateLimit).toHaveBeenCalledWith("whatsapp-reply-ack:biz_1:client_1", {
      limit: 3,
      windowMs: 3_600_000,
    });

    checkRateLimit.mockResolvedValueOnce(refused);
    await expect(allowReplyAck("biz_1", "client_1")).resolves.toBe(false);
  });
});
