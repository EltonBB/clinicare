import { NextResponse } from "next/server";

import { mobileRateLimit } from "@/lib/mobile/guard";
import { prisma } from "@/lib/prisma";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";

/**
 * Sign-out revocation: the app clears its local secure-store token on sign-out,
 * but that alone leaves the device's bearer token valid on the backend
 * indefinitely. Revoking here means a signed-out (or lost/handed-off) device's
 * token stops authenticating immediately — requireStaffContext already checks
 * `revokedAt` on every request, so this is the only new logic needed.
 */
export async function POST(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const limited = await mobileRateLimit(ctx.device.id, "logout", { limit: 10, windowMs: 60_000 });
  if (limited) {
    return limited;
  }

  await prisma.staffDevice.update({
    where: { id: ctx.device.id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
