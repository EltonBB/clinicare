import { BusinessPlan, type Prisma } from "@prisma/client";

import { isProBusinessPlan } from "@/lib/billing";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { expirePastSlotOffers } from "@/lib/slot-offers";
import {
  DEFAULT_WORKFLOW_SETTINGS,
  findPaymentReminderCandidates,
  findRebookCandidates,
  findThankYouCandidates,
  type FollowUpDraftInput,
  type WorkflowSettingsValues,
} from "@/lib/workflow-generators";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Stop starting new businesses after this long. The route's maxDuration is 120s;
 * this is only a safety net at pilot scale, and the leftover businesses are
 * picked up by the next hourly run (candidates already drafted are excluded).
 */
const GENERATION_BUDGET_MS = 90_000;

/**
 * How far behind "now - thank-you delay" the thank-you scan looks. It must
 * exceed the cron period so no completed visit falls between two runs; the
 * overlap between hourly runs is harmless because the generator excludes
 * appointments that already have a thank-you draft. The flip side is a
 * deliberate cut-off: a visit the "completed" sweep only flips more than this
 * long after it ended is not thanked — a stale thank-you is worse than none.
 */
const THANK_YOU_WINDOW_HOURS = 24;

// Age limits for pending drafts nobody acted on. A rebook draft is regenerated
// monthly, so a 35-day-old one has been replaced or is moot; a thank-you is
// only worth sending close to the visit.
const REBOOK_MAX_AGE_DAYS = 35;
const THANK_YOU_MAX_AGE_DAYS = 3;

type RunTotals = { draftsCreated: number; errors: number; budgetSpent: boolean };

// A Prisma error code, without importing the runtime error class (same duck
// typing as messaging/inbound.ts).
function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
}

/**
 * P2002 (dedupeKey already exists: an idempotent re-run or a concurrent run won
 * the race) and P2003 (the client/appointment/payment was deleted between the
 * read and this write) both mean "there is nothing left to draft" — skip the
 * row. Anything else is a real failure and is rethrown.
 */
function isBenignWriteError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "P2002" || code === "P2003";
}

async function writeDrafts(
  businessId: string,
  inputs: FollowUpDraftInput[],
  totals: RunTotals,
  deadlineAt: number
): Promise<void> {
  for (const input of inputs) {
    // Checked per row, not just per business: one clinic with a large backlog
    // must not carry the run past maxDuration and skip the sweeps. Whatever is
    // left is picked up next run (the generators exclude rows already drafted).
    if (Date.now() > deadlineAt) {
      totals.budgetSpent = true;
      break;
    }

    try {
      await prisma.followUpDraft.create({
        data: {
          businessId,
          clientId: input.clientId,
          kind: input.kind,
          status: "PENDING",
          appointmentId: input.appointmentId,
          paymentId: input.paymentId,
          dedupeKey: input.dedupeKey,
          body: input.body,
        },
      });
      // Counted per row, so drafts written before a later row throws still show.
      totals.draftsCreated += 1;
    } catch (error) {
      if (!isBenignWriteError(error)) {
        throw error;
      }
    }
  }
}

async function generateForBusiness(
  business: { id: string; plan: BusinessPlan; workflowSettings: WorkflowSettingsValues | null },
  now: Date,
  totals: RunTotals,
  deadlineAt: number
): Promise<void> {
  const settings = business.workflowSettings ?? DEFAULT_WORKFLOW_SETTINGS;
  const businessId = business.id;

  // Per business, because the delay is: the generator needs the scan to start
  // strictly earlier than now - delay, so a fixed global start can't be right.
  const lookbackWindowStart = new Date(now.getTime() - (settings.thankYouDelayHours + THANK_YOU_WINDOW_HOURS) * HOUR_MS);

  // async thunks so even a synchronous throw becomes a rejection for allSettled.
  const generators: Array<{ name: string; run: () => Promise<FollowUpDraftInput[]> }> = [];
  // Rebook is Pro-only, and the plan check (not the stored toggle) is what
  // enforces it: a downgraded workspace may still have rebookEnabled saved.
  if (isProBusinessPlan(business.plan)) {
    generators.push({ name: "rebook", run: async () => findRebookCandidates({ businessId, settings, now }) });
  }
  generators.push({ name: "payment reminder", run: async () => findPaymentReminderCandidates({ businessId, settings, now }) });
  generators.push({
    name: "thank-you",
    run: async () => findThankYouCandidates({ businessId, settings, now, lookbackWindowStart }),
  });

  // allSettled: one generator failing must not discard the other two's candidates.
  const settled = await Promise.allSettled(generators.map((generator) => generator.run()));

  const candidates: FollowUpDraftInput[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      candidates.push(...outcome.value);
      return;
    }
    totals.errors += 1;
    logger.error(`Follow-up ${generators[index].name} generation failed for a business.`, outcome.reason, { businessId });
  });

  await writeDrafts(businessId, candidates, totals, deadlineAt);
}

