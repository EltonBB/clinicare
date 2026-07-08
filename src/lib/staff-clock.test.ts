import { describe, expect, it } from "vitest";

import { CHECK_IN_EARLY_GRACE_MS } from "./staff";
import { planStaleEntryCloses } from "./staff-clock";

// Mirrors the module-private cap in staff-clock.ts (a documented product value).
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function entry(
  id: string,
  checkedInAt: string,
  opts: { businessId?: string; staffMemberId?: string } = {}
) {
  return {
    id,
    businessId: opts.businessId ?? "biz",
    staffMemberId: opts.staffMemberId ?? "staff",
    checkedInAt: new Date(checkedInAt),
  };
}

function shift(
  startsAt: string,
  endsAt: string,
  opts: { businessId?: string; staffMemberId?: string } = {}
) {
  return {
    businessId: opts.businessId ?? "biz",
    staffMemberId: opts.staffMemberId ?? "staff",
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  };
}

describe("planStaleEntryCloses", () => {
  it("closes an entry under a covering shift at the shift end", () => {
    const shiftEnd = "2026-01-01T17:00:00Z";
    const plan = planStaleEntryCloses(
      [entry("e1", "2026-01-01T09:00:00Z")],
      [shift("2026-01-01T09:00:00Z", shiftEnd)],
      new Date("2026-01-01T18:00:00Z") // past the shift end
    );
    expect(plan.get(new Date(shiftEnd).getTime())).toEqual(["e1"]);
  });

  it("closes an entry with no covering shift at the 12-hour cap", () => {
    const checkedIn = "2026-01-01T09:00:00Z";
    const plan = planStaleEntryCloses(
      [entry("e1", checkedIn)],
      [],
      new Date("2026-01-02T00:00:00Z") // > 12h after check-in
    );
    expect(plan.get(new Date(checkedIn).getTime() + TWELVE_HOURS_MS)).toEqual(["e1"]);
  });

  it("leaves an entry still within its boundary open", () => {
    const plan = planStaleEntryCloses(
      [entry("e1", "2026-01-01T09:00:00Z")],
      [shift("2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z")],
      new Date("2026-01-01T12:00:00Z") // before the shift end
    );
    expect(plan.size).toBe(0);
  });

  it("groups entries that close at the same instant into one updateMany group", () => {
    const shiftEnd = "2026-01-01T17:00:00Z";
    const plan = planStaleEntryCloses(
      [
        entry("e1", "2026-01-01T09:00:00Z", { staffMemberId: "s1" }),
        entry("e2", "2026-01-01T09:30:00Z", { staffMemberId: "s2" }),
      ],
      [
        shift("2026-01-01T09:00:00Z", shiftEnd, { staffMemberId: "s1" }),
        shift("2026-01-01T09:00:00Z", shiftEnd, { staffMemberId: "s2" }),
      ],
      new Date("2026-01-01T18:00:00Z")
    );
    expect(plan.size).toBe(1);
    expect(plan.get(new Date(shiftEnd).getTime())?.sort()).toEqual(["e1", "e2"]);
  });

  it("picks the earliest-ending covering shift", () => {
    const earlyEnd = "2026-01-01T13:00:00Z";
    const plan = planStaleEntryCloses(
      [entry("e1", "2026-01-01T09:00:00Z")],
      [
        shift("2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z"),
        shift("2026-01-01T09:00:00Z", earlyEnd),
      ],
      new Date("2026-01-01T18:00:00Z")
    );
    expect(plan.get(new Date(earlyEnd).getTime())).toEqual(["e1"]);
    expect(plan.get(new Date("2026-01-01T17:00:00Z").getTime())).toBeUndefined();
  });

  it("does not match a shift from another business (falls through to the cap)", () => {
    const checkedIn = "2026-01-01T09:00:00Z";
    const plan = planStaleEntryCloses(
      [entry("e1", checkedIn, { businessId: "biz1", staffMemberId: "s1" })],
      // Same staffMemberId, but a different business — must not match.
      [
        shift("2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z", {
          businessId: "biz2",
          staffMemberId: "s1",
        }),
      ],
      new Date("2026-01-01T22:00:00Z") // past the 12h cap (21:00)
    );
    expect(plan.get(new Date(checkedIn).getTime() + TWELVE_HOURS_MS)).toEqual(["e1"]);
  });

  it("honors the early-grace window when a shift starts after the check-in", () => {
    const checkedInMs = new Date("2026-01-01T09:00:00Z").getTime();
    const shiftEnd = "2026-01-01T17:00:00Z";
    const now = new Date("2026-01-01T22:00:00Z"); // past both the shift end and the cap

    // A shift starting exactly at the edge of the grace window still covers.
    const withinGrace = planStaleEntryCloses(
      [entry("e1", "2026-01-01T09:00:00Z")],
      [shift(new Date(checkedInMs + CHECK_IN_EARLY_GRACE_MS).toISOString(), shiftEnd)],
      now
    );
    expect(withinGrace.get(new Date(shiftEnd).getTime())).toEqual(["e1"]);

    // One millisecond past the grace window does not cover → falls to the cap.
    const pastGrace = planStaleEntryCloses(
      [entry("e1", "2026-01-01T09:00:00Z")],
      [shift(new Date(checkedInMs + CHECK_IN_EARLY_GRACE_MS + 1).toISOString(), shiftEnd)],
      now
    );
    expect(pastGrace.get(checkedInMs + TWELVE_HOURS_MS)).toEqual(["e1"]);
  });
});
