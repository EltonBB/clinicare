import { NextResponse } from "next/server";

import { syncAppointmentRemindersJob } from "@/lib/reminders";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();

  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = request.headers.get("authorization")?.trim();
  return authorization === `Bearer ${configuredSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const result = await syncAppointmentRemindersJob();

    return NextResponse.json(
      {
        ok: true,
        processedBusinesses: result.processedBusinesses,
        sent: result.sent,
        failed: result.failed,
        triggeredAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Reminder cron job failed.", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Reminder cron job failed.",
      },
      { status: 500 }
    );
  }
}
