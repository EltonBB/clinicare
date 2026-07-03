type NormalizeConfiguredAppUrlInput = {
  configuredUrl?: string | null;
  nodeEnv?: string;
};

function isProduction(nodeEnv: string | undefined = process.env.NODE_ENV) {
  return nodeEnv === "production";
}

export function normalizeConfiguredAppUrl({
  configuredUrl,
  nodeEnv = process.env.NODE_ENV,
}: NormalizeConfiguredAppUrlInput) {
  const trimmed = configuredUrl?.trim().replace(/\/$/, "") ?? "";

  if (!trimmed) {
    if (isProduction(nodeEnv)) {
      throw new Error("APP_URL must be configured in production.");
    }

    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("APP_URL must be an absolute URL.");
  }

  if (isProduction(nodeEnv) && parsed.protocol !== "https:") {
    throw new Error("APP_URL must use https in production.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("APP_URL must use http or https.");
  }

  return parsed.toString().replace(/\/$/, "");
}

export function buildAuthConfirmUrl(baseUrl: string, nextPath: string) {
  const redirect = new URL("/auth/confirm", baseUrl);
  redirect.searchParams.set("next", nextPath);
  return redirect;
}

// --- Email-confirmation link policy ----------------------------------------
// Token links are verified by an explicit user action, never a bare GET (see
// src/app/auth/confirm/route.ts for why). These are shared by the confirm
// route, both continuation pages, and the Server Actions that do the actual
// verification, so the allowlist, continuation targets, and error
// destinations cannot drift apart across files.

// Deliberately a plain Set<string> (not the provider's EmailOtpType) and
// deliberately EXCLUDING "recovery": recovery has its own continuation page
// and its own action that hardcodes the type and sets the privileged
// password-reset cookie. It must stay excluded here even if the provider's
// type union grows a new variant.
export const CONFIRMABLE_EMAIL_OTP_TYPES = new Set([
  "signup",
  "invite",
  "magiclink",
  "email_change",
  "email",
]);

export const INVALID_CONFIRM_LINK_REDIRECT =
  "/confirm-email?error=" +
  encodeURIComponent("That verification link is no longer valid. Request a new one below.");

export const RECOVERY_EXPIRED_REDIRECT = "/forgot-password?expired=1";

// Continuation page a bare GET forwards a token_hash link to. Routing
// recovery here — instead of via branch order at each call site — keeps the
// "recovery never reaches the generic confirm action" invariant structural.
export function authConfirmContinuationPath(tokenHash: string, type: string) {
  const query = new URLSearchParams({ token_hash: tokenHash, type }).toString();
  return type === "recovery"
    ? `/reset-password/confirm?${query}`
    : `/auth/confirm/continue?${query}`;
}
