export type NoShowRiskLevel = "low" | "medium" | "high";

/**
 * Transparent, weighted signals from the patient's own history — never an AI
 * call, never stored (see lib/no-show-risk-data.ts). `reasons` is ordered
 * most-important-first; it can be non-empty even at "low" (e.g. a long lead
 * time alone doesn't clear the medium threshold, but is still worth naming).
 */
export type NoShowRiskAssessment = {
  level: NoShowRiskLevel;
  reasons: string[];
  /** True with fewer than 2 past finalized visits — level is always "low" and reasons has exactly one entry. */
  insufficientHistory: boolean;
};

export type NoShowRiskPastVisit = {
  status: "COMPLETED" | "NO_SHOW" | "CANCELLED";
  startAt: Date;
  /**
   * When a CANCELLED row was actually cancelled — set once, immutable, cleared
   * on un-cancel (see the `cancelledAt` column and its callers). NOT the same
   * as `updatedAt`, which moves on every field edit, including editing a
   * still-cancelled booking's notes/time/staff/service. Null on a row
   * cancelled before this column existed, or on any non-CANCELLED status
   * (ignored either way — no late-cancel signal without a real timestamp).
   */
  cancelledAt: Date | null;
  /**
   * The row's `startAt` as of that same cancellation — NOT the same as this
   * type's own `startAt`, which can drift afterward (editing a still-cancelled
   * booking's time is a supported flow). The late-cancel gap must be measured
   * against the schedule that was true at the cancel, not whatever `startAt`
   * reads back as later. Null under the same conditions as `cancelledAt`.
   */
  cancelledScheduledStartAt: Date | null;
};

export type NoShowRiskAppointmentInput = {
  startAt: Date;
  createdAt: Date;
  status: "PENDING" | "CONFIRMED";
  reminderSent: boolean;
};

const RECENT_VISIT_WINDOW = 5;
const LATE_CANCEL_WINDOW_HOURS = 24;
const LONG_LEAD_TIME_DAYS = 30;
const HOUR_MS = 1000 * 60 * 60;
const DAY_MS = HOUR_MS * 24;

const WEIGHTS = {
  recentNoShow: 40,
  recentLateCancel: 20,
  unconfirmedReminder: 15,
  longLeadTime: 10,
} as const;

const HIGH_THRESHOLD = 40;
const MEDIUM_THRESHOLD = 15;

// The schedule to rank recency by: the frozen cancelledScheduledStartAt for a
// CANCELLED visit (falls back to startAt when null — a non-CANCELLED visit, or
// one cancelled before that column existed), never the visit's own mutable
// startAt. Editing a still-cancelled booking's time is a supported flow, and
// recency must not be reshuffled by it — the same reasoning as the frozen
// late-cancel gap above, applied to which visits count as "recent" at all
// (CodeRabbit #129: the data layer's query already orders by this; the scorer
// re-sorts independently and must agree, including when called directly with
// more than RECENT_VISIT_WINDOW visits, as the unit tests do).
function effectiveVisitTime(visit: NoShowRiskPastVisit): Date {
  return visit.status === "CANCELLED" && visit.cancelledScheduledStartAt
    ? visit.cancelledScheduledStartAt
    : visit.startAt;
}

export function scoreNoShowRisk(
  pastVisits: NoShowRiskPastVisit[],
  appointment: NoShowRiskAppointmentInput
): NoShowRiskAssessment {
  if (pastVisits.length < 2) {
    return { level: "low", reasons: ["Not enough visit history yet"], insufficientHistory: true };
  }

  const recent = [...pastVisits]
    .sort((a, b) => effectiveVisitTime(b).getTime() - effectiveVisitTime(a).getTime())
    .slice(0, RECENT_VISIT_WINDOW);

  const signals: Array<{ weight: number; text: string }> = [];

  if (recent.some((visit) => visit.status === "NO_SHOW")) {
    signals.push({ weight: WEIGHTS.recentNoShow, text: "Missed a recent appointment" });
  }

  const hadLateCancel = recent.some((visit) => {
    if (visit.status !== "CANCELLED" || !visit.cancelledAt || !visit.cancelledScheduledStartAt) return false;
    // The frozen schedule at cancellation, not the (possibly since-edited)
    // current startAt — see cancelledScheduledStartAt's own doc comment.
    const hoursBeforeStart =
      (visit.cancelledScheduledStartAt.getTime() - visit.cancelledAt.getTime()) / HOUR_MS;
    // cancelAppointmentCore has no startAt guard, so a cancellation can land
    // after the visit's scheduled start — hoursBeforeStart goes negative.
    // That's at least as late as any last-minute-before-start cancel (it
    // never counted as early: only a large POSITIVE gap does), so only the
    // upper bound excludes genuinely early cancellations (Codex).
    return hoursBeforeStart < LATE_CANCEL_WINDOW_HOURS;
  });
  if (hadLateCancel) {
    signals.push({ weight: WEIGHTS.recentLateCancel, text: "Cancelled last-minute recently" });
  }

  if (appointment.reminderSent && appointment.status !== "CONFIRMED") {
    signals.push({ weight: WEIGHTS.unconfirmedReminder, text: "Hasn't confirmed the reminder" });
  }

  const leadDays = (appointment.startAt.getTime() - appointment.createdAt.getTime()) / DAY_MS;
  if (leadDays >= LONG_LEAD_TIME_DAYS) {
    signals.push({ weight: WEIGHTS.longLeadTime, text: "Booked far in advance" });
  }

  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const level: NoShowRiskLevel = score >= HIGH_THRESHOLD ? "high" : score >= MEDIUM_THRESHOLD ? "medium" : "low";

  return {
    level,
    reasons: signals.sort((a, b) => b.weight - a.weight).map((signal) => signal.text),
    insufficientHistory: false,
  };
}
