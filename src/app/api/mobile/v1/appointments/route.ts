import { NextResponse } from "next/server";

import { listOwnAppointments } from "@/lib/mobile/appointments";
import { mobileRateLimit } from "@/lib/mobile/guard";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A doctor paging through their schedule has no legitimate reason to go
// further than a year out either direction — bounds a malformed/abusive
// offset before it reaches date math.
const MAX_OFFSET_DAYS = 365;

export async function GET(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const limited = await mobileRateLimit(ctx.device.id, "appointments", {
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) {
    return limited;
  }

  const searchParams = new URL(request.url).searchParams;
  const offsetParam = searchParams.get("offset");
  // Back-compat: a client built before the offset param existed only ever
  // sent day=today|tomorrow. Without this, such a client silently gets
  // today's schedule back while believing it asked for tomorrow's.
  const offset =
    offsetParam !== null ? Number(offsetParam) : searchParams.get("day") === "tomorrow" ? 1 : 0;
  if (!Number.isInteger(offset) || Math.abs(offset) > MAX_OFFSET_DAYS) {
    return NextResponse.json({ error: "Invalid date offset." }, { status: 400 });
  }

  const result = await listOwnAppointments(ctx, offset);
  return NextResponse.json(result);
}
