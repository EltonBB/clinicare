import { describe, expect, it } from "vitest";

import { billingBanner } from "./billing-banner";

const ZONE = "Europe/Budapest";

describe("billingBanner", () => {
  it("shows nothing for a usable workspace without a notice, or during a trial", () => {
    expect(billingBanner({ kind: "full", notice: null }, ZONE)).toBeNull();
    expect(billingBanner({ kind: "full", notice: { kind: "trial", endsAt: new Date("2026-11-09T12:00:00Z") } }, ZONE)).toBeNull();
    expect(billingBanner({ kind: "needs_plan" }, ZONE)).toBeNull();
  });

  it("says a locked workspace is read-only and until when its records are kept", () => {
    expect(billingBanner({ kind: "locked", keptUntil: new Date("2027-01-18T08:00:00Z") }, ZONE)).toEqual({
      tone: "locked",
      message: "This workspace is read-only because its plan has ended. Your records are kept until January 18, 2027.",
      action: "Renew plan",
    });
  });

  it("leaves the retention date out when it isn't known", () => {
    expect(billingBanner({ kind: "locked", keptUntil: null }, ZONE)?.message).toBe(
      "This workspace is read-only because its plan has ended."
    );
  });

  it("asks for a new card while a failed payment is retried", () => {
    expect(billingBanner({ kind: "full", notice: { kind: "past_due" } }, ZONE)).toMatchObject({
      tone: "warning",
      action: "Update card",
    });
  });

  it("dates a scheduled end in the clinic's zone", () => {
    // 23:30 UTC on Nov 8 is already Nov 9 in Budapest.
    expect(
      billingBanner({ kind: "full", notice: { kind: "ending", endsAt: new Date("2026-11-08T23:30:00Z") } }, ZONE)?.message
    ).toBe("Your plan ends on November 9, 2026. After that the workspace becomes read-only.");
  });
});
