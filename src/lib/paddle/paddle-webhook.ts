import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paddle signs every webhook with the destination's secret key:
 * `Paddle-Signature: ts=<unix seconds>;h1=<hex HMAC-SHA256 of "<ts>:<raw body>">`.
 * While a secret is being rotated Paddle sends one `h1` per secret, so any match
 * passes. The timestamp is bounded so a captured request can't be replayed later.
 */
export const PADDLE_SIGNATURE_HEADER = "paddle-signature";

/** How far the signed timestamp may sit from now, either way. */
export const PADDLE_SIGNATURE_TOLERANCE_SECONDS = 300;

export type PaddleSignatureCheck = { ok: true } | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

const TIMESTAMP_PATTERN = /^\d{1,12}$/;
const HEX_64 = /^[0-9a-f]{64}$/i;

export function verifyPaddleSignature(args: {
  header: string | null;
  rawBody: string;
  secret: string;
  /** Injectable clock for tests. */
  nowMs?: number;
}): PaddleSignatureCheck {
  const { header, rawBody, secret } = args;
  if (!header) return { ok: false, reason: "missing" };

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(";")) {
    const [key, value] = part.split("=", 2).map((piece) => piece?.trim() ?? "");
    if (key === "ts") timestamp = value;
    else if (key === "h1" && HEX_64.test(value)) signatures.push(value.toLowerCase());
  }
  // Strict digits only: `Number("1e9")` and friends would otherwise parse.
  if (!timestamp || !TIMESTAMP_PATTERN.test(timestamp) || signatures.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  const nowSeconds = Math.floor((args.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > PADDLE_SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  if (!secret) return { ok: false, reason: "mismatch" };
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex"), "utf8");
  const matches = signatures.some((signature) => {
    const provided = Buffer.from(signature, "utf8");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
  return matches ? { ok: true } : { ok: false, reason: "mismatch" };
}
