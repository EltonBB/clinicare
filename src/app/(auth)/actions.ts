"use server";

import { type EmailOtpType } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { buildAuthRedirectUrl } from "@/lib/app-url";
import {
  CONFIRMABLE_EMAIL_OTP_TYPES,
  INVALID_CONFIRM_LINK_REDIRECT,
  RECOVERY_EXPIRED_REDIRECT,
} from "@/lib/app-url-policy";
import { sanitizeAuthMetadataForSession } from "@/lib/auth-metadata";
import {
  createEmailVerificationReceipt,
  markEmailVerificationReceiptVerifiedByEmail,
} from "@/lib/email-verification-receipts";
import {
  checkRateLimit,
  clientIpFromHeaders,
  type RateLimitRule,
} from "@/lib/rate-limit";
import { createClient } from "@/utils/supabase/server";

type FormValues = {
  email?: string;
  password?: string;
  next?: string;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

type OwnerProfileValues = {
  fullName?: string;
  email?: string;
  phone?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

type OwnerProfileFieldErrors = Partial<Record<keyof OwnerProfileValues, string>>;

type PasswordResetValues = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

type PasswordResetFieldErrors = Partial<Record<keyof PasswordResetValues, string>>;

export type AuthActionState = {
  error?: string;
  success?: string;
  fieldErrors?: FieldErrors;
  values?: FormValues;
};

export type OwnerProfileActionState = {
  error?: string;
  success?: string;
  fieldErrors?: OwnerProfileFieldErrors;
  values?: OwnerProfileValues;
};

export type PasswordResetActionState = {
  error?: string;
  success?: string;
  fieldErrors?: PasswordResetFieldErrors;
  values?: PasswordResetValues;
};

const signUpSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Enter your password."),
  next: z.string().optional(),
});

const resendSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

const ownerProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your name."),
    email: z.string().trim().email("Enter a valid email address."),
    phone: z.string().trim().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const newPassword = value.newPassword?.trim() ?? "";
    const confirmPassword = value.confirmPassword?.trim() ?? "";
    const currentPassword = value.currentPassword?.trim() ?? "";

    if (newPassword.length > 0 && newPassword.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "Password must be at least 8 characters.",
      });
    }

    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }

    if (newPassword.length > 0 && currentPassword.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentPassword"],
        message: "Enter your current password to set a new one.",
      });
    }
  });

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

function sanitizeNextPath(next?: string) {
  // Same-origin absolute paths only. Reject protocol-relative targets — both
  // "//evil.com" and the "/\evil.com" backslash variant some browsers normalize.
  if (!next || !next.startsWith("/") || next[1] === "/" || next[1] === "\\") {
    return "/dashboard";
  }

  return next;
}

const EMAIL_RATE_LIMIT_MESSAGE =
  "We're sending a lot of emails right now. Please wait a minute and try again.";

const TOO_MANY_ATTEMPTS_MESSAGE =
  "Too many attempts right now. Please wait a moment and try again.";

// Per-IP throttles: blunt credential-stuffing on login and email-send abuse on
// signup / resend / forgot-password (the latter three share the email quota).
const LOGIN_RATE_LIMIT: RateLimitRule = { limit: 12, windowMs: 60_000 };
const SIGNUP_RATE_LIMIT: RateLimitRule = { limit: 6, windowMs: 60_000 };
const EMAIL_SEND_RATE_LIMIT: RateLimitRule = { limit: 5, windowMs: 60_000 };
// Confirm-link submits are one click per email for a real user; 10/min per IP
// leaves room for double-clicks and retries while stopping token-probe loops
// from draining the auth provider's verify quota for everyone else.
const CONFIRM_ATTEMPT_RATE_LIMIT: RateLimitRule = { limit: 10, windowMs: 60_000 };

async function isWithinRateLimit(action: string, rule: RateLimitRule) {
  const ip = clientIpFromHeaders(await headers());
  return (await checkRateLimit(`${action}:${ip}`, rule)).allowed;
}

