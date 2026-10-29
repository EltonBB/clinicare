import { prisma } from "@/lib/prisma";

/**
 * Returns clinics whose owner-offered Pro trial has run out, without them
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
