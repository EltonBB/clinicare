import { BusinessPlan, type Prisma } from "@prisma/client";

import { FOLLOW_UP_KIND_TO_AUTOMATION } from "@/lib/automations";
import {
  AUTOMATION_SETTINGS_SELECT,
  automationSettingsFromBusiness,
  type AutomationSettingsSource,
} from "@/lib/automations-data";
import { isProBusinessPlan } from "@/lib/billing";
import { INELIGIBLE_CLIENT_WHERE } from "@/lib/client-eligibility";
import { withDeadline } from "@/lib/concurrency";
import { getFollowUpCursor, setFollowUpCursor } from "@/lib/follow-up-cursor";
import { settleInterruptedFollowUpSends } from "@/lib/follow-ups-data";
import { lastAttemptedId, rotateForFairness } from "@/lib/reminder-fairness";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { expirePastSlotOffers } from "@/lib/slot-offers";
import {
  findCheckupDueCandidates,
  findPaymentReminderCandidates,
  findRebookCandidates,
  findThankYouCandidates,
  rebookedAppointmentWhere,
  subtractDays,
  type FollowUpDraftInput,
  type WorkflowSettingsValues,
} from "@/lib/workflow-generators";

const HOUR_MS = 3_600_000;

/**
 * A candidate due longer ago than this is a backlog item (an old unpaid
 * payment, a client lapsed months ago): it is drafted for review even when its
 * automation sends on its own, so turning an automation on, connecting
 * WhatsApp or shipping a new automation never sends a burst of old messages.
 */
const AUTO_SEND_MAX_LATENESS_MS = 3 * 24 * HOUR_MS;

/**
 * Stop starting new businesses after this long. The route's maxDuration is 120s;
 * this is only a safety net at pilot scale, and the leftover businesses are
 * picked up by the next hourly run (candidates already drafted are excluded).
 * No business may run past it either (see PER_BUSINESS_TIMEOUT_MS), so the
 * cursor write and both sweeps always keep the headroom it leaves them.
 */
const GENERATION_BUDGET_MS = 90_000;

/**
 * Wall-clock cap on ONE business's generation: its pending-count query, the
 * candidate queries and the draft writes. Prisma calls have no abort handle, so
 * a stalled query would otherwise hold the awaited call — and with it the cursor
 * write and both stale-draft sweeps after the loop — until the platform killed
 * the invocation at maxDuration. The cursor would not have moved, so the next
 * hourly run would start at the same business and stall the same way (Codex
 * #130). A normal business takes a second or two; this is generous, and still
 * lets the other businesses have their turn after a hung one.
 */
const PER_BUSINESS_TIMEOUT_MS = 30_000;

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

/**
 * Most PENDING drafts one business holds per generated kind. An owner can
 * realistically review about 50 nudges; without a cap, turning a workflow on
 * would dump the whole backlog (every lapsed client, every old unpaid entry)
 * into the queue at once. The rest simply stay candidates and are drafted as
 * earlier ones are sent, skipped or expired — the generators exclude rows
 * that already have a draft, so nothing is drafted twice.
 */
const PENDING_CAP_PER_KIND = 50;

type GeneratedKind = FollowUpDraftInput["kind"];

/** This business's PENDING drafts per generated kind — one query. */
async function countPendingByKind(businessId: string): Promise<Map<GeneratedKind, number>> {
  const rows = await prisma.followUpDraft.groupBy({
    by: ["kind"],
    where: { businessId, status: "PENDING", kind: { in: ["REBOOK", "PAYMENT", "THANK_YOU", "CHECKUP_DUE"] } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.kind as GeneratedKind, row._count._all]));
}

