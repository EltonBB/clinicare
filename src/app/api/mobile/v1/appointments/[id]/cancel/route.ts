import { NextResponse } from "next/server";

import { cancelOwnAppointment } from "@/lib/mobile/appointments";
import { mobileRateLimit, mobileWriteBlocked, staffAuthResponse, mobileError } from "@/lib/mobile/guard";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";

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

  const limited = await mobileRateLimit(ctx.device.id, "cancel", { limit: 20, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  const { id } = await params;
  const result = await cancelOwnAppointment(ctx, id);
  if (!result.ok) {
    return mobileError(ctx.locale, result.error, result.status);
  }

  return NextResponse.json({ ok: true });
}
