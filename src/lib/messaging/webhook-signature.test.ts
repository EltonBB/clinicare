import { describe, expect, it } from "vitest";

import {
  signWebhookBody,
  verifyWebhookSignature,
  WEBHOOK_TOLERANCE_SECONDS,
} from "@/lib/messaging/webhook-signature";
// The worker ships its own copy of the signing half (it is a separate package
// deployed off Vercel). Importing it here proves the two sides interoperate.
import { signWebhookBody as workerSign } from "../../../services/whatsapp-worker/src/webhook-signature";

const SECRET = "test-webhook-secret-not-real";
const BODY = JSON.stringify({ type: "message", businessId: "biz_1", from: "38344123456", body: "1" });
const NOW_MS = Date.parse("2026-09-26T10:00:00.000Z");
const NOW_S = Math.floor(NOW_MS / 1000);

function verify(overrides: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) {
  return verifyWebhookSignature({
    secret: SECRET,
    timestamp: String(NOW_S),
    signature: signWebhookBody(SECRET, NOW_S, BODY),
    rawBody: BODY,
    nowMs: NOW_MS,
    ...overrides,
  });
}

describe("webhook signature", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(verify()).toEqual({ ok: true });
  });

  it("signs as `v1=` plus 64 hex characters", () => {
    expect(signWebhookBody(SECRET, NOW_S, BODY)).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it("interoperates with the worker's own signer", () => {
    expect(workerSign(SECRET, NOW_S, BODY)).toBe(signWebhookBody(SECRET, NOW_S, BODY));
    expect(verify({ signature: workerSign(SECRET, NOW_S, BODY) })).toEqual({ ok: true });
  });

  it("rejects a body changed after signing", () => {
    expect(verify({ rawBody: BODY.replace("biz_1", "biz_2") })).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a signature made with another secret (e.g. the outbound bridge secret)", () => {
    expect(verify({ signature: signWebhookBody("some-other-secret", NOW_S, BODY) })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("binds the signature to its timestamp, so a captured signature can't be re-dated", () => {
    const captured = signWebhookBody(SECRET, NOW_S - 10, BODY);
    expect(verify({ timestamp: String(NOW_S), signature: captured })).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a stale request (replay after the tolerance window)", () => {
    const old = NOW_S - WEBHOOK_TOLERANCE_SECONDS - 1;
    expect(verify({ timestamp: String(old), signature: signWebhookBody(SECRET, old, BODY) })).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("accepts a request right at the edge of the window, in either direction", () => {
    for (const ts of [NOW_S - WEBHOOK_TOLERANCE_SECONDS, NOW_S + WEBHOOK_TOLERANCE_SECONDS]) {
      expect(verify({ timestamp: String(ts), signature: signWebhookBody(SECRET, ts, BODY) })).toEqual({ ok: true });
    }
  });

  it("rejects a timestamp too far in the future", () => {
    const future = NOW_S + WEBHOOK_TOLERANCE_SECONDS + 1;
    expect(verify({ timestamp: String(future), signature: signWebhookBody(SECRET, future, BODY) })).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it.each([null, ""])("reports a missing signature header (%j)", (signature) => {
    expect(verify({ signature })).toEqual({ ok: false, reason: "missing" });
  });

  it.each([null, ""])("reports a missing timestamp header (%j)", (timestamp) => {
    expect(verify({ timestamp })).toEqual({ ok: false, reason: "missing" });
  });

  it.each([
    ["not a number", "yesterday"],
    ["negative", "-5"],
    ["decimal", "1.5"],
    ["exponent", "1e9"],
    ["hex", "0x10"],
    ["absurdly long", "9".repeat(30)],
  ])("rejects a malformed timestamp: %s", (_label, timestamp) => {
    expect(verify({ timestamp })).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    ["no version prefix", "a".repeat(64)],
    ["wrong version", "v2=" + "a".repeat(64)],
    ["too short", "v1=" + "a".repeat(63)],
    ["too long", "v1=" + "a".repeat(65)],
    ["not hex", "v1=" + "z".repeat(64)],
  ])("rejects a malformed signature: %s", (_label, signature) => {
    expect(verify({ signature })).toEqual({ ok: false, reason: "malformed" });
  });

  it("accepts an uppercase hex signature (hex is case-insensitive)", () => {
    const upper = "v1=" + signWebhookBody(SECRET, NOW_S, BODY).slice(3).toUpperCase();
    expect(verify({ signature: upper })).toEqual({ ok: true });
  });

  it("is deterministic for the same inputs", () => {
    expect(signWebhookBody(SECRET, NOW_S, BODY)).toBe(signWebhookBody(SECRET, NOW_S, BODY));
  });

  it("uses the current time when none is injected", () => {
    const nowS = Math.floor(Date.now() / 1000);
    expect(
      verifyWebhookSignature({
        secret: SECRET,
        timestamp: String(nowS),
        signature: signWebhookBody(SECRET, nowS, BODY),
        rawBody: BODY,
      })
    ).toEqual({ ok: true });
  });
});
