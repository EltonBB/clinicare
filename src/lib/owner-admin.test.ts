import { describe, expect, it } from "vitest";

import { isOwnerAdmin, ownerBillingRow, type OwnerBillingSource } from "./owner-admin";

const NOW = new Date("2026-10-26T12:00:00Z");
const ZONE = "Europe/Budapest";

function row(overrides: Partial<OwnerBillingSource>): OwnerBillingSource {
  return {
    id: "biz_1",
    name: "Vela Dent",
    createdAt: new Date("2026-06-01T10:00:00Z"),
    plan: "PRO",
    billingMode: "SUBSCRIPTION",
    subscriptionStatus: "ACTIVE",
    billingInterval: "MONTH",
    currentPeriodEndsAt: new Date("2026-11-20T10:00:00Z"),
    cancelAt: null,
    trialEndsAt: null,
    lockedAt: null,
    ...overrides,
  };
}

describe("isOwnerAdmin", () => {
  const confirmed = (email: string | undefined) => ({ email, email_confirmed_at: "2026-06-01T10:00:00Z" });

  it("matches a confirmed email on the allow-list, ignoring case and spaces", () => {
    expect(isOwnerAdmin(confirmed("Owner@Example.com"), " owner@example.com , other@example.com")).toBe(true);
  });

  it("refuses anyone else, a missing email, and an empty allow-list", () => {
    expect(isOwnerAdmin(confirmed("someone@example.com"), "owner@example.com")).toBe(false);
    expect(isOwnerAdmin(confirmed(undefined), "owner@example.com")).toBe(false);
    expect(isOwnerAdmin(null, "owner@example.com")).toBe(false);
    expect(isOwnerAdmin(confirmed("owner@example.com"), "")).toBe(false);
    expect(isOwnerAdmin(confirmed("owner@example.com"), undefined)).toBe(false);
  });

  it("refuses the owner's address until it is confirmed", () => {
    expect(isOwnerAdmin({ email: "owner@example.com", email_confirmed_at: undefined }, "owner@example.com")).toBe(false);
    expect(isOwnerAdmin({ email: "owner@example.com", email_confirmed_at: null }, "owner@example.com")).toBe(false);
  });
});

describe("ownerBillingRow", () => {
  it("describes a free account", () => {
    expect(ownerBillingRow(row({ billingMode: "COMPLIMENTARY", subscriptionStatus: "NONE" }), NOW, ZONE)).toMatchObject({
      billing: "Free account",
      detail: "",
      access: "Usable",
      dueForDeletion: false,
      canMakeFree: true,
    });
  });

  it("describes a paying clinic with its next charge, and won't make it free while Paddle bills it", () => {
    expect(ownerBillingRow(row({}), NOW, ZONE)).toMatchObject({
      billing: "Paying · monthly",
      detail: "Renews November 20, 2026",
      access: "Usable",
      canMakeFree: false,
    });
  });

  it("describes a trial and a scheduled end", () => {
    expect(
      ownerBillingRow(row({ subscriptionStatus: "TRIALING", trialEndsAt: new Date("2026-11-09T12:00:00Z") }), NOW, ZONE).detail
    ).toBe("Trial until November 9, 2026");
    expect(ownerBillingRow(row({ cancelAt: new Date("2026-11-20T10:00:00Z") }), NOW, ZONE).detail).toBe(
      "Ends November 20, 2026"
    );
  });

  it("describes a clinic still choosing a plan", () => {
    expect(ownerBillingRow(row({ subscriptionStatus: "NONE", lockedAt: NOW }), NOW, ZONE)).toMatchObject({
      billing: "No plan yet",
      access: "Choosing a plan",
      canMakeFree: true,
    });
  });

  it("marks a locked clinic due for deletion only after the 90 days", () => {
    const locked = { subscriptionStatus: "CANCELED" as const };
    expect(ownerBillingRow(row({ ...locked, lockedAt: new Date("2026-09-01T00:00:00Z") }), NOW, ZONE)).toMatchObject({
      access: "Read-only, kept until November 30, 2026",
      dueForDeletion: false,
    });
    expect(ownerBillingRow(row({ ...locked, lockedAt: new Date("2026-07-01T00:00:00Z") }), NOW, ZONE)).toMatchObject({
      access: "Read-only, kept until September 29, 2026",
      dueForDeletion: true,
    });
  });
});
