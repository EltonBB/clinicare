import { NextResponse } from "next/server";

import { mobileRateLimit } from "@/lib/mobile/guard";
import { markNotificationRead } from "@/lib/mobile/inbox";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const limited = await mobileRateLimit(ctx.device.id, "notification-read", {
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) {
    return limited;
  }

  const { id } = await params;
  const ok = await markNotificationRead(ctx, id);
  return NextResponse.json({ ok });
}
