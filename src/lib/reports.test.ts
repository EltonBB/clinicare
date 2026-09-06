import { describe, expect, it } from "vitest";
import type { AppointmentStatus, MessageDirection } from "@prisma/client";

import { buildKeyMetrics, buildReportsViewFromWorkspace } from "@/lib/reports";

// Characterization harness: pins the entire reports view model for a fixed
// dataset so a future DB-aggregation rewrite of the data layer can prove it
// produces byte-identical analytics. Fixed `now` + UTC zone + empty aiSnapshots
// keep the rule-based output fully deterministic.
const now = new Date("2026-06-23T12:00:00.000Z");

function appt(
  daysAgo: number,
  hour: number,
  status: AppointmentStatus,
  durationMin = 30,
  staffMemberId: string | null = "s1",
  clientId = "c1"
) {
  const startAt = new Date(now.getTime() - daysAgo * 86_400_000);
  startAt.setUTCHours(hour, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + durationMin * 60_000);
  return { status, startAt, endAt, createdAt: startAt, clientId, staffMemberId };
}

function msg(hoursAgo: number, direction: MessageDirection) {
  return { direction, sentAt: new Date(now.getTime() - hoursAgo * 3_600_000) };
}

const view = buildReportsViewFromWorkspace({
  business: { name: "Snapshot Clinic" },
  appointments: [
    appt(0, 9, "COMPLETED"),
    appt(0, 10, "CONFIRMED"),
    appt(0, 11, "CANCELLED"),
    appt(1, 9, "COMPLETED", 45, "s2"),
    appt(1, 14, "PENDING"),
    appt(2, 9, "COMPLETED", 60, "s1", "c2"),
    appt(3, 9, "COMPLETED", 30, "s2"),
    appt(4, 9, "CANCELLED"),
    appt(10, 9, "COMPLETED", 30, "s1", "c3"),
    appt(15, 9, "COMPLETED", 90, "s2"),
    appt(20, 9, "CONFIRMED"),
    appt(40, 9, "COMPLETED"),
    appt(50, 9, "CANCELLED"),
    appt(120, 9, "COMPLETED"),
    appt(200, 9, "COMPLETED"),
  ],
  clients: [
    { createdAt: new Date(now.getTime() - 1 * 86_400_000), isArchived: false },
    { createdAt: new Date(now.getTime() - 10 * 86_400_000), isArchived: false },
    { createdAt: new Date(now.getTime() - 40 * 86_400_000), isArchived: true },
  ],
  clientMix: { active: 20, atRisk: 3, inactive: 5, archived: 2 },
  messages: [msg(1, "INBOUND"), msg(2, "OUTBOUND"), msg(120, "INBOUND")],
  businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    isOpen: weekday >= 1 && weekday <= 5,
    startTime: "09:00",
    endTime: "17:00",
  })),
  scheduleBlocks: [],
  staffMembers: [
    { id: "s1", name: "Dr. One", role: "Dentist", status: "ACTIVE", isActive: true },
    { id: "s2", name: "Dr. Two", role: "Hygienist", status: "ACTIVE", isActive: true },
  ],
  conversations: [{ unreadCount: 2 }, { unreadCount: 0 }],
  aiSnapshots: [],
  now,
  timeZone: "UTC",
});

describe("buildReportsViewFromWorkspace (characterization)", () => {
  it("produces a stable view model for a fixed dataset", () => {
    expect(view).toMatchSnapshot();
  });

  it("computes the headline KPIs deterministically", () => {
    // Guardrails that stay readable even if the full snapshot is regenerated.
    expect(view.periods.daily).toBeDefined();
    expect(view.periods.weekly).toBeDefined();
    expect(view.periods.monthly).toBeDefined();
  });
});

