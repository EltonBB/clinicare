import { describe, expect, it } from "vitest";
import type { AppointmentStatus, MessageDirection } from "@prisma/client";

import { buildReportsViewFromWorkspace } from "@/lib/reports";

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
