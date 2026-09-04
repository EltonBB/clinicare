import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHECK_IN_EARLY_GRACE_MS,
  buildStaffDirectoryRecord,
  buildStaffViewFromRecords,
  completedAppointmentCutoff,
  findActiveShiftWindow,
} from "@/lib/staff";

// StaffDirectoryWithRelations isn't exported — infer the shape from the
// function signature instead of importing an internal type.
function fakeStaffMember(
  overrides: Partial<Parameters<typeof buildStaffDirectoryRecord>[0]> = {}
): Parameters<typeof buildStaffDirectoryRecord>[0] {
  return {
    id: "staff-1",
    businessId: "biz-1",
    name: "Dr. Test",
    role: "Specialist",
    email: null,
    phone: null,
    profileNote: null,
    status: "ACTIVE",
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    shifts: [],
    timeEntries: [],
    ...overrides,
  };
}

describe("findActiveShiftWindow", () => {
  // A 09:00–17:00 shift on a fixed day; `now` is injected so the test is
  // timezone- and wall-clock-independent.
  const shift = {
    startsAt: new Date("2026-06-30T09:00:00.000Z"),
    endsAt: new Date("2026-06-30T17:00:00.000Z"),
  };

  it("matches inside the shift", () => {
    expect(findActiveShiftWindow([shift], new Date("2026-06-30T12:00:00.000Z"))).toBe(shift);
  });

  it("matches within the 30-min early grace before start", () => {
    const justInside = new Date(shift.startsAt.getTime() - CHECK_IN_EARLY_GRACE_MS + 1);
    expect(findActiveShiftWindow([shift], justInside)).toBe(shift);
  });

  it("rejects before the grace window opens", () => {
    const tooEarly = new Date(shift.startsAt.getTime() - CHECK_IN_EARLY_GRACE_MS - 1);
    expect(findActiveShiftWindow([shift], tooEarly)).toBeUndefined();
  });

  it("rejects after the shift ends — the 10pm bug", () => {
    expect(findActiveShiftWindow([shift], new Date("2026-06-30T22:00:00.000Z"))).toBeUndefined();
  });

  it("matches exactly at the end boundary, rejects one ms past it", () => {
    expect(findActiveShiftWindow([shift], shift.endsAt)).toBe(shift);
    expect(
      findActiveShiftWindow([shift], new Date(shift.endsAt.getTime() + 1))
    ).toBeUndefined();
  });

  it("returns undefined when there are no shifts", () => {
    expect(findActiveShiftWindow([], new Date("2026-06-30T12:00:00.000Z"))).toBeUndefined();
  });

  it("picks the covering shift among several", () => {
    const morning = {
      startsAt: new Date("2026-06-30T08:00:00.000Z"),
      endsAt: new Date("2026-06-30T11:00:00.000Z"),
    };
    const evening = {
      startsAt: new Date("2026-06-30T18:00:00.000Z"),
      endsAt: new Date("2026-06-30T22:00:00.000Z"),
    };
    expect(
      findActiveShiftWindow([morning, evening], new Date("2026-06-30T19:00:00.000Z"))
    ).toBe(evening);
    expect(
      findActiveShiftWindow([morning, evening], new Date("2026-06-30T13:00:00.000Z"))
    ).toBeUndefined();
  });
});

describe("buildStaffDirectoryRecord — unreadMessages", () => {
  it("defaults to 0 when omitted", () => {
    const record = buildStaffDirectoryRecord(fakeStaffMember());
    expect(record.unreadMessages).toBe(0);
  });

  it("passes through the given count", () => {
    const record = buildStaffDirectoryRecord(fakeStaffMember(), undefined, 3);
    expect(record.unreadMessages).toBe(3);
  });
});

describe("buildStaffDirectoryRecord — hasUnseenCheckIn", () => {
  it("defaults to false when omitted", () => {
    const record = buildStaffDirectoryRecord(fakeStaffMember());
    expect(record.hasUnseenCheckIn).toBe(false);
  });

  it("passes through true when the caller has an unseen check-in", () => {
    const record = buildStaffDirectoryRecord(fakeStaffMember(), undefined, 0, true);
    expect(record.hasUnseenCheckIn).toBe(true);
  });
});

describe("buildStaffViewFromRecords — unreadMessagesByStaff", () => {
  it("gives a member present in the map their count, and one absent from it 0", () => {
    const withUnread = fakeStaffMember({ id: "staff-unread" });
    const withoutUnread = fakeStaffMember({ id: "staff-quiet" });
    const unreadMessagesByStaff = new Map([["staff-unread", 5]]);

    const view = buildStaffViewFromRecords(
      [withUnread, withoutUnread],
      undefined,
      unreadMessagesByStaff
    );

    expect(view.staff.find((member) => member.id === "staff-unread")?.unreadMessages).toBe(5);
    expect(view.staff.find((member) => member.id === "staff-quiet")?.unreadMessages).toBe(0);
  });

  it("defaults every member to 0 when no map is given", () => {
    const view = buildStaffViewFromRecords([fakeStaffMember()]);
    expect(view.staff[0].unreadMessages).toBe(0);
  });
});

describe("buildStaffViewFromRecords — unseenCheckInsByStaff", () => {
  it("gives a member present in the map hasUnseenCheckIn=true, and one absent false", () => {
    const withCheckIn = fakeStaffMember({ id: "staff-checked-in" });
    const withoutCheckIn = fakeStaffMember({ id: "staff-quiet" });
    const unseenCheckInsByStaff = new Map([["staff-checked-in", 2]]);

    const view = buildStaffViewFromRecords(
      [withCheckIn, withoutCheckIn],
      undefined,
      undefined,
      unseenCheckInsByStaff
    );

    expect(view.staff.find((member) => member.id === "staff-checked-in")?.hasUnseenCheckIn).toBe(
      true
    );
    expect(view.staff.find((member) => member.id === "staff-quiet")?.hasUnseenCheckIn).toBe(false);
  });

  it("defaults every member to false when no map is given", () => {
    const view = buildStaffViewFromRecords([fakeStaffMember()]);
    expect(view.staff[0].hasUnseenCheckIn).toBe(false);
  });
});

describe("completedAppointmentCutoff", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the clinic's zoned month start, not the server process's local timezone", () => {
    // 2026-06-01T00:30:00Z is already 02:30 on June 1st in Europe/Budapest
    // (UTC+2, CEST). A server-local-zone `new Date(now.getFullYear(),
    // now.getMonth(), 1)` running with TZ=UTC would read the UTC month
    // (May) here and return May 1st instead — a whole month off.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:30:00.000Z"));

    expect(completedAppointmentCutoff().toISOString()).toBe("2026-05-31T22:00:00.000Z");
  });
});
