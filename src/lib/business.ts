import { redirect } from "next/navigation";
import { cache } from "react";

import type { Business } from "@prisma/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

import { getCurrentUser, requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, type RateLimitRule } from "@/lib/rate-limit";

export type WorkspaceContext = {
  user: SupabaseUser;
  business: Business;
};

/**
 * Result of {@link getAuthedBusiness} — either a customer-facing error string
 * (expired session) or the resolved workspace. Discriminate with `"error" in result`.
 */
export type AuthedBusinessResult =
  // `throttled` tells an over-budget request apart from a signed-out one, so a
  // caller never sends a valid session to "log in again" (Codex #140).
  | { error: string; throttled?: true }
  | { business: Business; user: SupabaseUser };

export const getCurrentBusiness = cache(async function getCurrentBusiness(
  authUserId: string
): Promise<Business | null> {
  return prisma.business.findUnique({
    where: {
      ownerId: authUserId,
    },
  });
});

export async function requireCurrentBusiness(
  user: SupabaseUser,
  options?: {
    missingBusinessRedirect?: string;
  }
): Promise<Business> {
  const business = await getCurrentBusiness(user.id);

  if (!business) {
    redirect(options?.missingBusinessRedirect ?? "/onboarding");
  }

  return business;
}

export async function getCurrentWorkspaceContext(
  user: SupabaseUser,
  options?: {
    missingBusinessRedirect?: string;
  }
): Promise<WorkspaceContext> {
  const business = await requireCurrentBusiness(user, options);

  return {
    user,
    business,
  };
}

export async function requireCurrentWorkspace(
  nextPath = "/dashboard",
  options?: {
    missingBusinessRedirect?: string;
  }
): Promise<WorkspaceContext> {
  const user = await requireCurrentUser(nextPath);

  return getCurrentWorkspaceContext(user, options);
}

// Every server action a signed-in person can call, per user: far above what
// anyone clicking reaches, low enough that a script hammering an action is cut
// off instead of running up writes, storage and provider calls (2026-10-06 QA).
const ACTION_RATE_LIMIT: RateLimitRule = { limit: 300, windowMs: 60_000 };

export const ACTION_RATE_LIMIT_ERROR = "Too many requests right now. Wait a moment and try again.";

/** Whether this user is still within the per-user server-action budget. */
export async function isWithinActionBudget(userId: string): Promise<boolean> {
  return (await checkRateLimit(`actions:${userId}`, ACTION_RATE_LIMIT)).allowed;
}

// Calls a page fires on its own and never retries: marking something read or
// seen, cleaning up a discarded upload. Refusing one leaves an unread marker or
// an orphaned file behind, so they don't share the budget above, but they get
// their own cap so a script still can't call them without limit (Codex #140).
const BACKGROUND_ACTION_RATE_LIMIT: RateLimitRule = { limit: 120, windowMs: 60_000 };

/** Whether this user is still within the per-user background-call allowance. */
export async function isWithinBackgroundBudget(userId: string): Promise<boolean> {
  return (await checkRateLimit(`background-actions:${userId}`, BACKGROUND_ACTION_RATE_LIMIT)).allowed;
}

/**
 * Non-redirecting auth gate for server actions. Unlike {@link requireCurrentWorkspace}
 * (which redirects), this returns a typed error so the action can surface a
 * friendly message. Single choke point for the planned audit-logging hook.
 *
 * `budget: "background"` is only for a small, repeat-safe acknowledgement
 * (marking something read or seen) whose page fires it once and moves on: it
 * spends the separate background allowance instead of the shared budget.
 */
export async function getAuthedBusiness(
  sessionExpiredMessage = "Your session expired. Log in again to continue.",
  { budget = "actions" }: { budget?: "actions" | "background" } = {}
): Promise<AuthedBusinessResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { error: sessionExpiredMessage } as const;
  }

  const withinBudget = budget === "background" ? isWithinBackgroundBudget : isWithinActionBudget;
  if (!(await withinBudget(user.id))) {
    return { error: ACTION_RATE_LIMIT_ERROR, throttled: true } as const;
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  return { business, user } as const;
}

export function toBusinessIdentity(
  business: Business,
  user: SupabaseUser
): {
  businessName: string;
  ownerName: string;
} {
  const metadata = user.user_metadata ?? {};
  const ownerName =
    typeof metadata.full_name === "string" && metadata.full_name.length > 0
      ? metadata.full_name
      : user.email ?? "Workspace Owner";

  return {
    businessName: business.name,
    ownerName,
  };
}
