import { NextResponse } from "next/server";

import { cancelOwnAppointment } from "@/lib/mobile/appointments";
import { mobileRateLimit } from "@/lib/mobile/guard";
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

  const limited = await mobileRateLimit(ctx.device.id, "cancel", { limit: 20, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  const { id } = await params;
  const result = await cancelOwnAppointment(ctx, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
