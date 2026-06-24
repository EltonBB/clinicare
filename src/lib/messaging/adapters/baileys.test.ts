import { afterEach, describe, expect, it, vi } from "vitest";

import { buildConfiguredRegistry } from "../configure";
import { sendMessage } from "../index";
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
    mockFetch({ secretInternal: "worker stacktrace" }, { ok: false, status: 503 });
    await expect(
      adapter.send({ businessId: "b", to: "+14155550100", body: "x" })
    ).rejects.toThrow(/worker rejected the send \(status 503\)/);
  });

  it("rejects a malformed 200 response instead of recording a phantom send", async () => {
    // A 200 with an unexpected shape (proxy error page, contract drift) must not
    // be trusted — the old `as` cast would have mapped it to a bogus QUEUED.
    mockFetch({ ok: true });
    await expect(
      adapter.send({ businessId: "b", to: "+14155550100", body: "x" })
    ).rejects.toThrow(/unexpected response/);
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
