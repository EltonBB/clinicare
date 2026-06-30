import { NextResponse } from "next/server";
import { z } from "zod";

import { mobileRateLimit } from "@/lib/mobile/guard";
import { registerDevicePushToken } from "@/lib/mobile/inbox";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";

const bodySchema = z.object({ expoPushToken: z.string().min(1).max(256) });

export async function POST(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const limited = await mobileRateLimit(ctx.device.id, "devices", { limit: 20, windowMs: 60_000 });
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

  await registerDevicePushToken(ctx, parsed.data.expoPushToken);
  return NextResponse.json({ ok: true });
}
