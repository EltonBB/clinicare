import { redirect } from "next/navigation";
import { cache } from "react";

import type { Business } from "@prisma/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type WorkspaceContext = {
  user: SupabaseUser;
  business: Business;
};

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