// Detects the auth provider's rate-limit responses (HTTP 429 / "…rate limit…"
// codes) without surfacing provider details. Email confirmation and password
// reset share a sending quota, so a signup burst can throttle them.
function isEmailRateLimited(
  error: { status?: number; code?: string } | null | undefined
) {
  if (!error) {
    return false;
  }

  if (error.status === 429) {
    return true;
  }

  return (error.code ?? "").toLowerCase().includes("rate");
}

export async function signUpAction(
  _: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const values = {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };

  if (!(await isWithinRateLimit("signup", SIGNUP_RATE_LIMIT))) {
    return { error: TOO_MANY_ATTEMPTS_MESSAGE, values };
  }

  const parsed = signUpSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof FormValues;
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors,
      values,
    };
  }

  const supabase = await createClient();
  const verificationTicket = crypto.randomUUID();
  const emailRedirectTo = await buildAuthRedirectUrl(
    `/login?ticket=${verificationTicket}`
  );

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    return {
      error: isEmailRateLimited(error)
        ? EMAIL_RATE_LIMIT_MESSAGE
        : "We couldn't create the account. Check the details and try again.",
      values,
    };
  }

  await createEmailVerificationReceipt(verificationTicket, parsed.data.email);

  redirect(
    `/confirm-email?email=${encodeURIComponent(parsed.data.email)}&sent=1&ticket=${verificationTicket}`
  );
}

export async function loginAction(
  _: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const values = {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? ""),
  };

  if (!(await isWithinRateLimit("login", LOGIN_RATE_LIMIT))) {
    return { error: TOO_MANY_ATTEMPTS_MESSAGE, values };
  }

  const parsed = loginSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof FormValues;
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      error: "Enter a valid email and password.",
      fieldErrors,
      values,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: "We couldn't log you in with those credentials.",
      values,
    };
  }

  if (!data.user.email_confirmed_at) {
    redirect(
      `/confirm-email?email=${encodeURIComponent(parsed.data.email)}&pending=1`
    );
  }

  redirect(sanitizeNextPath(parsed.data.next));
}

export async function resendConfirmationAction(
  _: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const values = {
    email: String(formData.get("email") ?? "").trim(),
    ticket: String(formData.get("ticket") ?? "").trim(),
  };

  if (!(await isWithinRateLimit("resend", EMAIL_SEND_RATE_LIMIT))) {
    return { error: EMAIL_RATE_LIMIT_MESSAGE, values };
  }

  const parsed = resendSchema.safeParse(values);

  if (!parsed.success) {
    return {
      error: "Enter a valid email address to resend the verification email.",
      values,
    };
  }

  const supabase = await createClient();
  const verificationTicket = values.ticket || crypto.randomUUID();
  const emailRedirectTo = await buildAuthRedirectUrl(
    `/login?ticket=${verificationTicket}`
  );

  await createEmailVerificationReceipt(verificationTicket, parsed.data.email);

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    return {
      error: isEmailRateLimited(error)
        ? EMAIL_RATE_LIMIT_MESSAGE
        : "We couldn't resend the verification email right now.",
      values,
    };
  }

  return {
    success: `A fresh verification email was sent to ${parsed.data.email}.`,
    values,
  };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(
  _: PasswordResetActionState,
  formData: FormData
): Promise<PasswordResetActionState> {
  const values = {
    email: String(formData.get("email") ?? "").trim(),
  };

  if (!(await isWithinRateLimit("forgot", EMAIL_SEND_RATE_LIMIT))) {
    return { error: EMAIL_RATE_LIMIT_MESSAGE, values };
  }

  const parsed = forgotPasswordSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: PasswordResetFieldErrors = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof PasswordResetValues;
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      error: "Enter a valid email address to continue.",
      fieldErrors,
      values,
    };
  }

  const supabase = await createClient();
  const redirectTo = await buildAuthRedirectUrl("/reset-password");
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  // Surface throttling so the user waits instead of retrying (which worsens it).
  // Any other failure still returns the generic success message on purpose —
  // it must not reveal whether an account exists for that email.
  if (isEmailRateLimited(error)) {
    return {
      error: EMAIL_RATE_LIMIT_MESSAGE,
      values,
    };
  }

  return {
    success: `A password reset link was sent to ${parsed.data.email}.`,
    values,
  };
}

