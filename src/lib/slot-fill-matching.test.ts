import { describe, expect, it } from "vitest";
import { rankWaitlistMatches, type FreedSlot, type WaitlistCandidate } from "@/lib/slot-fill-matching";

const SLOT = {
  service: "Checkup",
  staffMemberId: "staff_1",
  startAt: new Date("2026-07-10T09:00:00Z"),
  weekday: 4, // Friday, Monday=0
  timeMinutes: 9 * 60,
};

function candidate(overrides: Partial<WaitlistCandidate> = {}): WaitlistCandidate {
  return {
    id: "wl_1",
    clientId: "client_1",
    service: "Checkup",
    staffMemberId: null,
    earliestDate: null,
    preferredDays: [],
    preferredFrom: null,
    preferredTo: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  };
}

// The top-ranked match, or null — what the slot offer tries first.
function best(candidates: WaitlistCandidate[], slot: FreedSlot) {
  return rankWaitlistMatches(candidates, slot)[0] ?? null;
}

describe("rankWaitlistMatches", () => {
  it("matches on service, case/whitespace-insensitively", () => {
    expect(best([candidate({ service: " checkup " })], SLOT)?.id).toBe("wl_1");
    expect(best([candidate({ service: "Cleaning" })], SLOT)).toBeNull();
  });

  it("requires an exact provider match only when the candidate named one", () => {
    expect(best([candidate({ staffMemberId: null })], SLOT)?.id).toBe("wl_1");
    expect(best([candidate({ staffMemberId: "staff_1" })], SLOT)?.id).toBe("wl_1");
    expect(best([candidate({ staffMemberId: "staff_2" })], SLOT)).toBeNull();
  });

  it("respects earliestDate", () => {
    expect(best([candidate({ earliestDate: new Date("2026-07-11T00:00:00Z") })], SLOT)).toBeNull();
    expect(best([candidate({ earliestDate: new Date("2026-07-01T00:00:00Z") })], SLOT)?.id).toBe("wl_1");
  });

  it("respects preferredDays when set, ignores it when empty", () => {
    expect(best([candidate({ preferredDays: [0, 1, 2] })], SLOT)).toBeNull(); // Fri (4) not in Mon-Wed
    expect(best([candidate({ preferredDays: [4] })], SLOT)?.id).toBe("wl_1");
    expect(best([candidate({ preferredDays: [] })], SLOT)?.id).toBe("wl_1");
  });

  it("respects a preferred time window inclusive of its edges", () => {
    expect(best([candidate({ preferredFrom: "10:00", preferredTo: "12:00" })], SLOT)).toBeNull();
    expect(best([candidate({ preferredFrom: "09:00", preferredTo: "12:00" })], SLOT)?.id).toBe("wl_1");
  });

  it("picks whoever has waited longest among equally good matches", () => {
    const older = candidate({ id: "wl_old", createdAt: new Date("2026-01-01T00:00:00Z") });
    const newer = candidate({ id: "wl_new", createdAt: new Date("2026-06-15T00:00:00Z") });
    expect(best([newer, older], SLOT)?.id).toBe("wl_old");
  });

  it("returns null when nothing matches", () => {
    expect(best([], SLOT)).toBeNull();
    expect(best([candidate({ service: "Cleaning" })], SLOT)).toBeNull();
  });

  it("returns every eligible entry longest-waiting first, dropping the ones that don't fit", () => {
    const ranked = rankWaitlistMatches(
      [
        candidate({ id: "wl_mid", createdAt: new Date("2026-03-01T00:00:00Z") }),
        candidate({ id: "wl_wrong_service", service: "Cleaning", createdAt: new Date("2025-01-01T00:00:00Z") }),
        candidate({ id: "wl_old", createdAt: new Date("2026-01-01T00:00:00Z") }),
        candidate({ id: "wl_new", createdAt: new Date("2026-06-15T00:00:00Z") }),
      ],
      SLOT
    );
    expect(ranked.map((entry) => entry.id)).toEqual(["wl_old", "wl_mid", "wl_new"]);
  });
});