type RunTotals = { draftsCreated: number; errors: number; abandoned: number; budgetSpent: boolean };

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
          followUpReminderId: input.followUpReminderId,
          dedupeKey: input.dedupeKey,
          body: input.body,
          autoSend: input.autoSend ?? false,
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
  business: { id: string; name?: string } & AutomationSettingsSource,
  now: Date,
  totals: RunTotals,
  deadlineAt: number
): Promise<void> {
  // On/off, timing, wording and mode come from Automations; the plan rules
  // (rebooking nudges and payment reminders are Pro) are applied there, so a
  // downgraded workspace's stored switches can't turn them back on.
  const automations = automationSettingsFromBusiness(business);
  const settings: WorkflowSettingsValues = {
    rebookEnabled: automations.REBOOK.enabled,
    rebookAfterMonths: automations.REBOOK.timing ?? 6,
    paymentReminderEnabled: automations.PAYMENT_REMINDER.enabled,
    paymentReminderAfterDays: automations.PAYMENT_REMINDER.timing ?? 3,
    thankYouEnabled: automations.THANK_YOU.enabled,
    thankYouDelayHours: automations.THANK_YOU.timing ?? 2,
  };
  const clinicName = business.name ?? "";
  const businessId = business.id;

  // Per business, because the delay is: the generator needs the scan to start
  // strictly earlier than now - delay, so a fixed global start can't be right.
  const lookbackWindowStart = new Date(now.getTime() - (settings.thankYouDelayHours + THANK_YOU_WINDOW_HOURS) * HOUR_MS);

  // async thunks so even a synchronous throw becomes a rejection for allSettled.
  const generators: Array<{ name: string; kind: GeneratedKind; run: () => Promise<FollowUpDraftInput[]> }> = [];
  // Each generator checks its own switch; the plan decides whether it runs at all.
  if (automations.REBOOK.available) {
    const message = { template: automations.REBOOK.template, clinicName };
    generators.push({
      name: "rebook",
      kind: "REBOOK",
      run: async () => findRebookCandidates({ businessId, settings, now, message }),
    });
  }
  if (automations.PAYMENT_REMINDER.available) {
    const message = { template: automations.PAYMENT_REMINDER.template, clinicName };
    generators.push({
      name: "payment reminder",
      kind: "PAYMENT",
      run: async () => findPaymentReminderCandidates({ businessId, settings, now, message }),
    });
  }
  if (automations.CHECKUP_DUE.enabled) {
    const message = { template: automations.CHECKUP_DUE.template, clinicName };
    generators.push({
      name: "check-up due",
      kind: "CHECKUP_DUE",
      run: async () => findCheckupDueCandidates({ businessId, now, message }),
    });
  }
  const thankYouMessage = { template: automations.THANK_YOU.template, clinicName };
  generators.push({
    name: "thank-you",
    kind: "THANK_YOU",
    run: async () =>
      findThankYouCandidates({ businessId, settings, now, lookbackWindowStart, message: thankYouMessage }),
  });

  // Room left under PENDING_CAP_PER_KIND; a kind already at the cap isn't queried at all.
  const pendingByKind = await countPendingByKind(businessId);
  const roomFor = (kind: GeneratedKind) => Math.max(0, PENDING_CAP_PER_KIND - (pendingByKind.get(kind) ?? 0));
  const withRoom = generators.filter((generator) => roomFor(generator.kind) > 0);

  // allSettled: one generator failing must not discard the other two's candidates.
  const settled = await Promise.allSettled(withRoom.map((generator) => generator.run()));

  const candidates: FollowUpDraftInput[] = [];
  settled.forEach((outcome, index) => {
    const generator = withRoom[index];
    if (outcome.status === "fulfilled") {
      // Generators return oldest first, so the oldest candidates get the room.
      // The mode is snapshotted on the draft: only these send without a person.
      const automatic = automations[FOLLOW_UP_KIND_TO_AUTOMATION[generator.kind]].mode === "AUTOMATIC";
      const freshSince = now.getTime() - AUTO_SEND_MAX_LATENESS_MS;
      candidates.push(
        ...outcome.value.slice(0, roomFor(generator.kind)).map(({ dueAt, ...candidate }) => ({
          ...candidate,
          autoSend: automatic && (!dueAt || dueAt.getTime() >= freshSince),
        }))
      );
      return;
    }
    totals.errors += 1;
    logger.error(`Follow-up ${generator.name} generation failed for a business.`, outcome.reason, { businessId });
  });

  await writeDrafts(businessId, candidates, totals, deadlineAt);
}

/**
 * Retires PENDING drafts that no longer make sense to send. The Follow-ups
 * list and Send already hide/refuse these live (actionablePendingWhere in
 * follow-ups-data.ts); this makes it permanent, plus the age limits. Global
 * (every workspace; the pending set is small) and one updateMany per kind.
 * SENT drafts are never touched, and slot offers have their own sweep.
 */
