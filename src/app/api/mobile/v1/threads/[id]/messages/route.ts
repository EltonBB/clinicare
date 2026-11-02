import { NextResponse } from "next/server";
import { z } from "zod";

import { mobileRateLimit, mobileWriteBlocked, staffAuthResponse, mobileError } from "@/lib/mobile/guard";
import { postConversationMessage } from "@/lib/mobile/inbox";
import { readMobileJson } from "@/lib/mobile/json-body";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";

const bodySchema = z.object({ body: z.string().min(1).max(4000) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return staffAuthResponse(ctx);
  }

  const blocked = mobileWriteBlocked(ctx.business, ctx.locale);
  if (blocked) return blocked;

  const limited = await mobileRateLimit(ctx.device.id, "thread-send", { limit: 30, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  const body = await readMobileJson(request);
  if ("response" in body) return body.response;
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) {
    return mobileError(ctx.locale, "Invalid request.", 400);
  }

  const { id } = await params;
  const result = await postConversationMessage(ctx, id, parsed.data.body);
  if (!result.ok) {
    return mobileError(ctx.locale, result.error, result.status);
  }

  return NextResponse.json({ threadId: result.threadId, message: result.message });
}
