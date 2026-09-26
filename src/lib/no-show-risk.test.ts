import { describe, expect, it } from "vitest";
import { scoreNoShowRisk, type NoShowRiskPastVisit } from "@/lib/no-show-risk";

const BASE_APPT = { startAt: new Date("2026-07-10T09:00:00Z"), createdAt: new Date("2026-07-05T09:00:00Z"), status: "CONFIRMED" as const, reminderSent: false };

function visit(status: NoShowRiskPastVisit["status"], startAt: string, updatedAt = startAt): NoShowRiskPastVisit {
  return { status, startAt: new Date(startAt), updatedAt: new Date(updatedAt) };
}

describe("scoreNoShowRisk", () => {
  it("says 'not enough history' with fewer than 2 past visits", () => {
    expect(scoreNoShowRisk([], BASE_APPT)).toEqual({
      level: "low",
      reasons: ["Not enough visit history yet"],
      insufficientHistory: true,
    });
    expect(scoreNoShowRisk([visit("COMPLETED", "2026-06-01T09:00:00Z")], BASE_APPT)).toMatchObject({
      insufficientHistory: true,
    });
  });

  it("is low with a clean history and no other signals", () => {
    const history = [visit("COMPLETED", "2026-06-01T09:00:00Z"), visit("COMPLETED", "2026-05-01T09:00:00Z")];
    expect(scoreNoShowRisk(history, BASE_APPT)).toEqual({ level: "low", reasons: [], insufficientHistory: false });
  });

  it("is high when a recent visit was a no-show", () => {
    const history = [visit("NO_SHOW", "2026-06-01T09:00:00Z"), visit("COMPLETED", "2026-05-01T09:00:00Z")];
    const result = scoreNoShowRisk(history, BASE_APPT);
    expect(result.level).toBe("high");
    expect(result.reasons[0]).toBe("Missed a recent appointment");
  });

  it("ignores a no-show outside the last 5 finalized visits", () => {
    const old = visit("NO_SHOW", "2020-01-01T09:00:00Z");
    const recentClean = Array.from({ length: 5 }, (_, i) => visit("COMPLETED", `2026-0${i + 1}-01T09:00:00Z`));
    expect(scoreNoShowRisk([old, ...recentClean], BASE_APPT).level).toBe("low");
  });

  it("is medium for a same-day (late) cancellation, but not for an early one", () => {
    const late = [
      visit("CANCELLED", "2026-06-01T09:00:00Z", "2026-06-01T02:00:00Z"), // cancelled 7h before start
      visit("COMPLETED", "2026-05-01T09:00:00Z"),
    ];
    expect(scoreNoShowRisk(late, BASE_APPT)).toMatchObject({ level: "medium", reasons: ["Cancelled last-minute recently"] });

    const early = [
      visit("CANCELLED", "2026-06-01T09:00:00Z", "2026-05-20T09:00:00Z"), // cancelled 12 days before
      visit("COMPLETED", "2026-05-01T09:00:00Z"),
    ];
    expect(scoreNoShowRisk(early, BASE_APPT)).toMatchObject({ level: "low", reasons: [] });
  });

  it("is medium for an unconfirmed reminder on a still-pending appointment", () => {
    const history = [visit("COMPLETED", "2026-06-01T09:00:00Z"), visit("COMPLETED", "2026-05-01T09:00:00Z")];
    const pending = { ...BASE_APPT, status: "PENDING" as const, reminderSent: true };
    expect(scoreNoShowRisk(history, pending)).toMatchObject({ level: "medium", reasons: ["Hasn't confirmed the reminder"] });

    const confirmed = { ...BASE_APPT, status: "CONFIRMED" as const, reminderSent: true };
    expect(scoreNoShowRisk(history, confirmed).reasons).not.toContain("Hasn't confirmed the reminder");
  });

  it("is low-scoring for a long lead time alone, but still names it as a reason", () => {
    const history = [visit("COMPLETED", "2026-06-01T09:00:00Z"), visit("COMPLETED", "2026-05-01T09:00:00Z")];
    const farOut = { ...BASE_APPT, startAt: new Date("2026-08-15T09:00:00Z"), createdAt: new Date("2026-07-01T09:00:00Z") };
    const result = scoreNoShowRisk(history, farOut);
    expect(result.level).toBe("low");
    expect(result.reasons).toContain("Booked far in advance");
  });

  it("stacks signals and orders reasons by weight, most important first", () => {
    const history = [visit("NO_SHOW", "2026-06-01T09:00:00Z"), visit("COMPLETED", "2026-05-01T09:00:00Z")];
    const pending = { ...BASE_APPT, status: "PENDING" as const, reminderSent: true };
    const result = scoreNoShowRisk(history, pending);
    expect(result.level).toBe("high");
    expect(result.reasons).toEqual(["Missed a recent appointment", "Hasn't confirmed the reminder"]);
  });
});
