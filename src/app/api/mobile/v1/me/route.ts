import { NextResponse } from "next/server";

import { mobileRateLimit } from "@/lib/mobile/guard";
import { loadMobileMe } from "@/lib/mobile/me";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const limited = await mobileRateLimit(ctx.device.id, "me", { limit: 60, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  const me = await loadMobileMe(ctx.device);
  if (!me) {
    return NextResponse.json({ error: "Account unavailable." }, { status: 404 });
  }

  return NextResponse.json({ me });
}
