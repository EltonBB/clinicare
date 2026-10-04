import { afterEach, describe, expect, it, vi } from "vitest";

import { buildConfiguredRegistry } from "../configure";
import { sendMessage } from "../index";
import { SendOutcomeUnknownError } from "../types";
import { BaileysWhatsAppAdapter } from "./baileys";

type FetchResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

function mockFetch(body: unknown, { ok = true, status = 200 } = {}) {
  const fn = vi.fn(
    async (): Promise<FetchResponse> => ({
      ok,
      status,
      json: async () => body,
    })
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  vi.restoreAllMocks();
});

const adapter = new BaileysWhatsAppAdapter({
  workerUrl: "https://worker.test/",
  secret: "s3cret",
});

describe("BaileysWhatsAppAdapter", () => {
  it("POSTs a digits-only recipient with the bridge secret and trims the URL", async () => {
    const fetchMock = mockFetch({ providerMessageId: "BAE_1", status: "SENT" });

    const result = await adapter.send({
      businessId: "biz_1",
      to: "+1 (415) 555-0100",
      body: "  Hello there  ",
    });

    expect(result).toEqual({ providerMessageId: "BAE_1", status: "SENT" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://worker.test/send");
    expect(init.method).toBe("POST");
    expect(
      (init.headers as Record<string, string>)["x-vela-bridge-secret"]
    ).toBe("s3cret");
    expect(JSON.parse(init.body as string)).toEqual({
      businessId: "biz_1",
      to: "14155550100",
      body: "Hello there",
    });
  });

  it("maps worker statuses to delivery statuses", async () => {
    mockFetch({ providerMessageId: null, status: "QUEUED" });
    expect(
      (await adapter.send({ businessId: "b", to: "+14155550100", body: "x" }))
        .status
    ).toBe("QUEUED");

    mockFetch({ providerMessageId: "x", status: "FAILED" });
    expect(
      (await adapter.send({ businessId: "b", to: "+14155550100", body: "x" }))
        .status
    ).toBe("FAILED");
  });

  it("throws a generic error on a non-ok worker response", async () => {
    mockFetch({ secretInternal: "worker stacktrace", code: "send_failed" }, { ok: false, status: 502 });
    const error = (await adapter
      .send({ businessId: "b", to: "+14155550100", body: "x" })
      .catch((caught: unknown) => caught)) as Error;
    expect(error.message).toMatch(/worker rejected the send \(status 502\)/);
    expect(error.message).not.toMatch(/stacktrace/);
  });

  it("rejects a malformed 200 response instead of recording a phantom send", async () => {
    // A 200 with an unexpected shape (proxy error page, contract drift) must not
    // be trusted — the old `as` cast would have mapped it to a bogus QUEUED.
    mockFetch({ ok: true });
    await expect(
      adapter.send({ businessId: "b", to: "+14155550100", body: "x" })
    ).rejects.toThrow(/unexpected response/);
  });

  it("sends the idempotency key when one is given", async () => {
    const fetchMock = mockFetch({ providerMessageId: "BAE_1", status: "SENT" });
    await adapter.send({ businessId: "b", to: "+14155550100", body: "x", idempotencyKey: "follow-up:d1" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ idempotencyKey: "follow-up:d1" });
  });

  describe("tells an uncertain send from a definite failure", () => {
    const unkeyed = () => adapter.send({ businessId: "b", to: "+14155550100", body: "x" });
    const keyed = () => adapter.send({ businessId: "b", to: "+14155550100", body: "x", idempotencyKey: "follow-up:d1" });
    const definite = async (attempt: () => Promise<unknown>) => {
      const error = await attempt().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(SendOutcomeUnknownError);
    };
    const throwing = (failure: unknown) => {
      globalThis.fetch = vi.fn(async () => {
        throw failure;
      }) as unknown as typeof fetch;
    };

    it("the worker's 409 (its send timed out) and 422 (the key already carried a message) are uncertain", async () => {
      for (const status of [409, 422]) {
        for (const attempt of [unkeyed, keyed]) {
          mockFetch({ error: "Send outcome unknown." }, { ok: false, status });
          await expect(attempt()).rejects.toBeInstanceOf(SendOutcomeUnknownError);
        }
      }
    });

    it("the worker's own refusals — 400, 401, its coded 502 — are definite failures", async () => {
      for (const [status, body] of [
        [400, { error: "to must be a digits-only phone number." }],
        [401, { error: "Unauthorized." }],
        [502, { error: "Send failed.", code: "send_failed" }],
      ] as const) {
        for (const attempt of [unkeyed, keyed]) {
          mockFetch(body, { ok: false, status });
          await definite(attempt);
        }
      }
    });

    // Codex #133: a proxy's 5xx, an abort, a dropped connection or a garbled
    // 200 can each follow a send that went out. Unkeyed (an Inbox reply), that
    // may mean it was delivered; keyed, a retry is answered from the worker's
    // durable record of the key, so it is a plain, retryable failure.
    describe("an answer lost after the request may have reached the worker", () => {
      const lostAnswers: Array<[string, () => void]> = [
        ["a proxy's uncoded 502", () => mockFetch({ error: "Application failed to respond" }, { ok: false, status: 502 })],
        ["a proxy's 503", () => mockFetch(null, { ok: false, status: 503 })],
        ["a gateway timeout", () => mockFetch(null, { ok: false, status: 504 })],
        ["an abort", () => throwing(new DOMException("The operation was aborted due to timeout", "TimeoutError"))],
        ["a reset connection", () => throwing(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }))],
        ["a malformed 200", () => mockFetch({ ok: true })],
      ];

      it.each(lostAnswers)("%s is uncertain for an unkeyed send", async (_label, arrange) => {
        arrange();
        await expect(unkeyed()).rejects.toBeInstanceOf(SendOutcomeUnknownError);
      });

      it.each(lostAnswers)("%s is a retryable failure for a keyed send", async (_label, arrange) => {
        arrange();
        await definite(keyed);
      });
    });

    it("a connection that never carried the request is a definite failure", async () => {
      for (const cause of [
        { code: "ECONNREFUSED" },
        { code: "ENETUNREACH" },
        { code: "EHOSTUNREACH" },
        { code: "UND_ERR_CONNECT_TIMEOUT" },
        { code: "CERT_HAS_EXPIRED" },
        { code: "ERR_TLS_CERT_ALTNAME_INVALID" },
        // fetch can wrap the socket error twice.
        { message: "connect failed", cause: { code: "ERR_SSL_WRONG_VERSION_NUMBER" } },
      ]) {
        throwing(Object.assign(new TypeError("fetch failed"), { cause }));
        await definite(unkeyed);
      }
    });
  });

  it("rejects an empty body before any network call", async () => {
    const fetchMock = mockFetch({});
    await expect(
      adapter.send({ businessId: "b", to: "+14155550100", body: "   " })
    ).rejects.toThrow(/non-empty/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unusable recipient before any network call", async () => {
    const fetchMock = mockFetch({});
    await expect(
      adapter.send({ businessId: "b", to: "abc", body: "hi" })
    ).rejects.toThrow(/unusable recipient/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("buildConfiguredRegistry", () => {
  it("registers WhatsApp only when the worker is configured", () => {
    const configured = buildConfiguredRegistry({
      BAILEYS_WORKER_URL: "https://worker.test",
      BAILEYS_BRIDGE_SECRET: "s3cret",
    });
    expect(configured.get("WHATSAPP")).toBeInstanceOf(BaileysWhatsAppAdapter);

    const empty = buildConfiguredRegistry({});
    expect(empty.get("WHATSAPP")).toBeNull();
  });

  it("routes a WhatsApp send through the configured Baileys adapter", async () => {
    const fetchMock = mockFetch({ providerMessageId: "BAE_9", status: "SENT" });
    const registry = buildConfiguredRegistry({
      BAILEYS_WORKER_URL: "https://worker.test",
      BAILEYS_BRIDGE_SECRET: "s3cret",
    });

    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: { kind: "freeform", body: "Reminder reply" },
      },
      registry
    );

    expect(result).toEqual({
      ok: true,
      providerMessageId: "BAE_9",
      status: "SENT",
      body: "Reminder reply",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
