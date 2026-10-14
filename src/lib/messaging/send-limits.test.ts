import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...args: unknown[]) => checkRateLimit(...args) }));

import { allowReplyAck, manualSendRefusal } from "./send-limits";

const allowed = { allowed: true, remaining: 1, retryAfterSeconds: 0 };
const refused = { allowed: false, remaining: 0, retryAfterSeconds: 30 };

beforeEach(() => {
  checkRateLimit.mockReset().mockResolvedValue(allowed);
});

describe("manualSendRefusal", () => {
  it("checks a per-minute and a per-hour budget for the clinic", async () => {
    await expect(manualSendRefusal("biz_1")).resolves.toBeNull();
    expect(checkRateLimit).toHaveBeenCalledWith("whatsapp-manual:60000:biz_1", { limit: 20, windowMs: 60_000 });
    expect(checkRateLimit).toHaveBeenCalledWith("whatsapp-manual:3600000:biz_1", { limit: 200, windowMs: 3_600_000 });
  });

  it("names a one-minute wait when the minute budget is spent", async () => {
    checkRateLimit.mockResolvedValueOnce(refused);
    await expect(manualSendRefusal("biz_1")).resolves.toBe(
      "You've sent a lot of messages in a short time. Wait a minute, then send again."
    );
  });

  // Codex #136: with both spent, the wait named is the hour's, not the minute's.
  it("names the longer wait when the minute and hour budgets are both spent", async () => {
    checkRateLimit.mockResolvedValueOnce(refused).mockResolvedValueOnce({ ...refused, retryAfterSeconds: 1_501 });
    await expect(manualSendRefusal("biz_1")).resolves.toBe(
      "You've sent a lot of messages in a short time. Wait about 26 minutes, then send again."
    );
  });

  // Codex #136: the hourly budget's wait is not "a minute".
  it("names the hourly wait when the hour budget is spent", async () => {
    checkRateLimit.mockResolvedValueOnce(allowed).mockResolvedValueOnce({ ...refused, retryAfterSeconds: 1_501 });
    await expect(manualSendRefusal("biz_1")).resolves.toBe(
      "You've sent a lot of messages in a short time. Wait about 26 minutes, then send again."
    );
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

  // Codex #136: many patients answering one reminder run share a clinic budget.
  it("also holds the clinic to a per-minute and per-hour budget across patients", async () => {
    await expect(allowReplyAck("biz_1", "client_1")).resolves.toBe(true);
    expect(checkRateLimit).toHaveBeenCalledWith("whatsapp-reply-ack:60000:biz_1", { limit: 20, windowMs: 60_000 });
    expect(checkRateLimit).toHaveBeenCalledWith("whatsapp-reply-ack:3600000:biz_1", {
      limit: 200,
      windowMs: 3_600_000,
    });

    checkRateLimit.mockResolvedValueOnce(allowed).mockResolvedValueOnce(refused);
    await expect(allowReplyAck("biz_1", "client_2")).resolves.toBe(false);
  });
});
