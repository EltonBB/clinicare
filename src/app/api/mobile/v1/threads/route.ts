import { NextResponse } from "next/server";

import { mobileRateLimit } from "@/lib/mobile/guard";
import { listConversations } from "@/lib/mobile/inbox";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const limited = await mobileRateLimit(ctx.device.id, "threads", { limit: 60, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  const conversations = await listConversations(ctx);
  return NextResponse.json({ conversations });
}
