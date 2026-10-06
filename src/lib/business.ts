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
  | { error: string }
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

/**
 * Non-redirecting auth gate for server actions. Unlike {@link requireCurrentWorkspace}
 * (which redirects), this returns a typed error so the action can surface a
 * friendly message. Single choke point for the planned audit-logging hook.
 */
export async function getAuthedBusiness(
  sessionExpiredMessage = "Your session expired. Log in again to continue."
): Promise<AuthedBusinessResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { error: sessionExpiredMessage } as const;
  }

  if (!(await isWithinActionBudget(user.id))) {
    return { error: ACTION_RATE_LIMIT_ERROR } as const;
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
