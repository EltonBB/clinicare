import { prisma } from "@/lib/prisma";
import { scoreNoShowRisk, type NoShowRiskAssessment } from "@/lib/no-show-risk";
import type { AppointmentStatus } from "@prisma/client";

const FINALIZED_STATUSES: AppointmentStatus[] = ["COMPLETED", "NO_SHOW", "CANCELLED"];

// Bounds the shared history read across every client the caller passed in —
// always a small, already-bounded set (one popover, one day, one dashboard
// list), never a whole-workspace scan.
const HISTORY_FETCH_CAP = 500;

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

  const [pastVisits, sentReminders] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId, clientId: { in: clientIds }, status: { in: FINALIZED_STATUSES } },
      select: { clientId: true, status: true, startAt: true, updatedAt: true },
      orderBy: { startAt: "desc" },
      take: HISTORY_FETCH_CAP,
    }),
    prisma.appointmentReminder.findMany({
      where: { appointmentId: { in: appointmentIds }, status: "SENT" },
      select: { appointmentId: true },
    }),
  ]);

  const remindedIds = new Set(sentReminders.map((reminder) => reminder.appointmentId));
  const visitsByClient = new Map<string, typeof pastVisits>();
  for (const visit of pastVisits) {
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
          updatedAt: visit.updatedAt,
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
