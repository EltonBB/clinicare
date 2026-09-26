import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const followUpDraft = { findFirst: vi.fn() };
  const waitlistEntry = { updateMany: vi.fn() };
  const conversation = { upsert: vi.fn() };
  const message = { create: vi.fn() };
  const $transaction = vi.fn();
  const getAuthedBusiness = vi.fn();
  const markFollowUpDraftSent = vi.fn();
  const revertFollowUpDraftToPending = vi.fn();
  const dismissFollowUpDraft = vi.fn();
  const sendMessage = vi.fn();
  const revalidatePath = vi.fn();
  return {
    followUpDraft,
    waitlistEntry,
    conversation,
    message,
    $transaction,
    getAuthedBusiness,
    markFollowUpDraftSent,
    revertFollowUpDraftToPending,
    dismissFollowUpDraft,
    sendMessage,
    revalidatePath,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    followUpDraft: mocks.followUpDraft,
    waitlistEntry: mocks.waitlistEntry,
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
}));

vi.mock("@/lib/messaging", () => ({
  sendMessage: mocks.sendMessage,
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { bookFollowUpSlotAction, dismissFollowUpDraftAction, sendFollowUpDraftAction } from "./actions";

const BUSINESS = { id: "biz_1" };
const DRAFT_ID = "draft_1";
const ALREADY_HANDLED_ERROR = "This follow-up was already handled.";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthedBusiness.mockResolvedValue({ business: BUSINESS, user: {} });
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
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox/follow-ups");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox");
  });

  it("mirrors the already-handled case, with no sendMessage call at all", async () => {
    mocks.dismissFollowUpDraft.mockResolvedValue({ ok: false, error: ALREADY_HANDLED_ERROR });

    const result = await dismissFollowUpDraftAction(DRAFT_ID);

    expect(result).toEqual({ ok: false, error: ALREADY_HANDLED_ERROR });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe("bookFollowUpSlotAction", () => {
  it("returns a pre-filled booking url and flips the waitlist entry to FILLED", async () => {
    mocks.followUpDraft.findFirst.mockResolvedValue({
      clientId: "client_1",
      appointment: { title: "Follow-up visit", staffMemberId: "staff_1" },
    });
    mocks.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await bookFollowUpSlotAction(DRAFT_ID);

    expect(result).toEqual({
      ok: true,
      bookingUrl: "/calendar/new?client=client_1&service=Follow-up+visit&staffMemberId=staff_1",
    });
    expect(mocks.followUpDraft.findFirst).toHaveBeenCalledWith({
      where: { id: DRAFT_ID, businessId: BUSINESS.id, kind: "SLOT_OFFER", status: "SENT" },
      select: { clientId: true, appointment: { select: { title: true, staffMemberId: true } } },
    });
    expect(mocks.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: BUSINESS.id,
        status: "OFFERED",
        followUpDrafts: { some: { id: DRAFT_ID } },
      },
      data: { status: "FILLED" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox/follow-ups");
  });

  it("omits service/staffMemberId when the draft has no linked appointment", async () => {
    mocks.followUpDraft.findFirst.mockResolvedValue({ clientId: "client_1", appointment: null });
    mocks.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await bookFollowUpSlotAction(DRAFT_ID);

    expect(result).toEqual({ ok: true, bookingUrl: "/calendar/new?client=client_1" });
  });

  it("returns a plain error and never touches the waitlist entry when the draft isn't a bookable slot offer", async () => {
    mocks.followUpDraft.findFirst.mockResolvedValue(null);

    const result = await bookFollowUpSlotAction(DRAFT_ID);

    expect(result).toEqual({ ok: false, error: "This slot offer is no longer available." });
    expect(mocks.waitlistEntry.updateMany).not.toHaveBeenCalled();
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