export async function expireStaleFollowUpDrafts(now: Date): Promise<number> {
  // "Not Pro" as billing.ts defines it, so a plan added to the enum later is
  // classified by that one helper instead of a list kept in sync here.
  const nonProPlans = Object.values(BusinessPlan).filter((plan) => !isProBusinessPlan(plan));

  const rules: Prisma.FollowUpDraftWhereInput[] = [
    // The reminder would tell someone who already paid (or whose entry was
    // deleted — paymentId is then null) that they owe money — or the clinic
    // archived/deactivated the client since, and an Inactive/Archived client
    // gets no automated outreach suggestion of any kind.
    {
      kind: "PAYMENT",
      status: "PENDING",
      OR: [
        { paymentId: null },
        { payment: { status: { notIn: ["Unpaid", "Partially Paid"] } } },
        { client: INELIGIBLE_CLIENT_WHERE },
        // Not on a downgrade: payment reminders are Pro, so a Basic workspace's
        // queued ones are hidden (automationEnabledWhere), never expired, and
        // come back for review if it upgrades while the payment is still owed.
        // Expiring them would lose the reminder for good: the generator skips
        // any payment that already has a draft.
      ],
    },
    // Already rebooked or back since (a future booking, or a recent confirmed/
    // completed visit — see rebookedAppointmentWhere), the clinic
    // archived/deactivated them, the workspace is no longer Pro (rebook is a
    // Pro feature and the generator skips it, but a downgrade would otherwise
    // leave already-drafted ones sendable) — or it's simply stale, since the
    // generator drafts again next month.
    {
      kind: "REBOOK",
      status: "PENDING",
      OR: [
        { client: { appointments: { some: rebookedAppointmentWhere(now) } } },
        { client: INELIGIBLE_CLIENT_WHERE },
        { business: { plan: { in: nonProPlans } } },
        { createdAt: { lt: subtractDays(now, REBOOK_MAX_AGE_DAYS) } },
      ],
    },
    // Too old to be worth sending — or the visit no longer stands as attended:
    // recorded as a no-show or reverted since (COMPLETED -> NO_SHOW is a
    // normal correction), or deleted (appointmentId is then null) — or the
    // clinic archived/deactivated the client since.
    {
      kind: "THANK_YOU",
      status: "PENDING",
      OR: [
        { createdAt: { lt: subtractDays(now, THANK_YOU_MAX_AGE_DAYS) } },
        { appointmentId: null },
        { appointment: { status: { not: "COMPLETED" } } },
        { client: INELIGIBLE_CLIENT_WHERE },
      ],
    },
  ];

  // The newer automations: a visit message whose visit has passed (or is
  // gone), a missed-visit message no longer about a no-show or a week old, a
  // check-up nudge to someone who has booked since or two weeks old.
  rules.push(
    {
      kind: {
        in: [
          "BOOKING_CONFIRMATION",
          "NEW_PATIENT_WELCOME",
          "VISIT_CHANGED",
          "FIRST_REMINDER",
          "SECOND_REMINDER",
          "HIGH_RISK_REMINDER",
        ],
      },
      status: "PENDING",
      OR: [{ appointmentId: null }, { appointment: { startAt: { lte: now } } }, { client: INELIGIBLE_CLIENT_WHERE }],
    },
    {
      kind: "MISSED_VISIT",
      status: "PENDING",
      OR: [
        { appointmentId: null },
        { appointment: { status: { not: "NO_SHOW" } } },
        { createdAt: { lt: subtractDays(now, 7) } },
        { client: INELIGIBLE_CLIENT_WHERE },
      ],
    },
    {
      kind: "CHECKUP_DUE",
      status: "PENDING",
      OR: [
        // Its follow-up reminder was deleted, completed or moved to a later date.
        { followUpReminderId: null },
        { followUpReminder: { OR: [{ status: { not: "Scheduled" } }, { remindAt: { gt: now } }] } },
        { client: { appointments: { some: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: now } } } } },
        { createdAt: { lt: subtractDays(now, 14) } },
        { client: INELIGIBLE_CLIENT_WHERE },
      ],
    }
  );

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
  /**
   * Businesses given up on after PER_BUSINESS_TIMEOUT_MS (also counted in
   * `errors`). Their database work cannot be cancelled and may still be running,
   * so the cron route keeps its lock held when this is non-zero.
   */
  abandonedBusinesses: number;
};

