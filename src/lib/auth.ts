import { redirect } from "next/navigation";
import { cache } from "react";

import type { User } from "@supabase/supabase-js";

import { createClient } from "@/utils/supabase/server";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();

  // Verify the session JWT locally against the cached JWKS (this project signs
  // tokens with an asymmetric ES256 key) instead of round-tripping to the Auth
  // server on every render. The JWKS cache is process-global, so on a warm
  // instance this needs no network call. The proxy already validates + refreshes
  // the session on each protected navigation, so the cookie is fresh here.
  //
  // Safe because every consumer of this helper (workspace context, settings /
  // onboarding actions, search routes) reads only id / email / user_metadata —
  // all carried by the token. The email-confirmation gate lives in the proxy and
  // the onboarding pages, which call getUser() directly, never through here, so
  // the token's lack of `email_confirmed_at` doesn't matter. Fall back to
  // getUser() if claims are unavailable.
  //
  // getClaims() only maps AuthErrors to `{ error }`; a JWKS-fetch failure,
  // expired/invalid token, or crypto error is THROWN. getUser() never throws, so
  // the try/catch preserves the graceful "session expired → null → re-login"
  // contract instead of surfacing a 500.
  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;

    if (!error && claims && typeof claims.sub === "string") {
      const user: User = {
        id: claims.sub,
        aud: typeof claims.aud === "string" ? claims.aud : "authenticated",
        app_metadata: claims.app_metadata ?? {},
        user_metadata: claims.user_metadata ?? {},
        created_at: "",
      };
      if (typeof claims.email === "string") {
        user.email = claims.email;
      }
      if (typeof claims.role === "string") {
        user.role = claims.role;
      }
      return user;
    }
  } catch {
    // fall through to getUser()
  }

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
