import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { proTrialOfferOpensAt } from "@/lib/pro-trial";

/** Paying for Basic right now, as `proTrialState` reads it (`subscribedPlan` is missing on older clinics). */
function paysForBasic(now: Date): Prisma.BusinessWhereInput {
  return {
    billingMode: "SUBSCRIPTION",
    subscriptionStatus: "ACTIVE",
    AND: [
      { OR: [{ subscribedPlan: "BASIC" }, { subscribedPlan: null, plan: "BASIC" }] },
      { OR: [{ cancelAt: null }, { cancelAt: { lte: now } }] },
    ],
  };
}

/**
 * Runs the free Pro trial's 30-day clock (owner decision, 2026-11-09: offered
 * once a clinic has paid for Basic for 30 days). The first hourly run that sees
 * a clinic paying for Basic sets when its offer opens; a clock that hasn't run
 * out restarts if the clinic stops paying for Basic first (moves to Pro,
 * schedules a cancel, a payment fails). So a clinic that paid for Pro, then
 * dropped to Basic, waits its 30 days of Basic like everyone else. Run by the
 * hourly billing cron.
 */
export async function scheduleProTrialOffers(now: Date = new Date()): Promise<{ opened: number; reset: number }> {
  const reset = await prisma.business.updateMany({
    where: { proTrialStartedAt: null, proTrialOfferedAt: { gt: now }, NOT: paysForBasic(now) },
    data: { proTrialOfferedAt: null },
  });
  const opened = await prisma.business.updateMany({
    where: { ...paysForBasic(now), proTrialStartedAt: null, proTrialOfferedAt: null },
    data: { proTrialOfferedAt: proTrialOfferOpensAt(now) },
  });
  return { opened: opened.count, reset: reset.count };
}

/**
 * Returns clinics whose free Pro trial has run out, without them
 * choosing, to the plan Paddle bills (Basic). Run by the hourly billing cron.
 */
export async function endExpiredProTrials(now: Date = new Date()): Promise<number> {
  const ended = await prisma.business.updateMany({
    where: {
      // A clinic the owner has since made free keeps the plan it was given.
      billingMode: "SUBSCRIPTION",
      proTrialEndsAt: { lte: now },
      proTrialStartedAt: { not: null },
      plan: "PRO",
      subscribedPlan: "BASIC",
    },
    data: { plan: "BASIC" },
  });
  return ended.count;
}