/**
 * Retires PENDING drafts that no longer make sense to send. Global (every
 * workspace; the pending set is small) and one updateMany per kind. SENT
 * drafts are never touched, and slot offers have their own sweep.
 */
export async function expireStaleFollowUpDrafts(now: Date): Promise<number> {
  // "Not Pro" as billing.ts defines it, so a plan added to the enum later is
  // classified by that one helper instead of a list kept in sync here.
  const nonProPlans = Object.values(BusinessPlan).filter((plan) => !isProBusinessPlan(plan));

  const rules: Prisma.FollowUpDraftWhereInput[] = [
    // The reminder would tell someone who already paid (or whose entry was
    // deleted — paymentId is then null) that they owe money.
    {
      kind: "PAYMENT",
      status: "PENDING",
      OR: [{ paymentId: null }, { payment: { status: { notIn: ["Unpaid", "Partially Paid"] } } }],
    },
    // Already rebooked, the clinic archived/deactivated them, the workspace is
    // no longer Pro (rebook is a Pro feature and the generator skips it, but a
    // downgrade would otherwise leave already-drafted ones sendable) — or it's
    // simply stale, since the generator drafts again next month.
    {
      kind: "REBOOK",
      status: "PENDING",
      OR: [
        { client: { appointments: { some: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: now } } } } },
        { client: { OR: [{ isArchived: true }, { status: { in: ["INACTIVE", "ARCHIVED"] } }] } },
        { business: { plan: { in: nonProPlans } } },
        { createdAt: { lt: new Date(now.getTime() - REBOOK_MAX_AGE_DAYS * DAY_MS) } },
      ],
    },
    {
      kind: "THANK_YOU",
      status: "PENDING",
      createdAt: { lt: new Date(now.getTime() - THANK_YOU_MAX_AGE_DAYS * DAY_MS) },
    },
  ];

  let expired = 0;
  for (const where of rules) {
    const { count } = await prisma.followUpDraft.updateMany({ where, data: { status: "EXPIRED" } });
    expired += count;
  }
  return expired;
}

export type FollowUpGenerationResult = {
  businessesProcessed: number;
  draftsCreated: number;
  draftsExpired: number;
  errors: number;
};

/**
 * Hourly cron job: drafts rebook / payment-reminder / thank-you follow-ups for
 * each WhatsApp-connected workspace, then retires drafts that went stale. Sends
 * nothing — a person reviews and sends from Inbox -> Follow-ups. Logs record
 * ids and counts only, never client names or draft text.
 */
export async function generateFollowUpDrafts(now: Date = new Date()): Promise<FollowUpGenerationResult> {
  const deadlineAt = Date.now() + GENERATION_BUDGET_MS;

  // Same eligibility as the reminders job: a draft for a workspace that can't
  // send WhatsApp messages would just be busywork nobody can act on.
  const businesses = await prisma.business.findMany({
    where: {
      whatsappEnabled: true,
      whatsappConnection: { is: { status: { in: ["CONNECTED", "ERRORED"] } } },
    },
    select: {
      id: true,
      plan: true,
      workflowSettings: {
        select: {
          rebookEnabled: true,
          rebookAfterMonths: true,
          paymentReminderEnabled: true,
          paymentReminderAfterDays: true,
          thankYouEnabled: true,
          thankYouDelayHours: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const totals: RunTotals = { draftsCreated: 0, errors: 0, budgetSpent: false };
  let businessesProcessed = 0;

  for (const business of businesses) {
    if (Date.now() > deadlineAt) {
      totals.budgetSpent = true;
    }
    // Also set from inside writeDrafts when the budget runs out mid-batch.
    if (totals.budgetSpent) {
      break;
    }

    businessesProcessed += 1;
    try {
      await generateForBusiness(business, now, totals, deadlineAt);
    } catch (error) {
      // One business failing must never stop the rest.
      totals.errors += 1;
      logger.error("Follow-up draft generation failed for a business.", error, { businessId: business.id });
    }
  }

  if (totals.budgetSpent) {
    logger.warn("Follow-up draft generation stopped early — time budget spent; the next run continues.", {
      businessesProcessed,
      businessesTotal: businesses.length,
    });
  }

  // After the loop and independent of it: a failed business, or a failure in
  // one sweep, must not stop the drafts from being retired.
  let draftsExpired = 0;
  try {
    draftsExpired += await expireStaleFollowUpDrafts(now);
  } catch (error) {
    totals.errors += 1;
    logger.error("Expiring stale follow-up drafts failed.", error);
  }
  try {
    draftsExpired += (await expirePastSlotOffers(undefined, now)).expired;
  } catch (error) {
    totals.errors += 1;
    logger.error("Expiring past slot offers failed.", error);
  }

  return { businessesProcessed, draftsCreated: totals.draftsCreated, draftsExpired, errors: totals.errors };
}
