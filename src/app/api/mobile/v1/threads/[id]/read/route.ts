import { NextResponse } from "next/server";
import { z } from "zod";

import { mobileRateLimit, staffAuthResponse } from "@/lib/mobile/guard";
import { markConversationRead } from "@/lib/mobile/inbox";
import { readMobileJson } from "@/lib/mobile/json-body";
import { seenMessageIdsSchema } from "@/lib/mobile/thread-read";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";
const bodySchema = z.object({ seenMessageIds: seenMessageIdsSchema }).strict().optional();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return staffAuthResponse(ctx);
  }

  const limited = await mobileRateLimit(ctx.device.id, "thread-read", { limit: 90, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  const { id } = await params;
  const body = await readMobileJson(request, true);
  if ("response" in body) return body.response;
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const result = await markConversationRead(ctx, id, parsed.data?.seenMessageIds);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
