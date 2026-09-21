import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appointmentFindMany: vi.fn(),
  scheduleBlockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: { findMany: mocks.appointmentFindMany },
    scheduleBlock: { findMany: mocks.scheduleBlockFindMany },
  },
}));

import { loadCalendarMonth, loadCalendarMonthRecords } from "@/lib/calendar-data";
import { getZonedDayWindowFromParts, zonedDateTimeToUtc } from "@/lib/time-zone";

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt_1",
    businessId: "biz_1",
    clientId: "client_1",
    staffMemberId: "staff_1",
    title: "Cleaning",
    startAt: new Date("2026-09-15T07:00:00.000Z"),
    endAt: new Date("2026-09-15T07:30:00.000Z"),
    notes: null,
    status: "COMPLETED",
    client: { id: "client_1", name: "Ada Lovelace" },
    staffMember: { id: "staff_1", name: "Dr. Kim" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appointmentFindMany.mockResolvedValue([]);
  mocks.scheduleBlockFindMany.mockResolvedValue([]);
});

describe("loadCalendarMonthRecords", () => {
  it("does not query for an invalid month key", async () => {
    expect(await loadCalendarMonthRecords({ businessId: "biz_1", monthKey: "2026-13" })).toBeNull();
    expect(mocks.appointmentFindMany).not.toHaveBeenCalled();
    expect(mocks.scheduleBlockFindMany).not.toHaveBeenCalled();
  });

  it("loads every status — completed visits are part of the calendar", async () => {
    await loadCalendarMonthRecords({ businessId: "biz_1", monthKey: "2026-09" });

    const query = mocks.appointmentFindMany.mock.calls[0][0];

    // No status filter at all: a `status: { not: "COMPLETED" }` here is exactly
    // what once hid every past visit from the calendar.
    expect(query.where).not.toHaveProperty("status");
    expect(query.where.businessId).toBe("biz_1");
  });

  it("covers the month's Monday-to-Sunday grid in the clinic's zone, bounded", async () => {
    const records = await loadCalendarMonthRecords({ businessId: "biz_1", monthKey: "2026-09" });

    // September 2026 draws Mon Aug 31 through Sun Oct 4.
    expect(records?.range).toEqual({ from: "2026-08-31", to: "2026-10-04" });

    const query = mocks.appointmentFindMany.mock.calls[0][0];

    expect(query.where.startAt.gte).toEqual(zonedDateTimeToUtc({ year: 2026, month: 8, day: 31 }));
    expect(query.where.startAt.lte).toEqual(getZonedDayWindowFromParts(2026, 10, 4).end);
    expect(query.take).toBe(3000);
    expect(query.orderBy).toEqual({ startAt: "asc" });
  });

  it("finds schedule blocks by interval overlap, not by start", async () => {
    await loadCalendarMonthRecords({ businessId: "biz_1", monthKey: "2026-09" });

    const query = mocks.scheduleBlockFindMany.mock.calls[0][0];

    expect(query.where.startsAt).toHaveProperty("lte");
    expect(query.where.endsAt).toHaveProperty("gte");
  });
});

describe("loadCalendarMonth", () => {
  it("returns null for an invalid month key", async () => {
    expect(await loadCalendarMonth({ businessId: "biz_1", monthKey: "nope", ownerName: "Owner" })).toBeNull();
  });

  it("shapes rows for the client, completed status included", async () => {
    mocks.appointmentFindMany.mockResolvedValue([
      appointmentRow(),
      appointmentRow({ id: "appt_2", status: "CANCELLED", staffMemberId: null, staffMember: null }),
    ]);

    const month = await loadCalendarMonth({
      businessId: "biz_1",
      monthKey: "2026-09",
      ownerName: "Owner Name",
    });

    expect(month?.appointments).toHaveLength(2);
    expect(month?.appointments[0]).toMatchObject({
      id: "appt_1",
      clientName: "Ada Lovelace",
      staffName: "Dr. Kim",
      service: "Cleaning",
      status: "completed",
    });
    // No staff member → falls back to the owner's name, like the page's first load.
    expect(month?.appointments[1]).toMatchObject({ status: "cancelled", staffName: "Owner Name" });
    expect(month?.range).toEqual({ from: "2026-08-31", to: "2026-10-04" });
  });
});