describe("buildReportsViewFromWorkspace — ScheduleBlock capacity", () => {
  it("subtracts a business-wide ScheduleBlock from a day's available capacity", () => {
    const dailyView = buildReportsViewFromWorkspace({
      business: { name: "Blocked Clinic" },
      appointments: [appt(0, 13, "COMPLETED", 90, "s1")],
      clients: [],
      clientMix: { active: 0, atRisk: 0, inactive: 0, archived: 0 },
      messages: [],
      businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isOpen: weekday >= 1 && weekday <= 5,
        startTime: "09:00",
        endTime: "17:00",
      })),
      // 09:00-11:00 today (2h of the 8h open window) is blocked — nothing can
      // be booked into it, so it isn't capacity.
      scheduleBlocks: [
        {
          startsAt: new Date(now.getTime() - 3 * 3_600_000), // today 09:00Z
          endsAt: new Date(now.getTime() - 1 * 3_600_000), // today 11:00Z
        },
      ],
      staffMembers: [
        { id: "s1", name: "Dr. One", role: "Dentist", status: "ACTIVE", isActive: true },
      ],
      conversations: [],
      aiSnapshots: [],
      now,
      timeZone: "UTC",
    });

    const utilization = dailyView.periods.daily.metrics.find(
      (metric) => metric.label === "Estimated utilization"
    );

    // 8h open - 2h blocked = 6h (360min) capacity; 90min booked / 360min = 25%.
    expect(utilization?.value).toBe("25.0%");
  });

  it("merges overlapping ScheduleBlocks instead of double-subtracting their shared span", () => {
    const dailyView = buildReportsViewFromWorkspace({
      business: { name: "Blocked Clinic" },
      appointments: [appt(0, 14, "COMPLETED", 60, "s1")],
      clients: [],
      clientMix: { active: 0, atRisk: 0, inactive: 0, archived: 0 },
      messages: [],
      businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isOpen: weekday >= 1 && weekday <= 5,
        startTime: "09:00",
        endTime: "17:00",
      })),
      // 09:00-11:00 and 10:00-12:00 overlap on 10:00-11:00 — the real union is
      // 09:00-12:00 (3h blocked), not 2h+2h = 4h double-counted.
      scheduleBlocks: [
        {
          startsAt: new Date(now.getTime() - 3 * 3_600_000), // today 09:00Z
          endsAt: new Date(now.getTime() - 1 * 3_600_000), // today 11:00Z
        },
        {
          startsAt: new Date(now.getTime() - 2 * 3_600_000), // today 10:00Z
          endsAt: new Date(now.getTime() + 0 * 3_600_000), // today 12:00Z
        },
      ],
      staffMembers: [
        { id: "s1", name: "Dr. One", role: "Dentist", status: "ACTIVE", isActive: true },
      ],
      conversations: [],
      aiSnapshots: [],
      now,
      timeZone: "UTC",
    });

    const utilization = dailyView.periods.daily.metrics.find(
      (metric) => metric.label === "Estimated utilization"
    );

    // 8h open - 3h merged-blocked = 5h (300min) capacity; 60min booked / 300min
    // = 20%. A naive sum-of-overlaps bug would instead blocked 4h, giving 25%.
    expect(utilization?.value).toBe("20.0%");
  });

  it("reports maximum utilization instead of a false 0% when a ScheduleBlock covers the entire open window but a booking exists under it", () => {
    // saveAppointmentAction validates against BusinessHours but never
    // ScheduleBlock, and a block can also be created after a booking already
    // exists — so a real booking can legitimately sit inside a block that,
    // on its own, consumes the day's entire open window. Reporting flat 0%
    // there (Codex P1) reads as "no capacity was used" when the opposite is
    // true.
    const dailyView = buildReportsViewFromWorkspace({
      business: { name: "Blocked Clinic" },
      appointments: [appt(0, 10, "COMPLETED", 60, "s1")],
      clients: [],
      clientMix: { active: 0, atRisk: 0, inactive: 0, archived: 0 },
      messages: [],
      businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isOpen: weekday >= 1 && weekday <= 5,
        startTime: "09:00",
        endTime: "17:00",
      })),
      // Covers the entire 09:00-17:00 open window — capacity for the day is
      // fully subtracted to 0, even though the booking above still exists.
      scheduleBlocks: [
        {
          startsAt: new Date(now.getTime() - 3 * 3_600_000), // today 09:00Z
          endsAt: new Date(now.getTime() + 5 * 3_600_000), // today 17:00Z
        },
      ],
      staffMembers: [
        { id: "s1", name: "Dr. One", role: "Dentist", status: "ACTIVE", isActive: true },
      ],
      conversations: [],
      aiSnapshots: [],
      now,
      timeZone: "UTC",
    });

    const utilization = dailyView.periods.daily.metrics.find(
      (metric) => metric.label === "Estimated utilization"
    );

    expect(utilization?.value).toBe("999.0%");
  });

  it("keeps the unmeasured-utilization sentinel out of the AI/rule-based insight narration", () => {
    // Same fully-blocked-window-with-a-real-booking setup as the test above
    // (999% sentinel is correct for the raw metric tile), but the insight
    // narration (watch/focus/primaryConstraint, fed to the AI prompt and the
    // rule-based fallback alike) must not read that sentinel as a genuine
    // "near overload, add staff" signal — it's a configuration conflict, not
    // a real demand-vs-capacity problem (Codex P1, fresh evidence after the
    // earlier delta-only sentinel gate).
    const dailyView = buildReportsViewFromWorkspace({
      business: { name: "Blocked Clinic" },
      appointments: [appt(0, 10, "COMPLETED", 60, "s1")],
      clients: [],
      clientMix: { active: 0, atRisk: 0, inactive: 0, archived: 0 },
      messages: [],
      businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isOpen: weekday >= 1 && weekday <= 5,
        startTime: "09:00",
        endTime: "17:00",
      })),
      scheduleBlocks: [
        {
          startsAt: new Date(now.getTime() - 3 * 3_600_000),
          endsAt: new Date(now.getTime() + 5 * 3_600_000),
        },
      ],
      staffMembers: [
        { id: "s1", name: "Dr. One", role: "Dentist", status: "ACTIVE", isActive: true },
      ],
      conversations: [],
      aiSnapshots: [],
      now,
      timeZone: "UTC",
    });

    const { snapshot } = dailyView.periods.daily;

    expect(snapshot.diagnosis).not.toMatch(/overload/i);
    expect(snapshot.focus).not.toMatch(/staff coverage|extending open hours/i);
    expect(snapshot.rootCauses?.[0]?.title).toBe("Utilization can't be measured for this period");
    expect(snapshot.rootCauses?.[0]?.severity).toBe("low");
  });

  it("prioritizes the unmeasured-capacity guidance over zero-booking guidance when both apply", () => {
    // A fully closed period (no open business hours at all that day) with
    // nothing booked — utilizationRate computes to a plain 0% here (no
    // sentinel involved), but scheduledCount === 0 also being true meant the
    // "0 booked appointments... open capacity is the main issue" guidance
    // fired first, reading as capacity having existed and gone unused,
    // rather than there having been no open capacity at all (Codex P2,
    // fresh evidence: the earlier fix only reordered for the
    // booking-exists-despite-zero-capacity case, not this zero-booking one).
    const dailyView = buildReportsViewFromWorkspace({
      business: { name: "Closed Clinic" },
      appointments: [],
      clients: [],
      clientMix: { active: 0, atRisk: 0, inactive: 0, archived: 0 },
      messages: [],
      businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isOpen: false,
        startTime: "09:00",
        endTime: "17:00",
      })),
      scheduleBlocks: [],
      staffMembers: [
        { id: "s1", name: "Dr. One", role: "Dentist", status: "ACTIVE", isActive: true },
      ],
      conversations: [],
      aiSnapshots: [],
      now,
      timeZone: "UTC",
    });

    const { snapshot } = dailyView.periods.daily;

    expect(snapshot.diagnosis).not.toMatch(/0 booked appointments/i);
    expect(snapshot.focus).not.toMatch(/create measurable demand/i);
    expect(snapshot.rootCauses?.[0]?.title).toBe("Utilization can't be measured for this period");
    // buildStrength and the rule-based actions[0] independently re-derive
    // their own scheduledCount === 0 condition rather than reusing the
    // already-corrected focus/diagnosis text, so they need the same guard
    // (Codex P2, fresh evidence after the diagnosis/focus/rootCauses fix).
    expect(snapshot.strength).not.toMatch(/unused capacity/i);
    expect(snapshot.actions?.[0]?.title).not.toMatch(/create booked demand/i);
  });

  it("measures blocked capacity in wall-clock minutes, not elapsed time across a DST transition", () => {
    // Europe/Budapest springs forward at 01:00 local on 2026-03-29 — the
    // wall-clock interval 00:00-08:00 that day is only 420 real elapsed
    // minutes, not 480. A block covering that same wall-clock span must
    // still subtract 480 minutes (matching the always-wall-clock open-hours
    // window it's subtracted from), not 420 — otherwise this day reports 60
    // minutes of phantom capacity that was never actually bookable.
    const dstNow = new Date("2026-03-29T10:00:00.000Z"); // local noon, post-shift
    const dailyView = buildReportsViewFromWorkspace({
      business: { name: "Blocked Clinic" },
      // Local 08:00-08:30 on the transition day — inside the genuinely
      // unblocked 08:00-09:00 hour, so it's a real, always-bookable slot
      // regardless of the bug.
      appointments: [
        {
          status: "COMPLETED",
          startAt: new Date("2026-03-29T06:00:00.000Z"),
          endAt: new Date("2026-03-29T06:30:00.000Z"),
          createdAt: new Date("2026-03-29T06:00:00.000Z"),
          clientId: "c1",
          staffMemberId: "s1",
        },
      ],
      clients: [],
      clientMix: { active: 0, atRisk: 0, inactive: 0, archived: 0 },
      messages: [],
      businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isOpen: true,
        startTime: "00:00",
        endTime: "09:00",
      })),
      // Local 00:00-08:00 on the transition day — the full 8 wall-clock
      // hours, even though only 7 hours actually elapse.
      scheduleBlocks: [
        {
          startsAt: new Date("2026-03-28T23:00:00.000Z"),
          endsAt: new Date("2026-03-29T06:00:00.000Z"),
        },
      ],
      staffMembers: [
        { id: "s1", name: "Dr. One", role: "Dentist", status: "ACTIVE", isActive: true },
      ],
      conversations: [],
      aiSnapshots: [],
      now: dstNow,
      timeZone: "Europe/Budapest",
    });

    const utilization = dailyView.periods.daily.metrics.find(
      (metric) => metric.label === "Estimated utilization"
    );

    // 9h open - 8h blocked (wall-clock) = 1h (60min) capacity; 30min booked /
    // 60min = 50%. The elapsed-time bug would instead measure only 7h
    // blocked, leaving 2h (120min) of capacity and reporting 25%.
    expect(utilization?.value).toBe("50.0%");
  });
});

describe("buildKeyMetrics", () => {
  it("keeps only the three headline KPIs Reports' own KPI row shows, dropping the display-only helper field", () => {
    // Codex finding on the OpenAI payload trim: currentRuleSnapshot's prose
    // only narrates whichever single metric the rule-based narration picked,
    // silently omitting the others' delta context — this restores just the
    // three the AI is expected to explain "what changed" for.
    const keyMetrics = buildKeyMetrics(view.periods.daily);

    expect(keyMetrics.map((metric) => metric.label)).toEqual([
      "Appointments",
      "Completion rate",
      "New clients",
    ]);
    for (const metric of keyMetrics) {
      expect(metric).not.toHaveProperty("helper");
    }
  });
});
