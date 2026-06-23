import { redirect } from "next/navigation";
import { cache } from "react";

import type { User } from "@supabase/supabase-js";

import { createClient } from "@/utils/supabase/server";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ?? null;
});

export async function requireCurrentUser(nextPath = "/dashboard"): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return user;
}

/**
 * Persist changes to the current user's auth metadata through the auth seam, so
 * feature code never imports the Supabase client directly. Returns `{ error }`
 * as a plain boolean — callers should surface a generic message on failure.
 */
export async function updateCurrentUserMetadata(
  data: Record<string, unknown>
): Promise<{ error: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data });

  return { error: Boolean(error) };
}
