import { NextResponse } from "next/server";
import { z } from "zod";

import { clockStaff } from "@/lib/mobile/clock";
import { mobileRateLimit, staffAuthResponse } from "@/lib/mobile/guard";
import { readMobileJson } from "@/lib/mobile/json-body";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";

const bodySchema = z.object({ action: z.enum(["in", "out"]) });

export async function POST(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return staffAuthResponse(ctx);
  }

  const limited = await mobileRateLimit(ctx.device.id, "clock", { limit: 20, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  const body = await readMobileJson(request);
  if ("response" in body) return body.response;
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await clockStaff(ctx, parsed.data.action);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ checkedIn: result.checkedIn });
}
