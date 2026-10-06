import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/clients/abc?tab=payments#history", "/clients/abc?tab=payments#history"],
    ["/onboarding/complete", "/onboarding/complete"],
  ])("keeps the same-origin path %s", (next, expected) => {
    expect(safeRedirectPath(next)).toBe(expected);
  });

  // A browser opens each of these on another site.
  it.each([
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r\n/evil.com",
    "/\t\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
  ])("refuses %j", (next) => {
    expect(safeRedirectPath(next)).toBe("/dashboard");
  });

  it("falls back for a missing value, with a custom fallback when given", () => {
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath("", "/onboarding")).toBe("/onboarding");
  });
});
