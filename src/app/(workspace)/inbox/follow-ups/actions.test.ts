import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const followUpDraft = { findFirst: vi.fn() };
  const staffMember = { findFirst: vi.fn() };
  const conversation = { upsert: vi.fn() };
  const message = { create: vi.fn() };
  const $transaction = vi.fn();
  const getAuthedBusiness = vi.fn();
  const markFollowUpDraftSent = vi.fn();
  const revertFollowUpDraftToPending = vi.fn();
  const dismissFollowUpDraft = vi.fn();
  const passSlotOffer = vi.fn();
  const bookSlotOffer = vi.fn();
  const sendMessage = vi.fn();
  const revalidatePath = vi.fn();
  return {
    followUpDraft,
    staffMember,
    conversation,
    message,
    $transaction,
    getAuthedBusiness,
    markFollowUpDraftSent,
    revertFollowUpDraftToPending,
    dismissFollowUpDraft,
    passSlotOffer,
    bookSlotOffer,
    sendMessage,
    revalidatePath,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    followUpDraft: mocks.followUpDraft,
    staffMember: mocks.staffMember,
    conversation: mocks.conversation,
    message: mocks.message,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/lib/business", () => ({
  getAuthedBusiness: mocks.getAuthedBusiness,
}));

vi.mock("@/lib/follow-ups-data", () => ({
  markFollowUpDraftSent: mocks.markFollowUpDraftSent,
  revertFollowUpDraftToPending: mocks.revertFollowUpDraftToPending,
  dismissFollowUpDraft: mocks.dismissFollowUpDraft,
  passSlotOffer: mocks.passSlotOffer,
  bookSlotOffer: mocks.bookSlotOffer,
  ALREADY_HANDLED_ERROR: "This follow-up was already handled.",
  SLOT_OFFER_UNAVAILABLE_ERROR: "This slot offer is no longer available.",
}));

vi.mock("@/lib/messaging", () => ({
  sendMessage: mocks.sendMessage,
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  bookFollowUpSlotAction,
  dismissFollowUpDraftAction,
  passSlotOfferAction,
  sendFollowUpDraftAction,
} from "./actions";

const BUSINESS = { id: "biz_1", plan: "PRO" as const };
const ORIGINAL_TIME_ZONE = process.env.APP_TIME_ZONE;

afterEach(() => {
  if (ORIGINAL_TIME_ZONE === undefined) {
    delete process.env.APP_TIME_ZONE;
  } else {
    process.env.APP_TIME_ZONE = ORIGINAL_TIME_ZONE;
  }
});

function expectFollowUpSurfacesRevalidated() {
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox/follow-ups");
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox");
  // The waiting-list panel shows each entry's offer state.
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
}
const DRAFT_ID = "draft_1";
const ALREADY_HANDLED_ERROR = "This follow-up was already handled.";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthedBusiness.mockResolvedValue({ business: BUSINESS, user: {} });
  mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });
  mocks.$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) =>
      cb({ conversation: mocks.conversation, message: mocks.message })
  );
});

