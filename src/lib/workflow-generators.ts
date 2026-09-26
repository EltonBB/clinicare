import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

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

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const clients = await prisma.client.findMany({
    where: {
      businessId,
      isArchived: false,
      status: { notIn: ["INACTIVE", "ARCHIVED"] },
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
    select: { id: true, clientId: true, client: { select: { name: true } }, amountCents: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_CANDIDATES_PER_RUN,
  });

  return payments.map((payment) => ({
    clientId: payment.clientId,
    kind: "PAYMENT" as const,
    paymentId: payment.id,
    body: `Hi ${payment.client.name}, a friendly reminder that you have an unpaid payment of ${formatCurrency(payment.amountCents)}.`,
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
