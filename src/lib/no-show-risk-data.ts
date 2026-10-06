import { prisma } from "@/lib/prisma";
import { scoreNoShowRisk, type NoShowRiskAssessment } from "@/lib/no-show-risk";

// scoreNoShowRisk only ever looks at RECENT_VISIT_WINDOW (5) visits per client
// (src/lib/no-show-risk.ts), so each client's history read never needs more than
// that — bounded per client, not by a cap shared across the whole batch.
const RECENT_HISTORY_PER_CLIENT = 5;

type HistoryRow = {
  clientId: string;
  status: string;
  startAt: Date;
  cancelledAt: Date | null;
  cancelledScheduledStartAt: Date | null;
};

export type RiskableAppointment = {
  id: string;
  clientId: string;
  startAt: Date;
  createdAt: Date;
  status: "PENDING" | "CONFIRMED";
};

/**
 * One risk assessment per upcoming appointment, computed from each client's
 * own finalized visit history. Nothing is stored — recomputed on every call.
 * Not plan-gated here: the caller (a server action, a page) checks
 * isProBusinessPlan first, same as every other Pro-only data path in this
 * codebase, so the check lives once per call site, not duplicated here.
 */
export async function getNoShowRiskAssessments(args: {
  businessId: string;
  appointments: RiskableAppointment[];
  now?: Date;
}): Promise<Map<string, NoShowRiskAssessment>> {
  const { businessId, appointments, now = new Date() } = args;
  const upcoming = appointments.filter((appointment) => appointment.startAt.getTime() > now.getTime());

  if (upcoming.length === 0) {
    return new Map();
  }

  const clientIds = [...new Set(upcoming.map((appointment) => appointment.clientId))];
  const appointmentIds = upcoming.map((appointment) => appointment.id);

  const [history, sentReminders] = await Promise.all([
    // One round trip for every client, still index-driven per client: the lateral
    // subquery takes each client's own most recent finalized visits (via
    // (clientId, startAt)). A shared LIMIT would let one busy client crowd out
    // another's rows, and a query per client floods the small connection pool when
    // a Day view lists a couple of hundred appointments. The status list mirrors
    // AppointmentStatus's finalized values (NO_SHOW is the newest). COMPLETED and
    // NO_SHOW can only be set once an appointment's time has passed, but CANCELLED
    // can happen at any time — including for a booking still in the future — so
    // this is explicitly scoped to elapsed appointments; otherwise a client with
    // several cancelled FUTURE bookings could crowd real past visits out of the
    // 5-row window (or make a first-time client look past the 2-visit minimum).
    prisma.$queryRaw<HistoryRow[]>`
      SELECT h."clientId", h."status"::text AS "status", h."startAt", h."cancelledAt", h."cancelledScheduledStartAt"
      FROM unnest(${clientIds}::text[]) AS c(id)
      CROSS JOIN LATERAL (
        SELECT "clientId", "status", "startAt", "cancelledAt", "cancelledScheduledStartAt"
        FROM "Appointment"
        WHERE "businessId" = ${businessId}
          AND "clientId" = c.id
          AND "status" IN ('COMPLETED', 'NO_SHOW', 'CANCELLED')
          -- The frozen schedule for a CANCELLED row (falls back to startAt when
          -- it's null: a non-CANCELLED row, or one cancelled before this column
          -- existed). Using startAt directly would let editing a still-cancelled
          -- booking's time push it back into "the future" and silently drop an
          -- already-elapsed cancellation from history, or shuffle which five
          -- visits this LIMIT keeps (CodeRabbit #129).
          AND COALESCE("cancelledScheduledStartAt", "startAt") <= ${now}
        ORDER BY COALESCE("cancelledScheduledStartAt", "startAt") DESC
        LIMIT ${RECENT_HISTORY_PER_CLIENT}
      ) h
    `,
    prisma.appointmentReminder.findMany({
      where: { appointmentId: { in: appointmentIds }, status: "SENT" },
      select: { appointmentId: true },
    }),
  ]);

  const remindedIds = new Set(sentReminders.map((reminder) => reminder.appointmentId));
  const visitsByClient = new Map<string, HistoryRow[]>();
  for (const visit of history) {
    const list = visitsByClient.get(visit.clientId);
    if (list) list.push(visit);
    else visitsByClient.set(visit.clientId, [visit]);
  }

  const results = new Map<string, NoShowRiskAssessment>();
  for (const appointment of upcoming) {
    const history = visitsByClient.get(appointment.clientId) ?? [];
    results.set(
      appointment.id,
      scoreNoShowRisk(
        history.map((visit) => ({
          status: visit.status as "COMPLETED" | "NO_SHOW" | "CANCELLED",
          startAt: visit.startAt,
          cancelledAt: visit.cancelledAt,
          cancelledScheduledStartAt: visit.cancelledScheduledStartAt,
        })),
        {
          startAt: appointment.startAt,
          createdAt: appointment.createdAt,
          status: appointment.status,
          reminderSent: remindedIds.has(appointment.id),
        }
      )
    );
  }

  return results;
}
