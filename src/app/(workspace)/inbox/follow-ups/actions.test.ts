import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const followUpDraft = { findFirst: vi.fn() };
  const getAuthedBusiness = vi.fn();
  const markFollowUpDraftSent = vi.fn();
  const revertFollowUpDraftToPending = vi.fn();
  const dismissFollowUpDraft = vi.fn();
  const sendMessage = vi.fn();
  const revalidatePath = vi.fn();
  return {
    followUpDraft,
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

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { dismissFollowUpDraftAction, sendFollowUpDraftAction } from "./actions";

const BUSINESS = { id: "biz_1" };
const DRAFT_ID = "draft_1";
const ALREADY_HANDLED_ERROR = "This follow-up was already handled.";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthedBusiness.mockResolvedValue({ business: BUSINESS, user: {} });
});

describe("sendFollowUpDraftAction", () => {
  it("sends successfully", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true });
    mocks.followUpDraft.findFirst.mockResolvedValue({
      id: DRAFT_ID,
      body: "Hi Alex, quick note about your next visit.",
      client: { phone: "+15550100" },
    });
    mocks.sendMessage.mockResolvedValue({
      ok: true,
      providerMessageId: "msg_1",
      status: "SENT",
      body: "Hi Alex, quick note about your next visit.",
    });

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
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox/follow-ups");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox");
  });

  it("sends the edited body when an override is provided, instead of the stored draft body", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true });
    mocks.followUpDraft.findFirst.mockResolvedValue({
      id: DRAFT_ID,
      body: "Original draft body",
      client: { phone: "+15550100" },
    });
    mocks.sendMessage.mockResolvedValue({
      ok: true,
      providerMessageId: "msg_1",
      status: "SENT",
      body: "Edited body",
    });

    const result = await sendFollowUpDraftAction(DRAFT_ID, "Edited body");

    expect(result).toEqual({ ok: true });
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { kind: "freeform", body: "Edited body" },
      })
    );
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
