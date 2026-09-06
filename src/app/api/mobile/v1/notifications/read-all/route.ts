import { NextResponse } from "next/server";

import { mobileRateLimit } from "@/lib/mobile/guard";
import { markAllNotificationsRead } from "@/lib/mobile/inbox";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const limited = await mobileRateLimit(ctx.device.id, "notification-read-all", {
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) {
    return limited;
  }

  const count = await markAllNotificationsRead(ctx);
  return NextResponse.json({ ok: true, count });
}
