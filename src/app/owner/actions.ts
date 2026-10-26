"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { USABLE_SUBSCRIPTION_STATUSES } from "@/lib/billing-access";
import { getCurrentUser } from "@/lib/auth";
import { ACTION_RATE_LIMIT_ERROR, isWithinActionBudget } from "@/lib/business";
import { logger } from "@/lib/logger";
import { isOwnerAdmin } from "@/lib/owner-admin";
import { prisma } from "@/lib/prisma";
import { recordIdSchema } from "@/lib/record-id";

export type OwnerActionResult = { ok: true } | { ok: false; error: string };

const billingChoiceSchema = z.object({
  businessId: recordIdSchema,
  // FREE_BASIC / FREE_PRO: a free account on that plan. PAYING: the clinic
  // must choose a plan and pay (it lands on /checkout).
  choice: z.enum(["FREE_BASIC", "FREE_PRO", "PAYING"]),
});

/**
 * Owner page: make a clinic a free account, or require it to pay. A clinic
 * Paddle is billing can't be made free here (its subscription would keep
 * charging): cancel it in Paddle first.
 */
export async function setClinicBillingAction(input: z.input<typeof billingChoiceSchema>): Promise<OwnerActionResult> {
  const user = await getCurrentUser();
  // Not found rather than "forbidden": the page doesn't admit it exists.
  if (!user || !isOwnerAdmin(user)) return { ok: false, error: "Not found." };
  if (!(await isWithinActionBudget(user.id))) return { ok: false, error: ACTION_RATE_LIMIT_ERROR };

  const parsed = billingChoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That choice isn't valid." };
  const { businessId, choice } = parsed.data;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, subscriptionStatus: true, lockedAt: true },
  });
  if (!business) return { ok: false, error: "That clinic no longer exists." };

  const now = new Date();
  if (choice === "PAYING") {
    const usable = (USABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(business.subscriptionStatus);
    await prisma.business.update({
      where: { id: businessId },
      data: {
        billingMode: "SUBSCRIPTION",
        // Not paying yet: it chooses a plan next, and the 90-day clock starts
        // in case it never does. A clinic Paddle already bills stays as it is.
        ...(usable ? {} : { lockedAt: business.lockedAt ?? now }),
      },
    });
  } else {
    if ((USABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(business.subscriptionStatus)) {
      return { ok: false, error: "This clinic is paying through its subscription. Cancel that first, then make it free." };
    }
    await prisma.business.update({
      where: { id: businessId },
      data: {
        billingMode: "COMPLIMENTARY",
        plan: choice === "FREE_PRO" ? "PRO" : "BASIC",
        planStatus: "ACTIVE",
        lockedAt: null,
      },
    });
  }

  logger.info("Owner changed a clinic's billing.", { businessId, choice });
  revalidatePath("/owner");
  // The clinic's own workspace (plan badge, banner, access) renders on every page.
  revalidatePath("/", "layout");
  return { ok: true };
}
