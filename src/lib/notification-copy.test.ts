import { describe, expect, it } from "vitest";

import { checkinDetail } from "@/lib/notification-copy";

// Times below are UTC and picked so the clinic-zone (Europe/Budapest,
// UTC+2 in July) local time lands well clear of any midnight boundary,
// keeping each case unambiguous about which local day it falls on.
describe("checkinDetail", () => {
  it("omits a day qualifier for a check-in from today", () => {
    const now = new Date("2026-07-07T12:00:00.000Z"); // 2:00 PM local
    const checkedInAt = new Date("2026-07-07T07:00:00.000Z"); // 9:00 AM local, same day
    expect(checkinDetail(checkedInAt, now)).toBe(
      "Checked in at 9:00 AM — verify they're in."
    );
  });

  it("says yesterday for a check-in from the previous day", () => {
    const now = new Date("2026-07-07T12:00:00.000Z"); // Jul 7, 2:00 PM local
    const checkedInAt = new Date("2026-07-06T19:52:00.000Z"); // Jul 6, 9:52 PM local
    expect(checkinDetail(checkedInAt, now)).toBe(
      "Checked in yesterday at 9:52 PM — verify they're in."
    );
  });

  it("uses a short date with no year for an older check-in in the same year", () => {
    const now = new Date("2026-07-07T12:00:00.000Z"); // Jul 7, 2026 local
    const checkedInAt = new Date("2026-06-28T07:00:00.000Z"); // Jun 28, 2026, 9:00 AM local
    expect(checkinDetail(checkedInAt, now)).toBe(
      "Checked in Jun 28 at 9:00 AM — verify they're in."
    );
  });

  it("appends the year for a check-in from a different year", () => {
    const now = new Date("2026-07-07T12:00:00.000Z"); // 2026 local
    const checkedInAt = new Date("2025-07-06T07:00:00.000Z"); // 2025, Jul 6, 9:00 AM local
    expect(checkinDetail(checkedInAt, now)).toBe(
      "Checked in Jul 6, 2025 at 9:00 AM — verify they're in."
    );
  });
});
