"use server";

import { canUseWorkspace } from "@/lib/billing-access";
import { getAuthedBusiness } from "@/lib/business";

/**
 * Whether the signed-in clinic's subscription has landed (Paddle's signed
 * webhook writes it; the browser returning from checkout proves nothing).
 * Polled by /checkout/success. Read-only, background budget.
 */
export async function checkoutReadyAction(): Promise<{ ready: boolean }> {
  const context = await getAuthedBusiness(undefined, { budget: "background" });
  if ("error" in context) return { ready: false };
  return { ready: canUseWorkspace(context.business) };
}
