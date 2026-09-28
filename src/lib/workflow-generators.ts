import type { Prisma } from "@prisma/client";

import { ELIGIBLE_CLIENT_WHERE } from "@/lib/client-eligibility";
import { prisma } from "@/lib/prisma";
import { getZonedDateParts, getZonedMonthStart } from "@/lib/time-zone";

export type WorkflowSettingsValues = {
  rebookEnabled: boolean;
  rebookAfterMonths: number;
  paymentReminderEnabled: boolean;
  paymentReminderAfterDays: number;
  thankYouEnabled: boolean;
  thankYouDelayHours: number;
};

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettingsValues = {
  rebookEnabled: false,
  rebookAfterMonths: 6,
  paymentReminderEnabled: true,
  paymentReminderAfterDays: 3,
  thankYouEnabled: true,
  thankYouDelayHours: 2,
};

export type FollowUpDraftInput = {
  clientId: string;
  kind: "REBOOK" | "PAYMENT" | "THANK_YOU";
  body: string;
  appointmentId?: string;
  paymentId?: string;
  dedupeKey: string;
};

/**
 * Per-generator cap on rows read in one run, so an hourly cron over a large
 * clinic can't load unbounded rows. Each query excludes rows that already have
 * a draft and is ordered oldest-first with an id tiebreaker, so a capped run
 * simply continues with the next batch on the following run.
 */
const MAX_CANDIDATES_PER_RUN = 200;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * A pending rebook draft lives at most ~35 days (follow-up-generation.ts), so a
 * confirmed or completed visit inside the last 28 days means the nudge is
 * stale — e.g. a walk-in recorded after the draft was made. The generator's
 * own `lastVisitAt < cutoff` filter already keeps a fresh draft from being
 * made for such a client at the normal (3+ month) settings; a draft made for a
 * client last seen inside the window (the 1-month setting) is retired at once,
 * which is harmless.
 */
export const REBOOK_RECENT_VISIT_DAYS = 28;

/**
 * "This client has rebooked or been back since the rebook draft was made": a
 * future pending/confirmed booking, or a confirmed/completed visit inside
 * REBOOK_RECENT_VISIT_DAYS. The Follow-ups list/count/Send hide a REBOOK draft
 * when the client has an appointment matching this (`appointments: { none }`),
 * and the hourly sweep expires it when they do (`appointments: { some }`) —
 * both built from this one filter so the two are exact complements.
 */
export function rebookedAppointmentWhere(now: Date): Prisma.AppointmentWhereInput {
  const recentVisitSince = new Date(now.getTime() - REBOOK_RECENT_VISIT_DAYS * DAY_MS);
  return {
    OR: [
      { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: now } },
      { status: { in: ["CONFIRMED", "COMPLETED"] }, startAt: { gt: recentVisitSince } },
    ],
  };
}

// Clinic-local, not UTC: a UTC month boundary drifts from the clinic's own
// calendar month by the zone's offset (e.g. Europe/Budapest is UTC+1/+2), so
// an hourly run in the first local hours of a new month could still see the
// previous UTC month here — and if staff send that nudge before UTC
// midnight, the very next run computes a NEW key and drafts a second one for
// the same client in the same clinic-local month (Codex #130).
function monthKey(date: Date): string {
  const parts = getZonedDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

/**
 * `date` minus `months` calendar months, clamping the day-of-month so a short
 * target month doesn't roll forward (Aug 31 minus 6 months is Feb 28/29, not Mar 3).
 */
function subtractMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const daysInTargetMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, daysInTargetMonth));
  return result;
}

/**
 * Clients whose last visit is older than the configured window, with no
 * future booking, who are not marked inactive or archived (a clinic does that on
 * purpose — don't nag them) and who don't already have an open rebook draft or one from
 * this calendar month. The draft exclusion is what lets the 200-row cap drain
 * the backlog instead of re-reading the same oldest clients every run. The
 * dedupeKey month is kept only as a race guard against concurrent runs.
 */
