import { NextResponse } from "next/server";

import { loadMobileMe } from "@/lib/mobile/me";
import { requireStaffContext } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await requireStaffContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const me = await loadMobileMe(ctx.device);
  if (!me) {
    return NextResponse.json({ error: "Account unavailable." }, { status: 404 });
  }

  return NextResponse.json({ me });
}
