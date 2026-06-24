import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchBaileysStatus,
  isBaileysWorkerConfigured,
  requestBaileysPairing,
} from "./baileys-control";

const ORIGINAL_ENV = { ...process.env };

function mockFetch(body: unknown, { ok = true, status = 200 } = {}) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  process.env.BAILEYS_WORKER_URL = "https://worker.test/";
  process.env.BAILEYS_BRIDGE_SECRET = "s3cret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("baileys-control", () => {
  it("reports configured only when both env vars are present", () => {
    expect(isBaileysWorkerConfigured()).toBe(true);
    delete process.env.BAILEYS_BRIDGE_SECRET;
    expect(isBaileysWorkerConfigured()).toBe(false);
  });

  it("POSTs to /pair with the bridge secret and businessId", async () => {
    const fetchMock = mockFetch({ status: "qr", qr: "QR_PAYLOAD" });
    const result = await requestBaileysPairing("biz_1");

    expect(result).toEqual({ status: "qr", qr: "QR_PAYLOAD" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://worker.test/pair");
    expect(init.method).toBe("POST");
    expect(
      (init.headers as Record<string, string>)["x-vela-bridge-secret"]
    ).toBe("s3cret");
    expect(JSON.parse(init.body as string)).toEqual({ businessId: "biz_1" });
  });

  it("GETs /status with the businessId query", async () => {
    const fetchMock = mockFetch({ status: "connected" });
    const result = await fetchBaileysStatus("biz_1");

    expect(result).toEqual({ status: "connected" });
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://worker.test/status?businessId=biz_1");
  });

  it("returns null when the worker is not configured", async () => {
    delete process.env.BAILEYS_WORKER_URL;
    expect(await requestBaileysPairing("biz_1")).toBeNull();
    expect(await fetchBaileysStatus("biz_1")).toBeNull();
  });

  it("returns null on a non-ok worker response", async () => {
    mockFetch({}, { ok: false, status: 502 });
    expect(await requestBaileysPairing("biz_1")).toBeNull();
  });
});
