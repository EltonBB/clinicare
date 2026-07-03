import { NextResponse } from "next/server";

import { checkRateLimit, type RateLimitRule } from "@/lib/rate-limit";

/**
 * Per-device rate limit for authenticated mobile endpoints (defense in depth —
 * a valid token still shouldn't be able to hammer the DB). Mirrors how the web
 * app rate-limits even authenticated reads (see `api/clients/search`). Returns a
 * 429 response to short-circuit on, or null when within budget.
 */
export async function mobileRateLimit(
  deviceId: string,
  action: string,
  rule: RateLimitRule
): Promise<NextResponse | null> {
  const result = await checkRateLimit(`mobile-${action}:${deviceId}`, rule);
  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down for a moment." },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
    );
  }
  return null;
}