describe("sendFollowUpDraftAction", () => {
  it("sends successfully and mirrors the send into the client's inbox thread", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true });
    mocks.followUpDraft.findFirst.mockResolvedValue({
      id: DRAFT_ID,
      body: "Hi Alex, quick note about your next visit.",
      clientId: "client_1",
      client: { phone: "+15550100", name: "Alex" },
    });
    mocks.sendMessage.mockResolvedValue({
      ok: true,
      providerMessageId: "msg_1",
      status: "SENT",
      body: "Hi Alex, quick note about your next visit.",
    });
    mocks.conversation.upsert.mockResolvedValue({ id: "conv_1" });

    const result = await sendFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({ ok: true });
    expect(mocks.markFollowUpDraftSent).toHaveBeenCalledWith({
      id: DRAFT_ID,
      businessId: BUSINESS.id,
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      channel: "WHATSAPP",
      businessId: BUSINESS.id,
      to: "+15550100",
      message: { kind: "freeform", body: "Hi Alex, quick note about your next visit." },
    });
    expect(mocks.revertFollowUpDraftToPending).not.toHaveBeenCalled();
    // Finding 3: a Message row is written for the sent draft — otherwise it's
    // invisible in the client's Inbox thread and undiscoverable by a later
    // delivery-status webhook.
    expect(mocks.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv_1",
          clientId: "client_1",
          direction: "OUTBOUND",
          body: "Hi Alex, quick note about your next visit.",
          providerMessageSid: "msg_1",
          deliveryStatus: "SENT",
        }),
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox/follow-ups");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox");
  });

  it("sends the edited body when an override is provided, instead of the stored draft body", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true });
    mocks.followUpDraft.findFirst.mockResolvedValue({
      id: DRAFT_ID,
      body: "Original draft body",
      clientId: "client_1",
      client: { phone: "+15550100", name: "Alex" },
    });
    mocks.sendMessage.mockResolvedValue({
      ok: true,
      providerMessageId: "msg_1",
      status: "SENT",
      body: "Edited body",
    });
    mocks.conversation.upsert.mockResolvedValue({ id: "conv_1" });

    const result = await sendFollowUpDraftAction(DRAFT_ID, "Edited body");

    expect(result).toEqual({ ok: true });
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { kind: "freeform", body: "Edited body" },
      })
    );
  });

  it("does not fail the send when the inbox mirror write throws", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true });
    mocks.followUpDraft.findFirst.mockResolvedValue({
      id: DRAFT_ID,
      body: "Hi Alex, quick note about your next visit.",
      clientId: "client_1",
      client: { phone: "+15550100", name: "Alex" },
    });
    mocks.sendMessage.mockResolvedValue({
      ok: true,
      providerMessageId: "msg_1",
      status: "SENT",
      body: "Hi Alex, quick note about your next visit.",
    });
    mocks.conversation.upsert.mockRejectedValue(new Error("db unavailable"));

    const result = await sendFollowUpDraftAction(DRAFT_ID);

    // The mirror write is best-effort — the draft is already flipped to SENT
    // and the WhatsApp message already went out, so a mirror failure must not
    // undo either.
    expect(result).toEqual({ ok: true });
    expect(mocks.revertFollowUpDraftToPending).not.toHaveBeenCalled();
  });

  it("rejects a non-string override the same way instead of throwing", async () => {
    const result = await sendFollowUpDraftAction(DRAFT_ID, { not: "text" } as unknown as string);

    expect(result).toEqual({ ok: false, error: "Write a message before sending." });
    expect(mocks.markFollowUpDraftSent).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only override before touching the draft or sending anything", async () => {
    const result = await sendFollowUpDraftAction(DRAFT_ID, "   ");

    expect(result).toEqual({ ok: false, error: "Write a message before sending." });
    expect(mocks.markFollowUpDraftSent).not.toHaveBeenCalled();
    expect(mocks.followUpDraft.findFirst).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.revertFollowUpDraftToPending).not.toHaveBeenCalled();
  });

  it("returns the flip's error without reverting anything when the draft was already handled", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: false, error: ALREADY_HANDLED_ERROR });

    const result = await sendFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({ ok: false, error: ALREADY_HANDLED_ERROR });
    expect(mocks.followUpDraft.findFirst).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.revertFollowUpDraftToPending).not.toHaveBeenCalled();
  });

  it("reverts to pending and returns a plain error when the client has no phone on file", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true });
    mocks.followUpDraft.findFirst.mockResolvedValue({
      id: DRAFT_ID,
      body: "Hi Alex, quick note about your next visit.",
      client: { phone: null },
    });

    const result = await sendFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({ ok: false, error: "This client has no phone number on file." });
    expect(mocks.revertFollowUpDraftToPending).toHaveBeenCalledWith({
      id: DRAFT_ID,
      businessId: BUSINESS.id,
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("reverts to pending and hides the raw provider error when sendMessage fails", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true });
    mocks.followUpDraft.findFirst.mockResolvedValue({
      id: DRAFT_ID,
      body: "Hi Alex, quick note about your next visit.",
      client: { phone: "+15550100" },
    });
    mocks.sendMessage.mockResolvedValue({
      ok: false,
      reason: "provider_error",
      error: "raw provider failure detail",
    });

    const result = await sendFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({ ok: false, error: "Couldn't send this message. Try again." });
    expect(mocks.revertFollowUpDraftToPending).toHaveBeenCalledWith({
      id: DRAFT_ID,
      businessId: BUSINESS.id,
    });
  });

  it("reverts to pending when the draft lookup throws after the flip, instead of stranding it as sent", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true });
    mocks.followUpDraft.findFirst.mockRejectedValue(new Error("connection reset"));

    const result = await sendFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({ ok: false, error: "Couldn't send this message. Try again." });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.revertFollowUpDraftToPending).toHaveBeenCalledWith({
      id: DRAFT_ID,
      businessId: BUSINESS.id,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reverts to pending when sendMessage itself throws", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true });
    mocks.followUpDraft.findFirst.mockResolvedValue({
      id: DRAFT_ID,
      body: "Hi Alex, quick note about your next visit.",
      client: { phone: "+15550100" },
    });
    mocks.sendMessage.mockRejectedValue(new Error("boom"));

    const result = await sendFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({ ok: false, error: "Couldn't send this message. Try again." });
    expect(mocks.revertFollowUpDraftToPending).toHaveBeenCalledTimes(1);
  });

  it("returns the session-expired error and never touches the draft when unauthenticated", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ error: "Your session expired. Log in again to manage follow-ups." });

    const result = await sendFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({
      ok: false,
      error: "Your session expired. Log in again to manage follow-ups.",
    });
    expect(mocks.markFollowUpDraftSent).not.toHaveBeenCalled();
  });
});

