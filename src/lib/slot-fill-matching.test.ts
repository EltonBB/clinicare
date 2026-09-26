import { describe, expect, it } from "vitest";
import { findBestWaitlistMatch, type WaitlistCandidate } from "@/lib/slot-fill-matching";

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

describe("findBestWaitlistMatch", () => {
  it("matches on service, case/whitespace-insensitively", () => {
    expect(findBestWaitlistMatch([candidate({ service: " checkup " })], SLOT)?.id).toBe("wl_1");
    expect(findBestWaitlistMatch([candidate({ service: "Cleaning" })], SLOT)).toBeNull();
  });

  it("requires an exact provider match only when the candidate named one", () => {
    expect(findBestWaitlistMatch([candidate({ staffMemberId: null })], SLOT)?.id).toBe("wl_1");
    expect(findBestWaitlistMatch([candidate({ staffMemberId: "staff_1" })], SLOT)?.id).toBe("wl_1");
    expect(findBestWaitlistMatch([candidate({ staffMemberId: "staff_2" })], SLOT)).toBeNull();
  });

  it("respects earliestDate", () => {
    expect(findBestWaitlistMatch([candidate({ earliestDate: new Date("2026-07-11T00:00:00Z") })], SLOT)).toBeNull();
    expect(findBestWaitlistMatch([candidate({ earliestDate: new Date("2026-07-01T00:00:00Z") })], SLOT)?.id).toBe("wl_1");
  });

  it("respects preferredDays when set, ignores it when empty", () => {
    expect(findBestWaitlistMatch([candidate({ preferredDays: [0, 1, 2] })], SLOT)).toBeNull(); // Fri (4) not in Mon-Wed
    expect(findBestWaitlistMatch([candidate({ preferredDays: [4] })], SLOT)?.id).toBe("wl_1");
    expect(findBestWaitlistMatch([candidate({ preferredDays: [] })], SLOT)?.id).toBe("wl_1");
  });

  it("respects a preferred time window inclusive of its edges", () => {
    expect(findBestWaitlistMatch([candidate({ preferredFrom: "10:00", preferredTo: "12:00" })], SLOT)).toBeNull();
    expect(findBestWaitlistMatch([candidate({ preferredFrom: "09:00", preferredTo: "12:00" })], SLOT)?.id).toBe("wl_1");
  });

  it("picks whoever has waited longest among equally good matches", () => {
    const older = candidate({ id: "wl_old", createdAt: new Date("2026-01-01T00:00:00Z") });
    const newer = candidate({ id: "wl_new", createdAt: new Date("2026-06-15T00:00:00Z") });
    expect(findBestWaitlistMatch([newer, older], SLOT)?.id).toBe("wl_old");
  });

  it("returns null when nothing matches", () => {
    expect(findBestWaitlistMatch([], SLOT)).toBeNull();
    expect(findBestWaitlistMatch([candidate({ service: "Cleaning" })], SLOT)).toBeNull();
  });
});
