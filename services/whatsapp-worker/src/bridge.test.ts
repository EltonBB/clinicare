import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock("./config", () => ({
  BRIDGE_HEADER: "x-vela-bridge-secret",
  config: {
    appWebhookUrl: "https://app.example.test/webhook",
    bridgeSecret: "synthetic-test-secret",
  },
}));
vi.mock("./logger", () => ({ logger: mocks.logger }));

import { postToApp, type InboundEvent } from "./bridge";

const event: InboundEvent = {
  type: "message",
  businessId: "business-test",
  from: "15550000001",
  body: "Synthetic reply",
  providerMessageId: "message-test",
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("postToApp", () => {
  it("authenticates the event and gives every request an abort signal", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, status: 200 });
    await postToApp(event);

    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(
      "https://app.example.test/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vela-bridge-secret": "synthetic-test-secret",
        },
        body: JSON.stringify(event),
        signal: expect.any(AbortSignal),
      }
    );
  });

  it("retries network and server failures with backoff, preserving the event", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const delivery = postToApp(event);

    await vi.advanceTimersByTimeAsync(999);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(3999);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    await delivery;
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    for (const [, request] of mocks.fetch.mock.calls) {
      expect(JSON.parse(request.body)).toEqual(event);
    }
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it("does not retry an unauthorized webhook request or log its payload", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 401 });
    await postToApp(event);
    await vi.runAllTimersAsync();

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).toHaveBeenCalledExactlyOnceWith(
      { status: 401, businessId: event.businessId, type: event.type },
      "App webhook rejected event"
    );
  });
});
