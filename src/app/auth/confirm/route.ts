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
 * session, so it always showed an error.
 *
 * Every token_hash-based link (signup, invite, magic link, email change,
 * password recovery) is single-use and high-value. Email security scanners
 * (Microsoft Defender Safe Links, corporate mail gateways, some spam filters)
 * prefetch links inside incoming email automatically — verifying (which
 * CONSUMES the token) on a bare GET burns it before the real user ever
 * clicks, so the link then "expires" instantly, every time. This is a
 * documented Supabase Auth limitation with a documented fix: this GET never
 * calls verifyOtp for a token_hash link — it only redirects, deferring the
 * actual verification to an explicit, scanner-unreachable user action (a
 * real button click, submitted as a POST) on a continuation page:
 *   - password recovery  → /reset-password/confirm (sets the recovery
 *     cookie + lands on /reset-password)
 *   - everything else (signup, invite, magic link, email change)
 *                        → /auth/confirm/continue (generic: signs the
 *     confirmed session out and lands on /login?verified=1, or
 *     /settings?email_updated=1 for email_change)
 *
 * The legacy `?code=` callback is handled here directly (unchanged) — it's
 * inherently prefetch-resistant already: exchanging it requires the PKCE
 * code_verifier cookie bound to the browser that INITIATED the flow, so a
 * scanner's isolated fetch (no matching cookie) fails harmlessly instead of
 * silently burning the code for the real user.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  if (tokenHash && type === "recovery") {
    redirect(
      `/reset-password/confirm?${new URLSearchParams({ token_hash: tokenHash, type }).toString()}`
    );
  }

  if (tokenHash && type) {
    redirect(
      `/auth/confirm/continue?${new URLSearchParams({ token_hash: tokenHash, type }).toString()}`
    );
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      redirect(INVALID_LINK);
    }

    // The code is already consumed and the account confirmed by this point, so
    // a transient receipt-write or sign-out failure must never block the
    // redirect — otherwise the user 500s on a one-time link they can no
    // longer reuse. (redirect() throws NEXT_REDIRECT, so it stays outside
    // this try.)
    try {
      await markEmailVerificationReceiptVerifiedByEmail(data.user?.email ?? null);
      await supabase.auth.signOut();
    } catch {
      // best-effort cleanup; fall through to the login redirect regardless.
    }
    redirect("/login?verified=1");
  }

  redirect(INVALID_LINK);
}
