import { type EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
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
  // The intent we ACT on must be the one the verification cryptographically
  // bound. verifyOtp validates `type` against the token_hash, so that type is
  // trustworthy; exchangeCodeForSession ignores `type` (the code authenticates
  // the user, not the intent), so a `?code=` callback yields NO verified intent
  // and is confirmation-only. We never route on the raw URL `type`/`next` —
  // only on `verifiedType`, the type the token itself proved.
  let verifiedType: EmailOtpType | null = null;
  let confirmedUserId: string | null = null;

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
    confirmedEmail = data.user?.email ?? null;
    if (ok) {
      verifiedType = type;
      confirmedUserId = data.user?.id ?? null;
    }
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    confirmedEmail = data.user?.email ?? null;
    // Intentionally no verifiedType: a code is bound to the user, not to an
    // intent, so code callbacks are confirmation-only (→ sign out → login).
  }

  if (!ok) {
    redirect(INVALID_LINK);
  }

  if (verifiedType === "recovery") {
    // Bind the privileged reset to THIS verification AND this user: the reset
    // page and resetPasswordAction require a marker whose value equals the
    // current session's user id, so neither a plain login session (no marker)
    // nor a stale marker from another account can set a new password via the
    // reset form — defense in depth even if routing ever regresses. httpOnly +
    // short TTL, single-use (cleared on success). It rides the same redirect
    // response as the session cookie, so it's as reliable as the session itself.
    //
    // KNOWN LIMITATION (tracked for the pre-US / HIPAA hardening pass): this is an
    // unsigned cookie, so a caller who already holds this user's session can forge
    // it (the user id is derivable from the session). The user-id binding blocks
    // blind and cross-account forgery — sufficient for the non-PHI pilot — but the
    // durable fix is a one-time, server-side nonce (Prisma-backed) verified and
    // consumed on reset, landing with the audit-logging work before the US launch.
    (await cookies()).set("vela_pw_recovery", confirmedUserId ?? "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 900,
    });
    redirect("/reset-password?recovery=1");
  }

  if (verifiedType === "email_change") {
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
