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

/**
 * When this browser's session signed in (ms), from the sign-in record (`amr`)
 * in its access token, else the account's last sign-in. Only the idle
 * timeout uses it, to tell a fresh login from a reopened, abandoned session;
 * it never decides who the user is (getCurrentUser does that).
 */
export async function getSessionSignedInAt(user: User): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  let fromToken = 0;
  try {
    const payload = data.session?.access_token.split(".")[1] ?? "";
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { amr?: unknown };
    for (const entry of Array.isArray(claims.amr) ? claims.amr : []) {
      if (typeof entry?.timestamp === "number") fromToken = Math.max(fromToken, entry.timestamp * 1000);
    }
  } catch {
    // No session or an unreadable token: fall back below.
  }
  return fromToken || Date.parse(user.last_sign_in_at ?? "") || 0;
}

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
