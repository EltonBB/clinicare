import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const followUpDraft = { findFirst: vi.fn() };
  const staffMember = { findFirst: vi.fn() };
  const conversation = { upsert: vi.fn() };
  const message = { create: vi.fn() };
  const $transaction = vi.fn();
  const getAuthedBusiness = vi.fn();
  const markFollowUpDraftSent = vi.fn();
  const confirmFollowUpDraftDispatch = vi.fn();
  const revertFollowUpDraftToPending = vi.fn();
  const markFollowUpDraftDelivered = vi.fn();
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
    confirmFollowUpDraftDispatch,
    revertFollowUpDraftToPending,
    markFollowUpDraftDelivered,
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
  confirmFollowUpDraftDispatch: mocks.confirmFollowUpDraftDispatch,
  revertFollowUpDraftToPending: mocks.revertFollowUpDraftToPending,
  markFollowUpDraftDelivered: mocks.markFollowUpDraftDelivered,
  DELIVERED_WHERE: { sentAt: { not: null } },
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

import { parseZonedWallClock } from "@/lib/time-zone";

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

type SendableDraft = { id: string; body: string; clientId: string; clientName: string | null; phone: string | null };

// A draft nothing happens to: the claim goes through, and the last check before the
// message leaves finds it as it was and hands back the same draft.
function draftIsLive(draft: SendableDraft) {
  mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true, draft });
  mocks.confirmFollowUpDraftDispatch.mockResolvedValue({ ok: true, draft });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthedBusiness.mockResolvedValue({ business: BUSINESS, user: {} });
  mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });
  mocks.markFollowUpDraftDelivered.mockResolvedValue(undefined);
  mocks.$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) =>
      cb({ conversation: mocks.conversation, message: mocks.message })
  );
});