export async function resetPasswordAction(
  _: PasswordResetActionState,
  formData: FormData
): Promise<PasswordResetActionState> {
  const values = {
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };

  const parsed = resetPasswordSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: PasswordResetFieldErrors = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof PasswordResetValues;
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      error: "Choose a valid new password and try again.",
      fieldErrors,
      values,
    };
  }

  const supabase = await createClient();
  const cookieStore = await cookies();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "The recovery link expired. Request a fresh password reset email.",
      values,
    };
  }

  // The password change requires a session that arrived via the password-recovery
  // verification: confirmPasswordRecoveryAction (the /reset-password/confirm
  // Continue button) sets this marker to the recovered user's id only after its
  // own hardcoded type=recovery verifyOtp succeeds. Requiring marker === user.id
  // blocks a plain login session (no marker) and a stale marker from another
  // account.
  if (cookieStore.get("vela_pw_recovery")?.value !== user.id) {
    return {
      error: "The recovery link expired. Request a fresh password reset email.",
      values,
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: "We couldn't update the password. Request a fresh recovery link and try again.",
      values,
    };
  }

  cookieStore.delete("vela_pw_recovery");
  await supabase.auth.signOut();
  redirect("/login?reset=1");
}

// Deferred-verification companion to /auth/confirm's GET redirect (see that
// route's docstring for the prefetch-safety rationale). Only this explicit,
// user-initiated submit consumes the recovery token — never a bare GET.
export async function confirmPasswordRecoveryAction(tokenHash: string): Promise<void> {
  if (!tokenHash) {
    redirect(RECOVERY_EXPIRED_REDIRECT);
  }

  // Unauthenticated + consumes a single-use token on every call: throttle like
  // the sibling auth entry points so a probe loop can't drain the provider's
  // verify quota. A throttled real user just clicks Continue again.
  if (!(await isWithinRateLimit("confirm-recovery", CONFIRM_ATTEMPT_RATE_LIMIT))) {
    redirect(RECOVERY_EXPIRED_REDIRECT);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });

  if (error || !data.user) {
    redirect(RECOVERY_EXPIRED_REDIRECT);
  }

  // Bind the privileged reset to THIS verification AND this user: the marker
  // is this call's own verified user id, never a URL-supplied value, so this
  // action can never be talked into recovering the wrong account. httpOnly +
  // short TTL, single-use (cleared on success). It rides the same redirect
  // response as the session cookie, so it's as reliable as the session itself.
  //
  // KNOWN LIMITATION (tracked for the pre-US / HIPAA hardening pass): this is an
  // unsigned cookie, so a caller who already holds this user's session can forge
  // it (the user id is derivable from the session). The user-id binding blocks
  // blind and cross-account forgery — sufficient for the non-PHI pilot — but the
  // durable fix is a one-time, server-side nonce (Prisma-backed) verified and
  // consumed on reset, landing with the audit-logging work before the US launch.
  (await cookies()).set("vela_pw_recovery", data.user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 900,
  });
  redirect("/reset-password?recovery=1");
}

