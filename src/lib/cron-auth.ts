import { timingSafeEqual } from "node:crypto";

/**
 * Authorize a Vercel Cron / internal trigger request.
 *
 * Fails CLOSED: without a configured `CRON_SECRET` the cron endpoints are never
 * publicly invocable (they send patient messages and spend on AI). Vercel Cron
 * sends `Authorization: Bearer <CRON_SECRET>` automatically, so production keeps
 * working once the secret is set. Comparison is constant-time.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();

  if (!configuredSecret) {
    return false;
  }

  const header = request.headers.get("authorization")?.trim() ?? "";
  const expected = `Bearer ${configuredSecret}`;

  const headerBytes = Buffer.from(header);
  const expectedBytes = Buffer.from(expected);

  // timingSafeEqual throws on length mismatch — guard first, then compare.
  if (headerBytes.length !== expectedBytes.length) {
    return false;
  }

  return timingSafeEqual(headerBytes, expectedBytes);
}
