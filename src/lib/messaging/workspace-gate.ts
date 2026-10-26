import { canUseWorkspace } from "@/lib/billing-access";
import { prisma } from "@/lib/prisma";

/**
 * Whether the workspace may not message anyone right now: its plan has ended
 * (read-only) or it never chose one. A workspace that no longer exists is
 * treated as locked too, so a send can never outlive its clinic.
 */
export async function isWorkspaceLockedForSending(businessId: string): Promise<boolean> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { billingMode: true, subscriptionStatus: true, cancelAt: true, trialEndsAt: true, lockedAt: true },
  });
  return !business || !canUseWorkspace(business);
}
