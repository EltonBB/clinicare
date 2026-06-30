import { NextResponse } from "next/server";

import { mobileRateLimit } from "@/lib/mobile/guard";
import { listNotifications } from "@/lib/mobile/inbox";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const limited = await mobileRateLimit(ctx.device.id, "notifications", { limit: 60, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  const notifications = await listNotifications(ctx);
  return NextResponse.json({ notifications });
}
