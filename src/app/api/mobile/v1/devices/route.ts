import { NextResponse } from "next/server";
import { z } from "zod";

import { mobileRateLimit, staffAuthResponse } from "@/lib/mobile/guard";
import { registerDevicePushToken } from "@/lib/mobile/inbox";
import { readMobileJson } from "@/lib/mobile/json-body";
import { isExpoPushToken } from "@/lib/mobile/push-token";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";

const bodySchema = z.object({ expoPushToken: z.string().max(256).refine(isExpoPushToken) });

export async function POST(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return staffAuthResponse(ctx);
  }

  const limited = await mobileRateLimit(ctx.device.id, "devices", { limit: 20, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  const body = await readMobileJson(request);
  if ("response" in body) return body.response;
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await registerDevicePushToken(ctx, parsed.data.expoPushToken);
  return NextResponse.json({ ok: true });
}
