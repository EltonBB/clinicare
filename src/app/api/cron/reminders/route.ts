import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { syncAppointmentRemindersJob } from "@/lib/reminders";
import { autoCloseStaleTimeEntries } from "@/lib/staff-clock";

export const dynamic = "force-dynamic";
// Reminders fan out across all WhatsApp-enabled clinics with external sends per
// appointment; give the batch room beyond the platform default.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const result = await syncAppointmentRemindersJob();

    // Close forgotten open check-ins so weekly hours don't inflate. Best-effort:
    // a sweep fault must not fail the reminders run.
    let closedTimeEntries = 0;
    try {
      ({ closed: closedTimeEntries } = await autoCloseStaleTimeEntries());
    } catch (error) {
      logger.error("Auto-close stale time entries failed.", error);
    }

    return NextResponse.json(
      {
        ok: true,
        processedBusinesses: result.processedBusinesses,
        sent: result.sent,
        failed: result.failed,
        closedTimeEntries,
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
    logger.error("Reminder cron job failed.", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Reminder cron job failed.",
      },
      { status: 500 }
    );
  }
}