export async function findRebookCandidates(args: {
  businessId: string;
  settings: WorkflowSettingsValues;
  now: Date;
}): Promise<FollowUpDraftInput[]> {
  const { businessId, settings, now } = args;
  if (!settings.rebookEnabled) return [];

  const cutoff = subtractMonthsUtc(now, settings.rebookAfterMonths);
  // Clinic-local month start — see monthKey's own comment on why this can't
  // be a UTC boundary.
  const monthStart = getZonedMonthStart(now);

  const clients = await prisma.client.findMany({
    where: {
      businessId,
      ...ELIGIBLE_CLIENT_WHERE,
      lastVisitAt: { not: null, lt: cutoff },
      appointments: { none: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: now } } },
      followUpDrafts: { none: { kind: "REBOOK", OR: [{ status: "PENDING" }, { createdAt: { gte: monthStart } }] } },
    },
    select: { id: true, name: true },
    orderBy: [{ lastVisitAt: "asc" }, { id: "asc" }],
    take: MAX_CANDIDATES_PER_RUN,
  });

  return clients.map((client) => ({
    clientId: client.id,
    kind: "REBOOK" as const,
    body: `Hi ${client.name}, it's been a while since your last visit — want to book your next appointment?`,
    dedupeKey: `REBOOK:${client.id}:${monthKey(now)}`,
  }));
}

/**
 * One draft per unpaid/partially-paid payment older than the configured window.
 * Payments that already have a payment draft are excluded so the 200-row cap
 * can't be filled forever by the same old, still-unpaid entries.
 *
 * The message names no amount: the app has no per-clinic currency yet (its
 * money formatting is fixed to USD), so a euro clinic's patient would be told
 * "$50.00". Staff can add the amount when they review the draft.
 */
export async function findPaymentReminderCandidates(args: {
  businessId: string;
  settings: WorkflowSettingsValues;
  now: Date;
}): Promise<FollowUpDraftInput[]> {
  const { businessId, settings, now } = args;
  if (!settings.paymentReminderEnabled) return [];

  const cutoff = new Date(now.getTime() - settings.paymentReminderAfterDays * 24 * HOUR_MS);

  const payments = await prisma.clientPayment.findMany({
    where: {
      businessId,
      status: { in: ["Unpaid", "Partially Paid"] },
      createdAt: { lt: cutoff },
      followUpDrafts: { none: { kind: "PAYMENT" } },
    },
    select: { id: true, clientId: true, client: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_CANDIDATES_PER_RUN,
  });

  return payments.map((payment) => ({
    clientId: payment.clientId,
    kind: "PAYMENT" as const,
    paymentId: payment.id,
    body: `Hi ${payment.client.name}, a friendly reminder that you have an unpaid payment with us. Please get in touch if you have any questions.`,
    dedupeKey: `PAYMENT:${payment.id}`,
  }));
}

/**
 * One draft per appointment that completed inside the scan window and has no
 * thank-you draft yet.
 *
 * The query matches `endAt` in `(lookbackWindowStart, now - thankYouDelayHours]`,
 * so the interval is only non-empty when `lookbackWindowStart` is earlier than
 * `now - thankYouDelayHours`. Because the delay is per business, a caller MUST
 * compute it per business as
 * `new Date(now.getTime() - (settings.thankYouDelayHours + windowHours) * 3_600_000)`,
 * where `windowHours` is how far back to re-scan (it must be longer than the cron
 * period and long enough to cover a late "completed" sweep). Overlap between runs is
 * harmless: appointments that already have a draft are excluded. Passing a start at
 * or after the delay cutoff throws instead of silently returning nothing.
 */
export async function findThankYouCandidates(args: {
  businessId: string;
  settings: WorkflowSettingsValues;
  now: Date;
  lookbackWindowStart: Date;
}): Promise<FollowUpDraftInput[]> {
  const { businessId, settings, now, lookbackWindowStart } = args;
  if (!settings.thankYouEnabled) return [];

  const cutoff = new Date(now.getTime() - settings.thankYouDelayHours * HOUR_MS);
  if (lookbackWindowStart >= cutoff) {
    throw new Error("findThankYouCandidates: lookbackWindowStart must be earlier than now minus the thank-you delay");
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId,
      status: "COMPLETED",
      endAt: { lte: cutoff, gt: lookbackWindowStart },
      followUpDrafts: { none: { kind: "THANK_YOU" } },
    },
    select: { id: true, clientId: true, client: { select: { name: true } } },
    orderBy: [{ endAt: "asc" }, { id: "asc" }],
    take: MAX_CANDIDATES_PER_RUN,
  });

  return appointments.map((appointment) => ({
    clientId: appointment.clientId,
    kind: "THANK_YOU" as const,
    appointmentId: appointment.id,
    body: `Thank you for visiting us, ${appointment.client.name}! We hope to see you again soon.`,
    dedupeKey: `THANK_YOU:${appointment.id}`,
  }));
}
