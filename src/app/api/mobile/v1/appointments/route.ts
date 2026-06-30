import { NextResponse } from "next/server";

import { listOwnAppointments } from "@/lib/mobile/appointments";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const dayParam = new URL(request.url).searchParams.get("day");
  const day = dayParam === "tomorrow" ? "tomorrow" : "today";

  const appointments = await listOwnAppointments(ctx, day);
  return NextResponse.json({ appointments });
}
