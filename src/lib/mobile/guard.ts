import { NextResponse } from "next/server";

import { canUseWorkspace, WORKSPACE_LOCKED_ERROR, type BillingSnapshot } from "@/lib/billing-access";
import { checkRateLimit, type RateLimitRule } from "@/lib/rate-limit";
import type { StaffAuthError } from "@/lib/staff-auth";

/**
 * The mobile twin of the web write gate (getAuthedBusiness): a workspace whose
 * plan has ended is read-only, so a staff write (clock in/out, cancel a visit,
 * message the clinic) is refused with a 403. Reads and sign-in keep working.
 */
export function mobileWriteBlocked(business: BillingSnapshot): NextResponse | null {
  if (canUseWorkspace(business)) return null;
  return NextResponse.json({ error: WORKSPACE_LOCKED_ERROR }, { status: 403 });
}

export function staffAuthResponse(error: StaffAuthError): NextResponse {
  return NextResponse.json(
    { error: error.error },
    {
      status: error.status,
      ...(error.retryAfterSeconds
        ? { headers: { "Retry-After": String(error.retryAfterSeconds) } }
        : {}),
    }
  );
}

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
