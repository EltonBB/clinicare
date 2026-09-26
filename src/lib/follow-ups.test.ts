import { describe, expect, it } from "vitest";
import { buildFollowUpsViewFromRecords } from "@/lib/follow-ups";

function draft(overrides: Partial<Parameters<typeof buildFollowUpsViewFromRecords>[0]["drafts"][number]> = {}) {
  return {
    id: "draft_1",
    clientId: "client_1",
    client: { id: "client_1", name: "Alex Patient" },
    kind: "REBOOK" as const,
    status: "PENDING" as const,
    body: "Hi Alex, it's been a while — want to book your next visit?",
    appointment: null,
    createdAt: new Date("2026-07-01T10:00:00Z"),
    ...overrides,
  };
}

describe("buildFollowUpsViewFromRecords", () => {
  it("labels each kind and falls back the reason to the kind label with no linked appointment", () => {
    const view = buildFollowUpsViewFromRecords({ drafts: [draft()], now: new Date("2026-07-02T00:00:00Z"), timeZone: "UTC" });
    expect(view.pendingCount).toBe(1);
    expect(view.items[0]).toMatchObject({
      id: "draft_1",
      clientName: "Alex Patient",
      kind: "REBOOK",
      kindLabel: "Rebooking nudge",
      reasonLabel: "Rebooking nudge",
    });
  });

  it("uses the linked appointment's service and time as the reason when one exists", () => {
    const withAppt = draft({
      kind: "SLOT_OFFER",
      appointment: { startAt: new Date("2026-07-10T09:00:00Z"), title: "Checkup" },
    });
    const view = buildFollowUpsViewFromRecords({ drafts: [withAppt], timeZone: "UTC" });
    expect(view.items[0]?.reasonLabel).toContain("Checkup");
  });

  it("returns an empty view for no drafts", () => {
    expect(buildFollowUpsViewFromRecords({ drafts: [] })).toEqual({ items: [], pendingCount: 0 });
  });

  it("marks a SENT SLOT_OFFER as bookable but leaves every other kind/status combination not bookable", () => {
    const bookable = draft({ kind: "SLOT_OFFER", status: "SENT" });
    const pendingSlotOffer = draft({ kind: "SLOT_OFFER", status: "PENDING" });
    const sentRebook = draft({ kind: "REBOOK", status: "SENT" });

    const view = buildFollowUpsViewFromRecords({
      drafts: [bookable, pendingSlotOffer, sentRebook],
      timeZone: "UTC",
    });

    expect(view.items.map((item) => item.canBook)).toEqual([true, false, false]);
  });
});
