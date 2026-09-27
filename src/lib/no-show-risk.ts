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

export function scoreNoShowRisk(
  pastVisits: NoShowRiskPastVisit[],
  appointment: NoShowRiskAppointmentInput
): NoShowRiskAssessment {
  if (pastVisits.length < 2) {
    return { level: "low", reasons: ["Not enough visit history yet"], insufficientHistory: true };
  }

  const recent = [...pastVisits]
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
    .slice(0, RECENT_VISIT_WINDOW);

  const signals: Array<{ weight: number; text: string }> = [];

  if (recent.some((visit) => visit.status === "NO_SHOW")) {
    signals.push({ weight: WEIGHTS.recentNoShow, text: "Missed a recent appointment" });
  }

  const hadLateCancel = recent.some((visit) => {
    if (visit.status !== "CANCELLED" || !visit.cancelledAt) return false;
    const hoursBeforeStart = (visit.startAt.getTime() - visit.cancelledAt.getTime()) / HOUR_MS;
    return hoursBeforeStart >= 0 && hoursBeforeStart < LATE_CANCEL_WINDOW_HOURS;
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
