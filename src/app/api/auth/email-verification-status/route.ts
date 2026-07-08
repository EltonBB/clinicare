import { NextRequest, NextResponse } from "next/server";

import { getEmailVerificationReceiptStatus } from "@/lib/email-verification-receipts";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

const NOT_VERIFIED = { verified: false } as const;
const NO_STORE = { "Cache-Control": "no-store" } as const;

function isValidTicket(value: string | null | undefined) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

export async function GET(request: NextRequest) {
  // Public + polled every few seconds during signup, so throttle per IP to bound
  // abuse of this unauthenticated DB read. A throttled caller gets the same
  // "not verified yet" shape (no enumeration oracle, no polling breakage) and we
  // skip the query entirely. The window is generous enough that a legitimate
  // poll never trips it.
  const rate = await checkRateLimit(
    `email-verify:${clientIpFromHeaders(request.headers)}`,
    { limit: 30, windowMs: 10_000 }
  );

  if (!rate.allowed) {
    return NextResponse.json(NOT_VERIFIED, { headers: NO_STORE });
  }

  const ticket = request.nextUrl.searchParams.get("ticket");

  if (!isValidTicket(ticket)) {
    return NextResponse.json(NOT_VERIFIED, { headers: NO_STORE });
  }

  const status = await getEmailVerificationReceiptStatus(ticket);
  return NextResponse.json(status, { headers: NO_STORE });
}
