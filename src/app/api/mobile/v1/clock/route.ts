import { NextResponse } from "next/server";
import { z } from "zod";

import { clockStaff } from "@/lib/mobile/clock";
import { mobileRateLimit } from "@/lib/mobile/guard";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";

const bodySchema = z.object({ action: z.enum(["in", "out"]) });

export async function POST(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const limited = await mobileRateLimit(ctx.device.id, "clock", { limit: 20, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await clockStaff(ctx, parsed.data.action);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ checkedIn: result.checkedIn });
}
