import { NextResponse } from "next/server";

import { mobileRateLimit } from "@/lib/mobile/guard";
import { getConversation } from "@/lib/mobile/inbox";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const limited = await mobileRateLimit(ctx.device.id, "thread", { limit: 90, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  const { id } = await params;
  const conversation = await getConversation(ctx, id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}
