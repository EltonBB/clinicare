import { redirect } from "next/navigation";

import {
  authConfirmContinuationPath,
  INVALID_CONFIRM_LINK_REDIRECT,
  RECOVERY_EXPIRED_REDIRECT,
} from "@/lib/app-url-policy";
import { markEmailVerificationReceiptVerifiedByEmail } from "@/lib/email-verification-receipts";
import { createClient } from "@/utils/supabase/server";

/**
 * Email-confirmation handler.
 *
 * Every token_hash-based link (signup, invite, magic link, email change,
 * password recovery) is single-use and high-value. Email security scanners
 * (Microsoft Defender Safe Links, corporate mail gateways, some spam filters)
 * prefetch links inside incoming email automatically — verifying (which
 * CONSUMES the token) on a bare GET burns it before the real user ever
 * clicks, so the link then "expires" instantly, every time. This is a
 * documented Supabase Auth limitation with a documented fix: this GET never
 * calls verifyOtp — it only redirects, deferring the actual verification to
 * an explicit, scanner-unreachable user action (a real button click,
 * submitted as a POST) on a continuation page (see
 * authConfirmContinuationPath):
 *   - password recovery  → /reset-password/confirm, whose action hardcodes
 *     type: "recovery" as a literal (never a URL-supplied value) before
 *     calling verifyOtp, then binds the vela_pw_recovery cookie to THAT
 *     call's own verified user id
 *   - everything else    → /auth/confirm/continue, whose action restricts
 *     the URL-supplied type to CONFIRMABLE_EMAIL_OTP_TYPES, a fixed
 *     allowlist that excludes "recovery"
 * so the "never route on a raw, unverified type" property this route
 * previously enforced inline still holds — it now holds inside the Server
 * Actions instead. Neither continuation page calls verifyOtp on render, only
 * on form submit, so a scanner GET-ing either URL is inert.
 *
 * A token_hash link only reaches this route when its Supabase email template
 * links here directly ({{ .TokenHash }}). Reset Password and Confirm signup
 * do; templates still on the default {{ .ConfirmationURL }} (Change Email
 * Address today) verify at the provider's own endpoint first and arrive here
 * as the legacy `?code=` callback below instead — update those templates to
 * the token_hash form to bring them onto the prefetch-safe path.
 *
 * The legacy `?code=` callback is handled here directly (unchanged) — it's
 * inherently prefetch-resistant already: exchanging it requires the PKCE
 * code_verifier cookie bound to the browser that INITIATED the flow, so a
 * scanner's isolated fetch (no matching cookie) fails harmlessly instead of
 * silently burning the code for the real user. A code carries no verified
 * intent either way, so it stays confirmation-only: sign out, land on login.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");

  if (tokenHash && type) {
    redirect(authConfirmContinuationPath(tokenHash, type));
  }

  // A recovery link that lost its token (truncated or rewritten in transit)
  // gets the recovery re-request page — not the signup-flavored resend page
  // the generic invalid-link fallback below points at.
  if (type === "recovery") {
    redirect(RECOVERY_EXPIRED_REDIRECT);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      redirect(INVALID_CONFIRM_LINK_REDIRECT);
    }

    // The code is already consumed and the account confirmed by this point,
    // so a transient receipt-write or sign-out failure must never block the
    // redirect — otherwise the user 500s on a one-time link they can no
    // longer reuse. allSettled swallows both failures AND still attempts the
    // sign-out when the receipt write fails (a try block would skip it).
    // The two calls are independent (Prisma-by-email vs auth), so they run
    // concurrently. (redirect() throws NEXT_REDIRECT, so it stays outside.)
    await Promise.allSettled([
      markEmailVerificationReceiptVerifiedByEmail(data.user?.email ?? null),
      supabase.auth.signOut(),
    ]);
    redirect("/login?verified=1");
  }

  redirect(INVALID_CONFIRM_LINK_REDIRECT);
}
