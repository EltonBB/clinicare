import { describe, expect, it } from "vitest";

import {
  authConfirmContinuationPath,
  buildAuthConfirmUrl,
  CONFIRMABLE_EMAIL_OTP_TYPES,
  normalizeConfiguredAppUrl,
} from "./app-url-policy";

describe("normalizeConfiguredAppUrl", () => {
  it("returns null for an empty value outside production", () => {
    expect(
      normalizeConfiguredAppUrl({ configuredUrl: "", nodeEnv: "development" })
    ).toBeNull();
  });

  it("throws for an empty value in production", () => {
    expect(() =>
      normalizeConfiguredAppUrl({ configuredUrl: "", nodeEnv: "production" })
    ).toThrow(/APP_URL/);
  });

  it("rejects http in production and strips a trailing slash otherwise", () => {
    expect(() =>
      normalizeConfiguredAppUrl({ configuredUrl: "http://vela.app", nodeEnv: "production" })
    ).toThrow(/https/);
    expect(
      normalizeConfiguredAppUrl({ configuredUrl: "http://localhost:3000/", nodeEnv: "development" })
    ).toBe("http://localhost:3000");
  });
});

describe("buildAuthConfirmUrl", () => {
  it("targets /auth/confirm with the next path as a query param", () => {
    const url = buildAuthConfirmUrl("https://vela.app", "/reset-password");
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("next")).toBe("/reset-password");
  });
});

describe("CONFIRMABLE_EMAIL_OTP_TYPES", () => {
  it("never includes recovery — it has its own hardcoded-type action", () => {
    expect(CONFIRMABLE_EMAIL_OTP_TYPES.has("recovery")).toBe(false);
  });

  it("covers the generic confirmable types", () => {
    for (const type of ["signup", "invite", "magiclink", "email_change", "email"]) {
      expect(CONFIRMABLE_EMAIL_OTP_TYPES.has(type)).toBe(true);
    }
  });
});

describe("authConfirmContinuationPath", () => {
  it("routes recovery to its own continuation page", () => {
    expect(authConfirmContinuationPath("abc123", "recovery")).toBe(
      "/reset-password/confirm?token_hash=abc123&type=recovery"
    );
  });

  it("routes every non-recovery type to the generic continue page", () => {
    expect(authConfirmContinuationPath("abc123", "signup")).toBe(
      "/auth/confirm/continue?token_hash=abc123&type=signup"
    );
    expect(authConfirmContinuationPath("abc123", "email_change")).toBe(
      "/auth/confirm/continue?token_hash=abc123&type=email_change"
    );
  });

  it("URL-encodes the forwarded token so it round-trips through searchParams", () => {
    const path = authConfirmContinuationPath("a+b/c=d&e", "signup");
    const query = new URLSearchParams(path.split("?")[1]);
    expect(query.get("token_hash")).toBe("a+b/c=d&e");
    expect(query.get("type")).toBe("signup");
  });
});