describe("sendFollowUpDraftAction", () => {
  it("sends successfully and mirrors the send into the client's inbox thread", async () => {
    draftIsLive({
        id: DRAFT_ID,
        body: "Hi Alex, quick note about your next visit.",
        clientId: "client_1",
        clientName: "Alex",
        phone: "+15550100",
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
    // Codex #130: only now — the message left — is the draft recorded as sent,
    // which is what opens a slot offer to Book and Declined.
    expect(mocks.markFollowUpDraftDelivered).toHaveBeenCalledWith({ id: DRAFT_ID, businessId: BUSINESS.id });
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

  it("never records a draft as delivered when its send failed — it goes back to Pending instead", async () => {
    draftIsLive({ id: DRAFT_ID, body: "Hi", clientId: "client_1", clientName: "Alex", phone: "+15550100" });
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "provider_error", error: "x" });

    expect((await sendFollowUpDraftAction(DRAFT_ID)).ok).toBe(false);
    expect(mocks.markFollowUpDraftDelivered).not.toHaveBeenCalled();
    expect(mocks.revertFollowUpDraftToPending).toHaveBeenCalledWith({ id: DRAFT_ID, businessId: BUSINESS.id });
  });

  it("still reports success when recording delivery fails — the message already left", async () => {
    draftIsLive({ id: DRAFT_ID, body: "Hi", clientId: "client_1", clientName: "Alex", phone: "+15550100" });
    mocks.sendMessage.mockResolvedValue({ ok: true, providerMessageId: "msg_1", status: "SENT", body: "Hi" });
    mocks.conversation.upsert.mockResolvedValue({ id: "conv_1" });
    mocks.markFollowUpDraftDelivered.mockRejectedValue(new Error("db blip"));

    expect(await sendFollowUpDraftAction(DRAFT_ID)).toEqual({ ok: true });
    expect(mocks.revertFollowUpDraftToPending).not.toHaveBeenCalled();
  });

  it("sends the edited body when an override is provided, instead of the stored draft body", async () => {
    draftIsLive({ id: DRAFT_ID, body: "Original draft body", clientId: "client_1", clientName: "Alex", phone: "+15550100" });
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
    draftIsLive({
        id: DRAFT_ID,
        body: "Hi Alex, quick note about your next visit.",
        clientId: "client_1",
        clientName: "Alex",
        phone: "+15550100",
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
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.revertFollowUpDraftToPending).not.toHaveBeenCalled();
  });

  it("returns the flip's error without reverting anything when the draft was already handled", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: false, error: ALREADY_HANDLED_ERROR });

    const result = await sendFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({ ok: false, error: ALREADY_HANDLED_ERROR });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.revertFollowUpDraftToPending).not.toHaveBeenCalled();
  });

  // Codex #130: an edited body over the messaging seam's cap used to be stored by the
  // SENT flip and only then rejected by the send, leaving the oversized text on the
  // draft. The data layer now refuses it before the flip; nothing is sent or reverted.
  it("passes the edited body to the flip and returns its too-long refusal, sending and reverting nothing", async () => {
    const tooLong = "x".repeat(8001);
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: false, error: "The message is too long to send." });

    const result = await sendFollowUpDraftAction(DRAFT_ID, `  ${tooLong}  `);

    expect(result).toEqual({ ok: false, error: "The message is too long to send." });
    expect(mocks.markFollowUpDraftSent).toHaveBeenCalledWith(expect.objectContaining({ editedBody: tooLong }));
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.revertFollowUpDraftToPending).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reverts to pending and returns a plain error when the client has no phone on file", async () => {
    draftIsLive({
        id: DRAFT_ID,
        body: "Hi Alex, quick note about your next visit.",
        clientId: "client_1",
        clientName: null,
        phone: null,
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
    draftIsLive({ id: DRAFT_ID, body: "Hi Alex, quick note about your next visit.", clientId: "client_1", clientName: null, phone: "+15550100" });
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

  // The old version of this test covered a separate post-flip lookup that
  // could throw independently of the flip — markFollowUpDraftSent no longer
  // has one: the client/body read now happens in the SAME transaction as the
  // flip (Codex #130), so that race is gone by construction. sendMessage
  // throwing after a successful flip is still covered below.

  it("reverts to pending when sendMessage itself throws", async () => {
    draftIsLive({ id: DRAFT_ID, body: "Hi Alex, quick note about your next visit.", clientId: "client_1", clientName: null, phone: "+15550100" });
    mocks.sendMessage.mockRejectedValue(new Error("boom"));

    const result = await sendFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({ ok: false, error: "Couldn't send this message. Try again." });
    expect(mocks.revertFollowUpDraftToPending).toHaveBeenCalledTimes(1);
  });

  // Codex #130: the flip checks the draft and commits, and the message is only handed
  // to the provider after that - outside any transaction - so another request can
  // invalidate the draft in the gap (a reactivated or filled slot expiring its offer,
  // a payment settled, a client booked or archived). The last check runs again
  // directly before the patient is contacted.
  describe("the last check before the patient is contacted", () => {
    const DRAFT = { id: DRAFT_ID, body: "Hi Alex, quick note about your next visit.", clientId: "client_1", clientName: "Alex", phone: "+15550100" };

    it("runs after the flip and before the message is handed to the provider", async () => {
      draftIsLive(DRAFT);
      mocks.sendMessage.mockResolvedValue({ ok: true, providerMessageId: "msg_1", status: "SENT", body: DRAFT.body });
      mocks.conversation.upsert.mockResolvedValue({ id: "conv_1" });

      expect(await sendFollowUpDraftAction(DRAFT_ID)).toEqual({ ok: true });

      expect(mocks.confirmFollowUpDraftDispatch).toHaveBeenCalledWith({ id: DRAFT_ID, businessId: BUSINESS.id });
      const flipped = mocks.markFollowUpDraftSent.mock.invocationCallOrder[0];
      const checked = mocks.confirmFollowUpDraftDispatch.mock.invocationCallOrder[0];
      const sent = mocks.sendMessage.mock.invocationCallOrder[0];
      expect(flipped).toBeLessThan(checked);
      expect(checked).toBeLessThan(sent);
    });

    it.each([
      ["went stale after the flip", ALREADY_HANDLED_ERROR],
      [
        "no longer fits the working hours",
        "This slot is outside your working hours now. Update your working hours in Settings, or skip or decline the offer.",
      ],
    ])("sends nothing and puts the draft back to pending when the draft %s", async (_label, error) => {
      mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true, draft: DRAFT });
      mocks.confirmFollowUpDraftDispatch.mockResolvedValue({ ok: false, error });

      const result = await sendFollowUpDraftAction(DRAFT_ID);

      expect(result).toEqual({ ok: false, error });
      expect(mocks.sendMessage).not.toHaveBeenCalled();
      expect(mocks.revertFollowUpDraftToPending).toHaveBeenCalledWith({ id: DRAFT_ID, businessId: BUSINESS.id });
      // Nothing went out, so nothing is mirrored into the inbox either.
      expect(mocks.conversation.upsert).not.toHaveBeenCalled();
      expect(mocks.message.create).not.toHaveBeenCalled();
    });

    it("sends the draft the last check returned, with its phone number and edited text as they are now", async () => {
      mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true, draft: DRAFT });
      mocks.confirmFollowUpDraftDispatch.mockResolvedValue({ ok: true, draft: { ...DRAFT, phone: "+15550199", clientName: "Alexandra" } });
      mocks.sendMessage.mockResolvedValue({ ok: true, providerMessageId: "msg_1", status: "SENT", body: DRAFT.body });
      mocks.conversation.upsert.mockResolvedValue({ id: "conv_1" });

      expect(await sendFollowUpDraftAction(DRAFT_ID)).toEqual({ ok: true });

      expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ to: "+15550199" }));
      expect(mocks.conversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ phoneNumber: "+15550199" }) })
      );
    });

    it("sends the text staff approved, not the stored one, when they edited it", async () => {
      draftIsLive(DRAFT);
      mocks.sendMessage.mockResolvedValue({ ok: true, providerMessageId: "msg_1", status: "SENT", body: "Edited body" });
      mocks.conversation.upsert.mockResolvedValue({ id: "conv_1" });

      await sendFollowUpDraftAction(DRAFT_ID, "  Edited body  ");

      expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ message: { kind: "freeform", body: "Edited body" } }));
    });

    it("puts the draft back to pending, sending nothing, when the check itself fails", async () => {
      mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true, draft: DRAFT });
      mocks.confirmFollowUpDraftDispatch.mockRejectedValue(new Error("deadlock detected"));

      const result = await sendFollowUpDraftAction(DRAFT_ID);

      expect(result).toEqual({ ok: false, error: "Couldn't send this message. Try again." });
      expect(mocks.sendMessage).not.toHaveBeenCalled();
      expect(mocks.revertFollowUpDraftToPending).toHaveBeenCalledTimes(1);
    });

    it("reverts when the check finds the client without a phone number any more", async () => {
      mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true, draft: DRAFT });
      mocks.confirmFollowUpDraftDispatch.mockResolvedValue({ ok: true, draft: { ...DRAFT, phone: null } });

      expect(await sendFollowUpDraftAction(DRAFT_ID)).toEqual({ ok: false, error: "This client has no phone number on file." });
      expect(mocks.sendMessage).not.toHaveBeenCalled();
      expect(mocks.revertFollowUpDraftToPending).toHaveBeenCalledTimes(1);
    });

    it("does not check again when the flip itself refused the draft", async () => {
      mocks.markFollowUpDraftSent.mockResolvedValue({ ok: false, error: ALREADY_HANDLED_ERROR });

      await sendFollowUpDraftAction(DRAFT_ID);

      expect(mocks.confirmFollowUpDraftDispatch).not.toHaveBeenCalled();
    });
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
  // What bookSlotOffer read under its locks and booked (Codex #130).
  const booked = (slot: { title?: string; staffMemberId?: string | null; startAt: string; endAt: string }) =>
    mocks.bookSlotOffer.mockResolvedValue({
      ok: true,
      slot: {
        clientId: "client_1",
        title: slot.title ?? "Checkup",
        staffMemberId: slot.staffMemberId ?? null,
        startAt: new Date(slot.startAt),
        endAt: new Date(slot.endAt),
      },
    });

  it("returns a booking url built from exactly what Book booked, in the clinic's zone, and revalidates", async () => {
    process.env.APP_TIME_ZONE = "Europe/Budapest";
    // 22:30 UTC on Oct 4 is 00:30 on Oct 5 in Budapest (CEST) — a raw-UTC
    // date/time would land on the wrong day. A 45-minute slot (not the form's
    // 60-minute default) so the preserved-duration assertion is meaningful.
    booked({
      title: "Follow-up visit",
      staffMemberId: "staff_1",
      startAt: "2026-10-04T22:30:00.000Z",
      endAt: "2026-10-04T23:15:00.000Z",
    });

    const result = await bookFollowUpSlotAction(DRAFT_ID);

    expect(result).toEqual({
      ok: true,
      bookingUrl:
        "/calendar/new?client=client_1&service=Follow-up+visit&date=2026-10-05&time=00%3A30&staffMemberId=staff_1&duration=45",
    });
    expect(mocks.bookSlotOffer).toHaveBeenCalledWith({ id: DRAFT_ID, businessId: BUSINESS.id });
    // Codex #130: no separate read of the draft, slot or clinician outside
    // Book's transaction — those went stale before the entry was filled.
    expect(mocks.followUpDraft.findFirst).not.toHaveBeenCalled();
    expect(mocks.staffMember.findFirst).not.toHaveBeenCalled();
    expectFollowUpSurfacesRevalidated();
  });

  // Codex #130: the booking form adds the duration to the wall-clock time to get
  // the end, so a slot that spans a clock change needs its WALL-CLOCK length, or
  // the form derives an end time that is not the slot's - on the spring-forward
  // night, one that does not exist and resolves back to the start (Save refuses).
  it.each([
    [
      "spring-forward night (01:30 CET -> 03:30 CEST, 60 elapsed minutes)",
      { startAt: "2026-03-29T00:30:00.000Z", endAt: "2026-03-29T01:30:00.000Z" },
      { date: "2026-03-29", time: "01:30", duration: "120" },
    ],
    [
      "fall-back night (01:30 CEST -> 03:30 CET, 180 elapsed minutes)",
      { startAt: "2026-10-24T23:30:00.000Z", endAt: "2026-10-25T02:30:00.000Z" },
      { date: "2026-10-25", time: "01:30", duration: "120" },
    ],
  ])("pre-fills the wall-clock length of a slot across the %s", async (_label, slot, expected) => {
    process.env.APP_TIME_ZONE = "Europe/Budapest";
    booked({ title: "Night clinic", ...slot });

    const result = await bookFollowUpSlotAction(DRAFT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const params = new URL(result.bookingUrl, "https://app.test").searchParams;
    expect({ date: params.get("date"), time: params.get("time"), duration: params.get("duration") }).toEqual(expected);

    // What the booking form does with those values: start from the date and time,
    // end at the time plus the duration on the wall clock. Both must land on the
    // freed slot's own instants, so Save accepts exactly the slot that was offered.
    const startMinutes = Number(expected.time.slice(0, 2)) * 60 + Number(expected.time.slice(3));
    const endMinutes = startMinutes + Number(expected.duration);
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    expect(parseZonedWallClock(expected.date, expected.time)?.toISOString()).toBe(slot.startAt);
    expect(parseZonedWallClock(expected.date, endTime)?.toISOString()).toBe(slot.endAt);
  });

  it("passes an explicit empty staffMemberId when the freed slot had nobody assigned", async () => {
    process.env.APP_TIME_ZONE = "Europe/Budapest";
    booked({ startAt: "2026-10-05T07:00:00.000Z", endAt: "2026-10-05T07:30:00.000Z" });

    // An empty staffMemberId (not an absent one) so the booking form's own
    // "nothing preselected" default (its first staff member) can never
    // silently override a genuinely unassigned offer (Codex #130).
    expect(await bookFollowUpSlotAction(DRAFT_ID)).toEqual({
      ok: true,
      bookingUrl: "/calendar/new?client=client_1&service=Checkup&date=2026-10-05&time=09%3A00&staffMemberId=&duration=30",
    });
  });

  it.each([
    ["the offer is gone (declined, removed, or booked since)", "This slot offer is no longer available."],
    [
      "the offer's clinician is no longer available",
      "The staff member for this slot is no longer available. Book it manually from Calendar instead.",
    ],
  ])("passes Book's refusal through, revalidating nothing, when %s", async (_label, error) => {
    mocks.bookSlotOffer.mockResolvedValue({ ok: false, error });

    expect(await bookFollowUpSlotAction(DRAFT_ID)).toEqual({ ok: false, error });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("turns an unexpected failure (a conflict that survived its retry) into a plain retry message, revalidating nothing", async () => {
    mocks.bookSlotOffer.mockRejectedValue(new Error("deadlock detected"));

    expect(await bookFollowUpSlotAction(DRAFT_ID)).toEqual({ ok: false, error: "Something went wrong. Try again." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the session-expired error and never touches the draft when unauthenticated", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ error: "Your session expired. Log in again to manage follow-ups." });

    const result = await bookFollowUpSlotAction(DRAFT_ID);

    expect(result).toEqual({
      ok: false,
      error: "Your session expired. Log in again to manage follow-ups.",
    });
    expect(mocks.bookSlotOffer).not.toHaveBeenCalled();
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