describe("dismissFollowUpDraftAction", () => {
  it("dismisses and revalidates, with no sendMessage call", async () => {
    mocks.dismissFollowUpDraft.mockResolvedValue({ ok: true });

    const result = await dismissFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({ ok: true });
    expect(mocks.dismissFollowUpDraft).toHaveBeenCalledWith({
      id: DRAFT_ID,
      businessId: BUSINESS.id,
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expectFollowUpSurfacesRevalidated();
  });

  it("turns an unexpected failure (e.g. a deadlock that survived its retry) into a plain retry message", async () => {
    mocks.dismissFollowUpDraft.mockRejectedValue(new Error("deadlock detected"));

    expect(await dismissFollowUpDraftAction(DRAFT_ID)).toEqual({ ok: false, error: "Something went wrong. Try again." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("mirrors the already-handled case, with no sendMessage call at all", async () => {
    mocks.dismissFollowUpDraft.mockResolvedValue({ ok: false, error: ALREADY_HANDLED_ERROR });

    const result = await dismissFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({ ok: false, error: ALREADY_HANDLED_ERROR });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe("bookFollowUpSlotAction", () => {
  it("returns a booking url pre-filled with the freed slot's clinic-zone date and time, and flips the entry to FILLED", async () => {
    process.env.APP_TIME_ZONE = "Europe/Budapest";
    mocks.followUpDraft.findFirst.mockResolvedValue({
      clientId: "client_1",
      // 22:30 UTC on Oct 4 is 00:30 on Oct 5 in Budapest (CEST) — a raw-UTC
      // date/time would land on the wrong day. A 45-minute slot (not the
      // form's 60-minute default) so the preserved-duration assertion below
      // actually distinguishes the fix from the old behavior.
      appointment: {
        title: "Follow-up visit",
        staffMemberId: "staff_1",
        startAt: new Date("2026-10-04T22:30:00.000Z"),
        endAt: new Date("2026-10-04T23:15:00.000Z"),
      },
    });
    mocks.bookSlotOffer.mockResolvedValue({ ok: true });

    const result = await bookFollowUpSlotAction(DRAFT_ID);

    expect(result).toEqual({
      ok: true,
      bookingUrl:
        "/calendar/new?client=client_1&service=Follow-up+visit&date=2026-10-05&time=00%3A30&staffMemberId=staff_1&duration=45",
    });
    // Only a live sent offer: entry still OFFERED, slot still cancelled and ahead.
    expect(mocks.followUpDraft.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: DRAFT_ID,
        businessId: BUSINESS.id,
        kind: "SLOT_OFFER",
        status: "SENT",
        waitlistEntry: { status: "OFFERED" },
        appointment: { status: "CANCELLED", startAt: { gt: expect.any(Date) } },
      }),
      select: {
        clientId: true,
        appointment: { select: { title: true, staffMemberId: true, startAt: true, endAt: true } },
      },
    });
    // The entry flip (draft row locked first, entry second) lives in the data layer.
    expect(mocks.bookSlotOffer).toHaveBeenCalledWith({ id: DRAFT_ID, businessId: BUSINESS.id });
    // The offer's staff member is re-checked before ever building the booking
    // URL or touching the entry (Codex #130).
    expect(mocks.staffMember.findFirst).toHaveBeenCalledWith({
      where: { id: "staff_1", businessId: BUSINESS.id, isActive: true, status: { not: "INACTIVE" } },
      select: { id: true },
    });
    expectFollowUpSurfacesRevalidated();
  });

  it("omits staffMemberId when the freed slot had nobody assigned, without checking any staff member", async () => {
    process.env.APP_TIME_ZONE = "Europe/Budapest";
    mocks.followUpDraft.findFirst.mockResolvedValue({
      clientId: "client_1",
      appointment: {
        title: "Checkup",
        staffMemberId: null,
        startAt: new Date("2026-10-05T07:00:00.000Z"),
        endAt: new Date("2026-10-05T07:30:00.000Z"),
      },
    });
    mocks.bookSlotOffer.mockResolvedValue({ ok: true });

    const result = await bookFollowUpSlotAction(DRAFT_ID);

    expect(result).toEqual({
      ok: true,
      bookingUrl: "/calendar/new?client=client_1&service=Checkup&date=2026-10-05&time=09%3A00&duration=30",
    });
    expect(mocks.staffMember.findFirst).not.toHaveBeenCalled();
  });

  it("refuses to book, without touching the entry, when the offer's staff member has since gone inactive or was removed (Codex #130)", async () => {
    mocks.followUpDraft.findFirst.mockResolvedValue({
      clientId: "client_1",
      appointment: {
        title: "Checkup",
        staffMemberId: "staff_gone",
        startAt: new Date("2026-10-05T07:00:00.000Z"),
        endAt: new Date("2026-10-05T07:30:00.000Z"),
      },
    });
    mocks.staffMember.findFirst.mockResolvedValue(null);

    const result = await bookFollowUpSlotAction(DRAFT_ID);

    expect(result).toEqual({
      ok: false,
      error: "The staff member for this slot is no longer available. Book it manually from Calendar instead.",
    });
    // Never flips the entry, never revalidates — the offer is left exactly as
    // it was so staff can retry once the staffing is sorted out.
    expect(mocks.bookSlotOffer).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses when the entry was declined, removed, or booked since the read", async () => {
    mocks.followUpDraft.findFirst.mockResolvedValue({
      clientId: "client_1",
      appointment: { title: "Checkup", staffMemberId: null, startAt: new Date("2026-10-05T07:00:00.000Z"), endAt: new Date("2026-10-05T07:30:00.000Z") },
    });
    mocks.bookSlotOffer.mockResolvedValue({ ok: false, error: "This slot offer is no longer available." });

    expect(await bookFollowUpSlotAction(DRAFT_ID)).toEqual({
      ok: false,
      error: "This slot offer is no longer available.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("turns an unexpected failure (a conflict that survived its retry) into a plain retry message, revalidating nothing", async () => {
    mocks.followUpDraft.findFirst.mockResolvedValue({
      clientId: "client_1",
      appointment: { title: "Checkup", staffMemberId: null, startAt: new Date("2026-10-05T07:00:00.000Z"), endAt: new Date("2026-10-05T07:30:00.000Z") },
    });
    mocks.bookSlotOffer.mockRejectedValue(new Error("deadlock detected"));

    expect(await bookFollowUpSlotAction(DRAFT_ID)).toEqual({ ok: false, error: "Something went wrong. Try again." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a plain error and never touches the waitlist entry when the draft isn't a bookable slot offer", async () => {
    mocks.followUpDraft.findFirst.mockResolvedValue(null);

    const result = await bookFollowUpSlotAction(DRAFT_ID);

    expect(result).toEqual({ ok: false, error: "This slot offer is no longer available." });
    expect(mocks.bookSlotOffer).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the session-expired error and never touches the draft when unauthenticated", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ error: "Your session expired. Log in again to manage follow-ups." });

    const result = await bookFollowUpSlotAction(DRAFT_ID);

    expect(result).toEqual({
      ok: false,
      error: "Your session expired. Log in again to manage follow-ups.",
    });
    expect(mocks.followUpDraft.findFirst).not.toHaveBeenCalled();
  });
});

describe("passSlotOfferAction (Declined)", () => {
  it("records the decline for this business and revalidates every surface it feeds", async () => {
    mocks.passSlotOffer.mockResolvedValue({ ok: true });

    expect(await passSlotOfferAction(DRAFT_ID)).toEqual({ ok: true });
    expect(mocks.passSlotOffer).toHaveBeenCalledWith({ id: DRAFT_ID, businessId: BUSINESS.id });
    expectFollowUpSurfacesRevalidated();
  });

  it("passes the data layer's plain error through without revalidating", async () => {
    mocks.passSlotOffer.mockResolvedValue({ ok: false, error: "This slot offer is no longer available." });

    expect(await passSlotOfferAction(DRAFT_ID)).toEqual({
      ok: false,
      error: "This slot offer is no longer available.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("still lets a workspace that dropped to Basic record the decline (the re-offer is gated further down)", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_2", plan: "BASIC" }, user: {} });
    mocks.passSlotOffer.mockResolvedValue({ ok: true });

    expect(await passSlotOfferAction(DRAFT_ID)).toEqual({ ok: true });
    // Still scoped to the signed-in workspace.
    expect(mocks.passSlotOffer).toHaveBeenCalledWith({ id: DRAFT_ID, businessId: "biz_2" });
  });

  it("turns an unexpected failure into a plain retry message instead of throwing", async () => {
    mocks.passSlotOffer.mockRejectedValue(new Error("deadlock detected"));

    expect(await passSlotOfferAction(DRAFT_ID)).toEqual({ ok: false, error: "Something went wrong. Try again." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed id before touching the offer", async () => {
    expect(await passSlotOfferAction("")).toEqual({ ok: false, error: "This slot offer is no longer available." });
    expect(mocks.passSlotOffer).not.toHaveBeenCalled();
  });

  it("returns the session-expired error when unauthenticated", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ error: "Your session expired. Log in again to manage follow-ups." });

    expect(await passSlotOfferAction(DRAFT_ID)).toEqual({
      ok: false,
      error: "Your session expired. Log in again to manage follow-ups.",
    });
    expect(mocks.passSlotOffer).not.toHaveBeenCalled();
  });
});

// Server actions take client-serialized arguments: an object id would reach
// Prisma's `where` as a filter (e.g. Skip dismissing every pending draft).
describe("follow-up actions refuse a non-string draft id before touching anything", () => {
  const CRAFTED_ID = { not: "" } as unknown as string;

  it.each([
    ["send", () => sendFollowUpDraftAction(CRAFTED_ID), ALREADY_HANDLED_ERROR],
    ["skip", () => dismissFollowUpDraftAction(CRAFTED_ID), ALREADY_HANDLED_ERROR],
    ["book", () => bookFollowUpSlotAction(CRAFTED_ID), "This slot offer is no longer available."],
    ["declined", () => passSlotOfferAction(CRAFTED_ID), "This slot offer is no longer available."],
  ])("%s", async (_name, run, error) => {
    expect(await run()).toEqual({ ok: false, error });

    for (const fn of [
      mocks.followUpDraft.findFirst,
      mocks.bookSlotOffer,
      mocks.conversation.upsert,
      mocks.message.create,
      mocks.$transaction,
      mocks.markFollowUpDraftSent,
      mocks.revertFollowUpDraftToPending,
      mocks.dismissFollowUpDraft,
      mocks.passSlotOffer,
      mocks.sendMessage,
      mocks.revalidatePath,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});
