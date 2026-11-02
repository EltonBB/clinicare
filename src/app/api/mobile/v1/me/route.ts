import { NextResponse } from "next/server";

import { mobileRateLimit, staffAuthResponse, mobileError } from "@/lib/mobile/guard";
import { loadMobileMe } from "@/lib/mobile/me";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return staffAuthResponse(ctx);
  }

  const limited = await mobileRateLimit(ctx.device.id, "me", { limit: 60, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  const me = await loadMobileMe(ctx.device, ctx.locale);
  if (!me) {
    return mobileError(ctx.locale, "Account unavailable.", 404);
  }

  return NextResponse.json({ me });
}
