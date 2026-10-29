import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PADDLE_SIGNATURE_TOLERANCE_SECONDS, verifyPaddleSignature } from "./paddle-webhook";

const SECRET = "pdl_ntfset_test_secret";
const BODY = '{"event_type":"subscription.updated","data":{"id":"sub_1"}}';
const NOW_MS = Date.UTC(2026, 9, 26, 12, 0, 0);
const TS = Math.floor(NOW_MS / 1000);

function header(ts: number, body = BODY, secret = SECRET) {
  return `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`;
}

describe("verifyPaddleSignature", () => {
  it("accepts Paddle's ts/h1 signature over `${ts}:${body}`", () => {
    expect(verifyPaddleSignature({ header: header(TS), rawBody: BODY, secret: SECRET, nowMs: NOW_MS })).toEqual({ ok: true });
  });

  it("accepts any of several h1 values (Paddle sends one per secret while rotating)", () => {
    const rotated = `ts=${TS};h1=${"0".repeat(64)};h1=${header(TS).split("h1=")[1]}`;
    expect(verifyPaddleSignature({ header: rotated, rawBody: BODY, secret: SECRET, nowMs: NOW_MS })).toEqual({ ok: true });
  });

  it("refuses a missing or malformed header", () => {
    expect(verifyPaddleSignature({ header: null, rawBody: BODY, secret: SECRET, nowMs: NOW_MS })).toEqual({ ok: false, reason: "missing" });
    expect(verifyPaddleSignature({ header: "h1=abc", rawBody: BODY, secret: SECRET, nowMs: NOW_MS })).toEqual({ ok: false, reason: "malformed" });
    expect(verifyPaddleSignature({ header: `ts=1e9;h1=${"a".repeat(64)}`, rawBody: BODY, secret: SECRET, nowMs: NOW_MS })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("refuses a stale or far-future timestamp", () => {
    const stale = TS - PADDLE_SIGNATURE_TOLERANCE_SECONDS - 1;
    expect(verifyPaddleSignature({ header: header(stale), rawBody: BODY, secret: SECRET, nowMs: NOW_MS })).toEqual({ ok: false, reason: "stale" });
    const future = TS + PADDLE_SIGNATURE_TOLERANCE_SECONDS + 1;
    expect(verifyPaddleSignature({ header: header(future), rawBody: BODY, secret: SECRET, nowMs: NOW_MS })).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses a tampered body, a re-dated header and the wrong secret", () => {
    expect(verifyPaddleSignature({ header: header(TS), rawBody: `${BODY} `, secret: SECRET, nowMs: NOW_MS })).toEqual({ ok: false, reason: "mismatch" });
    const redated = header(TS).replace(`ts=${TS}`, `ts=${TS - 10}`);
    expect(verifyPaddleSignature({ header: redated, rawBody: BODY, secret: SECRET, nowMs: NOW_MS })).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyPaddleSignature({ header: header(TS, BODY, "other"), rawBody: BODY, secret: SECRET, nowMs: NOW_MS })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("never verifies against an empty secret", () => {
    expect(verifyPaddleSignature({ header: header(TS, BODY, ""), rawBody: BODY, secret: "", nowMs: NOW_MS })).toEqual({ ok: false, reason: "mismatch" });
  });
});
