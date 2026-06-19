import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { markEmailVerificationReceiptVerifiedByEmail } from "@/lib/email-verification-receipts";
import { createClient } from "@/utils/supabase/server";

const INVALID_LINK =
  "/confirm-email?error=" +
  encodeURIComponent("That verification link is no longer valid. Request a new one below.");

/**
 * Email-confirmation handler. Verification runs **server-side**, where the PKCE
 * code_verifier created during the server-side sign-up actually lives — the
 * previous client-side screen could confirm the email but never hydrate the
 * session, so it always showed an error. Redirects by intent:
 *   - signup / email confirmation → /login?verified=1 (after releasing any open
 *     "check your email" tab and dropping the freshly minted session)
 *   - password recovery           → /reset-password?recovery=1
 *   - email change                → /settings?email_updated=1
 *
 * Accepts both the prefetch-safe token_hash link and a legacy ?code= callback.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "";

  const supabase = await createClient();

  let ok = false;
  let confirmedEmail: string | null = null;

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
    confirmedEmail = data.user?.email ?? null;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    confirmedEmail = data.user?.email ?? null;
  }

  if (!ok) {
    redirect(INVALID_LINK);
  }

  if (type === "recovery" || next.startsWith("/reset-password")) {
    redirect("/reset-password?recovery=1");
  }

  if (type === "email_change" || next.startsWith("/settings")) {
    redirect("/settings?email_updated=1");
  }

  await markEmailVerificationReceiptVerifiedByEmail(confirmedEmail);
  await supabase.auth.signOut();
  redirect("/login?verified=1");
}
