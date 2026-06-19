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

  // Route strictly by the OTP type, which Supabase binds to the token on the
  // token_hash path: a signup token cannot be replayed as type=recovery because
  // verifyOtp rejects the mismatch. The PKCE ?code= callback carries no type and
  // the code authenticates the user, not the intent — so we deliberately do NOT
  // infer recovery/settings from the caller-controlled `next` there, which would
  // otherwise let a signup link be exchanged straight into the password-reset
  // form (account takeover). Code callbacks are confirmation-only and fall
  // through to sign-out → login; recovery and email-change must therefore arrive
  // on the token_hash path (type=recovery / email_change).
  if (type === "recovery") {
    redirect("/reset-password?recovery=1");
  }

  if (type === "email_change") {
    redirect("/settings?email_updated=1");
  }

  // The token is already consumed and the account confirmed by this point, so a
  // transient receipt-write or sign-out failure must never block the redirect —
  // otherwise the user 500s on a one-time link they can no longer reuse.
  // (redirect() throws NEXT_REDIRECT, so it stays outside this try.)
  try {
    await markEmailVerificationReceiptVerifiedByEmail(confirmedEmail);
    await supabase.auth.signOut();
  } catch {
    // best-effort cleanup; fall through to the login redirect regardless.
  }
  redirect("/login?verified=1");
}
