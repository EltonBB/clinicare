import { afterEach, describe, expect, it, vi } from "vitest";

import { MOBILE_JSON_MAX_BYTES, readMobileJson } from "./json-body";

function request(body: string, headers?: Record<string, string>) {
  return new Request("https://example.test/api/mobile/v1/clock", { method: "POST", body, headers });
}

describe("readMobileJson", () => {
  afterEach(() => vi.useRealTimers());

  it("accepts a maximum-length message including JSON unicode escapes", async () => {
    const result = await readMobileJson(request('{"body":"' + "\\u0061".repeat(4000) + '"}'));
    expect(result).toEqual({ data: { body: "a".repeat(4000) } });
  });

  it("rejects an oversized declared body before reading it", async () => {
    const input = request("{}", { "Content-Length": String(MOBILE_JSON_MAX_BYTES + 1) });
    const result = await readMobileJson(input);
    expect("response" in result && result.response.status).toBe(413);
    expect(input.bodyUsed).toBe(false);
  });

  it("counts actual bytes even when Content-Length is missing or falsely small", async () => {
    for (const headers of [undefined, { "Content-Length": "2" }]) {
      const result = await readMobileJson(request(JSON.stringify("é".repeat(20_000)), headers));
      expect("response" in result && result.response.status).toBe(413);
    }
  });

  it("accepts exactly the byte budget and rejects the next byte", async () => {
    const allowed = await readMobileJson(
      request(JSON.stringify("x".repeat(MOBILE_JSON_MAX_BYTES - 2))),
    );
    expect("data" in allowed).toBe(true);
    const denied = await readMobileJson(
      request(JSON.stringify("x".repeat(MOBILE_JSON_MAX_BYTES - 1))),
    );
    expect("response" in denied && denied.response.status).toBe(413);
  });

  it("returns a generic invalid-request response for malformed or missing JSON", async () => {
    for (const input of [
      request("{bad"),
      new Request("https://example.test", { method: "POST" }),
    ]) {
      const result = await readMobileJson(input);
      expect("response" in result && result.response.status).toBe(400);
      if ("response" in result)
        expect(await result.response.json()).toEqual({ error: "Invalid request." });
    }
  });

  it("cancels a stalled stream after the deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const input = new Request("https://example.test", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    const pending = readMobileJson(input);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    expect("response" in result && result.response.status).toBe(400);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows only genuinely empty optional bodies and still rejects malformed JSON", async () => {
    const absent = new Request("https://example.test", { method: "POST" });
    expect(await readMobileJson(absent, true)).toEqual({ data: undefined });
    const empty = new Request("https://example.test", { method: "POST", body: "" });
    expect(await readMobileJson(empty, true)).toEqual({ data: undefined });
    for (const body of [" ", "{", "undefined"]) {
      const result = await readMobileJson(new Request("https://example.test", { method: "POST", body }), true);
      expect("response" in result && result.response.status).toBe(400);
    }
  });
});