/**
 * Hourly cron job: drafts the scheduled follow-ups (rebook, payment reminder,
 * thank-you, check-up due) for each workspace with WhatsApp set up, then retires
 * drafts that went stale. Sends nothing itself: automatic ones go out through
 * the automations cron, the rest from Automations › To review. Logs record ids
 * and counts only, never client names or draft text.
 */
export async function generateFollowUpDrafts(now: Date = new Date()): Promise<FollowUpGenerationResult> {
  const deadlineAt = Date.now() + GENERATION_BUDGET_MS;

  // Every workspace with WhatsApp set up, linked right now or not: a check-up
  // date or thank-you window can pass while the link is down, and nothing
  // would draft it later (Codex). The drafts wait for the link (the automatic
  // sender needs it; one over 3 days late goes to review). A workspace that
  // never set WhatsApp up gets none: nothing could ever send them.
  const businesses = await prisma.business.findMany({
    where: { whatsappEnabled: true },
    select: {
      id: true,
      name: true,
      ...AUTOMATION_SETTINGS_SELECT,
    },
    // Stable base order; the rotation below is only meaningful if the
    // underlying order doesn't shuffle between runs.
    orderBy: { id: "asc" },
  });

  // Resume from wherever the LAST run left off, not always from the front of
  // the same ascending-id list — otherwise whichever businesses sort last
  // would lose the budget race on every single run, never actually getting
  // the "next run" the stop-early warning below promises them (Codex #130).
  const startAfterId = await getFollowUpCursor();
  const orderedBusinesses = rotateForFairness(businesses, startAfterId);

  const totals: RunTotals = { draftsCreated: 0, errors: 0, abandoned: 0, budgetSpent: false };
  let businessesProcessed = 0;

  for (const business of orderedBusinesses) {
    if (Date.now() > deadlineAt) {
      totals.budgetSpent = true;
    }
    // Also set from inside writeDrafts when the budget runs out mid-batch.
    if (totals.budgetSpent) {
      break;
    }

    businessesProcessed += 1;
    try {
      // Never longer than what is left of the run budget, so even the last
      // business can't carry the run past it. The abandoned work is left to
      // finish on its own: its writes are idempotent (dedupeKey) and writeDrafts
      // stops at the budget, and `totals` is mutated live, so drafts it already
      // created still count.
      const timeoutMs = Math.max(0, Math.min(PER_BUSINESS_TIMEOUT_MS, deadlineAt - Date.now()));
      await withDeadline(generateForBusiness(business, now, totals, deadlineAt), timeoutMs, () => {
        totals.abandoned += 1;
        totals.errors += 1;
        logger.error(
          "Follow-up draft generation exceeded its per-business timeout — likely a hung database call. Moving on so this run (and its cursor) keeps making progress, but the abandoned call may still be running.",
          undefined,
          { businessId: business.id, timeoutMs }
        );
      });
    } catch (error) {
      // One business failing must never stop the rest.
      totals.errors += 1;
      logger.error("Follow-up draft generation failed for a business.", error, { businessId: business.id });
    }
  }

  // Advance to the id of the LAST business given a turn this run (attempted,
  // whether it succeeded or threw — only a deadline-skip never got a turn) —
  // not by a fixed count over a mutable list. lastAttemptedId returns null
  // when nothing was attempted, in which case the persisted cursor is
  // deliberately left untouched so the next run resumes from the same place.
  const nextCursor = lastAttemptedId(orderedBusinesses, businessesProcessed);
  if (nextCursor !== null) {
    await setFollowUpCursor(nextCursor);
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
    await settleInterruptedFollowUpSends(now);
  } catch (error) {
    totals.errors += 1;
    logger.error("Settling interrupted follow-up sends failed.", error);
  }
  try {
    const slotOffers = await expirePastSlotOffers(undefined, now, {
      // One offer failing never stops the rest of the sweep; it is logged by id
      // (never a client's name or the offer's text) and counted below.
      onError: (error, draft) =>
        logger.error("Expiring a slot offer failed.", error, { draftId: draft.id, businessId: draft.businessId }),
    });
    draftsExpired += slotOffers.expired;
    totals.errors += slotOffers.failed;
  } catch (error) {
    totals.errors += 1;
    logger.error("Expiring past slot offers failed.", error);
  }

  return {
    businessesProcessed,
    draftsCreated: totals.draftsCreated,
    draftsExpired,
    errors: totals.errors,
    abandonedBusinesses: totals.abandoned,
  };
}
