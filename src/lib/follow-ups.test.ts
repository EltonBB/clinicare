import { describe, expect, it } from "vitest";
import { buildFollowUpsViewFromRecords, followUpRowKey, visibleFollowUps } from "@/lib/follow-ups";

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
    const view = buildFollowUpsViewFromRecords({ drafts: [draft()], timeZone: "UTC" });
    expect(view.items).toHaveLength(1);
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
    expect(buildFollowUpsViewFromRecords({ drafts: [] })).toEqual({ items: [] });
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

  it("offers Send on every row of a Pro workspace", () => {
    const view = buildFollowUpsViewFromRecords({
      drafts: [draft({ kind: "SLOT_OFFER" }), draft({ kind: "REBOOK" }), draft({ kind: "PAYMENT" }), draft({ kind: "THANK_YOU" })],
      timeZone: "UTC",
      canSendSlotOffers: true,
    });

    expect(view.items.map((item) => item.canSend)).toEqual([true, true, true, true]);
  });

  it("leaves Send off a slot offer once the workspace is off Pro, but not the kinds that send on every plan", () => {
    const view = buildFollowUpsViewFromRecords({
      drafts: [draft({ kind: "SLOT_OFFER" }), draft({ kind: "PAYMENT" }), draft({ kind: "THANK_YOU" })],
      timeZone: "UTC",
      canSendSlotOffers: false,
    });

    expect(view.items.map((item) => item.canSend)).toEqual([false, true, true]);
  });
});

describe("visibleFollowUps", () => {
  it("brings a slot offer back as a bookable row after Send + refresh, while other handled rows stay hidden", () => {
    const pendingOffer = buildFollowUpsViewFromRecords({
      drafts: [draft({ id: "d_offer", kind: "SLOT_OFFER", status: "PENDING" }), draft({ id: "d_rebook" })],
      timeZone: "UTC",
    }).items;
    // Staff sent the offer and skipped the rebook on this page.
    const handled = pendingOffer.map(followUpRowKey);

    // After router.refresh() the server returns the offer as SENT (bookable);
    // the skipped rebook is gone server-side but would stay hidden anyway.
    const refreshed = buildFollowUpsViewFromRecords({
      drafts: [draft({ id: "d_offer", kind: "SLOT_OFFER", status: "SENT" }), draft({ id: "d_rebook" })],
      timeZone: "UTC",
    }).items;

    expect(visibleFollowUps(refreshed, handled).map((item) => [item.id, item.canBook])).toEqual([["d_offer", true]]);
  });
});