// Generic deferred-verification companion to /auth/confirm's GET redirect,
// covering every token_hash type except recovery (which has its own action
// above). Restricting `type` to CONFIRMABLE_EMAIL_OTP_TYPES — the shared
// allowlist in lib/app-url-policy.ts that deliberately excludes "recovery" —
// rather than trusting whatever the URL says is what keeps this safe to call
// with a URL-sourced value: verifyOtp only ever runs with a vetted type.
export async function confirmEmailLinkAction(tokenHash: string, type: string): Promise<void> {
  if (!tokenHash || !CONFIRMABLE_EMAIL_OTP_TYPES.has(type)) {
    redirect(INVALID_CONFIRM_LINK_REDIRECT);
  }

  // Same rationale as confirmPasswordRecoveryAction's throttle above.
  if (!(await isWithinRateLimit("confirm-email-link", CONFIRM_ATTEMPT_RATE_LIMIT))) {
    redirect(INVALID_CONFIRM_LINK_REDIRECT);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  });

  if (error) {
    redirect(INVALID_CONFIRM_LINK_REDIRECT);
  }

  if (type === "email_change") {
    // The account email is shell-global identity (server-fetched in
    // (workspace)/layout.tsx and the settings account section), so the
    // completed change must invalidate the whole layout, not a page list.
    revalidatePath("/", "layout");
    redirect("/settings?email_updated=1");
  }

  // The token is already consumed and the account confirmed by this point, so
  // a transient receipt-write or sign-out failure must never block the
  // redirect — otherwise the user 500s on a one-time link they can no longer
  // reuse. allSettled swallows both failures AND still attempts the sign-out
  // when the receipt write fails (a try block would skip it). The two calls
  // are independent (Prisma-by-email vs auth), so they run concurrently.
  // (redirect() throws NEXT_REDIRECT, so it stays outside.)
  await Promise.allSettled([
    markEmailVerificationReceiptVerifiedByEmail(data.user?.email ?? null),
    supabase.auth.signOut(),
  ]);
  redirect("/login?verified=1");
}

export async function updateOwnerProfileAction(
  _: OwnerProfileActionState,
  formData: FormData
): Promise<OwnerProfileActionState> {
  const values = {
    fullName: String(formData.get("fullName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };

  const parsed = ownerProfileSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: OwnerProfileFieldErrors = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof OwnerProfileValues;
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors,
      values,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "Your session expired. Log in again to update your account.",
      values,
    };
  }

  const currentMetadata = sanitizeAuthMetadataForSession(user.user_metadata);
  const metadataPatch = {
    ...currentMetadata,
    full_name: parsed.data.fullName,
    owner_phone: parsed.data.phone || null,
  };

  const emailRedirectTo = await buildAuthRedirectUrl("/settings");
  const nextEmail = parsed.data.email;
  const newPassword = parsed.data.newPassword?.trim() ?? "";
  const emailChanged = nextEmail !== user.email;
  const passwordChanged = newPassword.length > 0;

  // Re-authenticate before changing the password: verify the CURRENT password so
  // a borrowed/hijacked session can't silently set new credentials. Done before
  // any mutation, so a wrong current password changes nothing.
  if (passwordChanged) {
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email ?? "",
      password: parsed.data.currentPassword?.trim() ?? "",
    });

    if (reauthError) {
      return {
        error: "That current password is incorrect.",
        fieldErrors: { currentPassword: "That current password is incorrect." },
        values,
      };
    }
  }

  const { error: profileError } = await supabase.auth.updateUser(
    {
      email: emailChanged ? nextEmail : undefined,
      data: metadataPatch,
    },
    emailChanged ? { emailRedirectTo } : undefined
  );

  if (profileError) {
    return {
      error: "We couldn't update the account profile right now.",
      values,
    };
  }

  if (passwordChanged) {
    const { error: passwordError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (passwordError) {
      return {
        error: "We couldn't update the password right now.",
        values,
      };
    }
  }

  // The owner's name + phone render in the app shell on every workspace route
  // (server-fetched in (workspace)/layout.tsx). Invalidate that layout so a
  // rename / phone change shows on navigation instead of staying stale until a
  // hard reload — the same Router-Cache gap the workspace mutations close.
  revalidatePath("/", "layout");

  let success = "Account updated.";
  if (emailChanged && passwordChanged) {
    success =
      "Account updated. Check your inbox to confirm the new email address.";
  } else if (emailChanged) {
    success = "Profile updated. Check your inbox to confirm the new email address.";
  } else if (passwordChanged) {
    success = "Profile updated. Your password has been changed.";
  }

  return {
    success,
    values: {
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone ?? "",
      newPassword: "",
      confirmPassword: "",
    },
  };
}
