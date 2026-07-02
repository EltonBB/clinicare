import { describe, expect, it } from "vitest";

import { buildAuthConfirmUrl, normalizeConfiguredAppUrl } from "@/lib/app-url-policy";

describe("normalizeConfiguredAppUrl", () => {
  it("fails loudly in production without APP_URL", () => {
    expect(() =>
      normalizeConfiguredAppUrl({
        configuredUrl: "",
        nodeEnv: "production",
      })
    ).toThrow(/APP_URL/);
  });

  it("uses configured APP_URL instead of forwarded host values", () => {
    expect(
      normalizeConfiguredAppUrl({
        configuredUrl: "https://clinicare-vela.space",
        nodeEnv: "production",
      })
    ).toBe("https://clinicare-vela.space");
  });
});

describe("buildAuthConfirmUrl", () => {
  it("builds auth confirm URLs from the production APP_URL", () => {
    expect(
      buildAuthConfirmUrl("https://clinicare-vela.space", "/reset-password").toString()
    ).toBe("https://clinicare-vela.space/auth/confirm?next=%2Freset-password");
  });
});
