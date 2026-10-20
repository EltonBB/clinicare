import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markFollowUpDraftSent: vi.fn(),
  confirmFollowUpDraftDispatch: vi.fn(),
  markFollowUpDraftDelivered: vi.fn(),
  revertFollowUpDraftToPending: vi.fn(),
  sendMessage: vi.fn(),
  mirrorOutboundToInbox: vi.fn(),
  findMany: vi.fn(),
  groupBy: vi.fn(),
  updateMany: vi.fn(),
  getAutomationsCursor: vi.fn(),
  setAutomationsCursor: vi.fn(),
  getAutomationSettings: vi.fn(),
  suppressOpenReminders: vi.fn(),
}));

vi.mock("@/lib/automation-events", () => ({ suppressOpenReminders: mocks.suppressOpenReminders }));

vi.mock("@/lib/automations-data", () => ({ getAutomationSettings: mocks.getAutomationSettings }));

vi.mock("@/lib/follow-up-cursor", () => ({
  getAutomationsCursor: mocks.getAutomationsCursor,
  setAutomationsCursor: mocks.setAutomationsCursor,
}));

vi.mock("@/lib/follow-ups-data", () => ({
  markFollowUpDraftSent: mocks.markFollowUpDraftSent,
  confirmFollowUpDraftDispatch: mocks.confirmFollowUpDraftDispatch,
  markFollowUpDraftDelivered: mocks.markFollowUpDraftDelivered,
  revertFollowUpDraftToPending: mocks.revertFollowUpDraftToPending,
}));
vi.mock("@/lib/messaging", () => ({ sendMessage: mocks.sendMessage }));
vi.mock("@/lib/messaging/inbox-mirror", () => ({ mirrorOutboundToInbox: mocks.mirrorOutboundToInbox }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: { followUpDraft: { findMany: mocks.findMany, groupBy: mocks.groupBy, updateMany: mocks.updateMany } },
}));

import { dispatchDueAutomaticDrafts, dispatchFollowUpDraft } from "./follow-up-dispatch";

const NOW = new Date("2026-10-20T09:00:00.000Z");
const DRAFT = { id: "d_1", kind: "THANK_YOU", body: "Thanks Maya", clientId: "c_1", clientName: "Maya", phone: "+38344111222" };
const SENT = { ok: true, providerMessageId: "m_1", status: "SENT", body: "Thanks Maya" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true, draft: DRAFT });
  mocks.confirmFollowUpDraftDispatch.mockResolvedValue({ ok: true, draft: DRAFT });
  mocks.markFollowUpDraftDelivered.mockResolvedValue(undefined);
  mocks.revertFollowUpDraftToPending.mockResolvedValue(undefined);
  mocks.sendMessage.mockResolvedValue(SENT);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findMany.mockResolvedValue([]);
  mocks.groupBy.mockResolvedValue([]);
  mocks.getAutomationsCursor.mockResolvedValue(null);
  mocks.suppressOpenReminders.mockResolvedValue(undefined);
  mocks.getAutomationSettings.mockResolvedValue(
    new Proxy({}, { get: () => ({ enabled: true, mode: "AUTOMATIC" }) })
  );
  mocks.setAutomationsCursor.mockResolvedValue(undefined);
});

/** Due drafts as the database would return them: grouped per clinic, oldest first. */
function serveDue(drafts: { id: string; businessId: string }[]) {
  mocks.groupBy.mockResolvedValue([...new Set(drafts.map((draft) => draft.businessId))].map((businessId) => ({ businessId })));
  mocks.findMany.mockImplementation(async ({ where, take }: { where: { businessId: string }; take: number }) =>
    drafts
      .filter((draft) => draft.businessId === where.businessId)
      .slice(0, take)
      .map((draft) => ({ id: draft.id }))
  );
}

describe("dispatchFollowUpDraft", () => {
  it("sends a claimed draft once, keyed by its id, and labels the mirrored message", async () => {
    const result = await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1" });

    expect(result).toEqual({ ok: true, clientId: "c_1" });
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: { kind: "freeform", body: "Thanks Maya" }, idempotencyKey: "follow-up:d_1" })
    );
    expect(mocks.mirrorOutboundToInbox).toHaveBeenCalledWith(
      expect.objectContaining({ source: "FOLLOW_UP", automationKind: "THANK_YOU" })
    );
  });

  it("lets a sent booking confirmation stand in for the reminders already due", async () => {
    const confirmation = { ...DRAFT, kind: "BOOKING_CONFIRMATION", appointmentId: "appt_1" };
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: true, draft: confirmation });
    mocks.confirmFollowUpDraftDispatch.mockResolvedValue({ ok: true, draft: confirmation });

    await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1" });

    expect(mocks.suppressOpenReminders).toHaveBeenCalledWith({ businessId: "biz_1", appointmentId: "appt_1" });
  });

  it("doesn't touch reminders after a thank-you", async () => {
    await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1" });

    expect(mocks.suppressOpenReminders).not.toHaveBeenCalled();
  });

  it("sends the text staff approved", async () => {
    await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1", editedBody: "Edited" });

    expect(mocks.markFollowUpDraftSent).toHaveBeenCalledWith(expect.objectContaining({ editedBody: "Edited" }));
    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ message: { kind: "freeform", body: "Edited" } }));
  });

  it("puts the draft back when the provider fails", async () => {
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "provider_error", error: "x" });

    expect(await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1" })).toMatchObject({ ok: false });
    expect(mocks.revertFollowUpDraftToPending).toHaveBeenCalled();
  });

  it("records an uncertain send as sent and never retries it", async () => {
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "delivery_uncertain", error: "x" });

    expect(await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1" })).toMatchObject({ ok: true, notice: expect.any(String) });
    expect(mocks.markFollowUpDraftDelivered).toHaveBeenCalled();
    expect(mocks.revertFollowUpDraftToPending).not.toHaveBeenCalled();
  });

  it("reports a clinic at its sending ceiling", async () => {
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "rate_limited", error: "Wait a minute." });

    expect(await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1" })).toEqual({
      ok: false,
      error: "Wait a minute.",
      rateLimited: true,
      retryable: true,
    });
  });

  it("treats a bad phone number as a failure a retry won't fix", async () => {
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "invalid_recipient", error: "x" });

    expect(await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1" })).toMatchObject({ ok: false, retryable: false });
  });

  it("treats a provider outage as worth retrying", async () => {
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "provider_error", error: "x" });

    expect(await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1" })).toMatchObject({ ok: false, retryable: true });
  });

  it("asks both checks to require the automatic flag on an automatic send", async () => {
    await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1", automatic: true });

    expect(mocks.markFollowUpDraftSent).toHaveBeenCalledWith(expect.objectContaining({ automatic: true }));
    expect(mocks.confirmFollowUpDraftDispatch).toHaveBeenCalledWith(expect.objectContaining({ automatic: true }));
  });

  it("doesn't send automatically once the automation was switched to review", async () => {
    mocks.getAutomationSettings.mockResolvedValue({ THANK_YOU: { enabled: true, mode: "REVIEW" } });

    expect(await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1", automatic: true })).toMatchObject({
      ok: false,
      retryable: false,
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.revertFollowUpDraftToPending).toHaveBeenCalled();
  });

  it("lets staff send a draft whatever the automation's mode", async () => {
    mocks.getAutomationSettings.mockResolvedValue({ THANK_YOU: { enabled: true, mode: "REVIEW" } });

    expect(await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1" })).toMatchObject({ ok: true });
  });

  it("refuses a draft the claim no longer accepts, without sending", async () => {
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: false, error: "This follow-up was already handled." });

    expect(await dispatchFollowUpDraft({ draftId: "d_1", businessId: "biz_1" })).toMatchObject({ ok: false });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe("dispatchDueAutomaticDrafts", () => {
  it("only ever picks drafts made to send on their own, past their delay and a minute old", async () => {
    await dispatchDueAutomaticDrafts({ now: NOW, deadlineAt: Date.now() + 60_000 });

    const where = mocks.groupBy.mock.calls[0][0].where;
    expect(where).toMatchObject({
      status: "PENDING",
      autoSend: true,
      createdAt: { lte: new Date(NOW.getTime() - 60_000), gte: new Date(NOW.getTime() - 3 * 24 * 3_600_000) },
      OR: [{ sendAfter: null }, { sendAfter: { lte: NOW } }],
    });
    expect(where.business).toMatchObject({ whatsappEnabled: true });
  });

  it("hands drafts left unsent for over 3 days to review instead of sending them late", async () => {
    await dispatchDueAutomaticDrafts({ now: NOW, deadlineAt: Date.now() + 60_000 });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { status: "PENDING", autoSend: true, createdAt: { lt: new Date(NOW.getTime() - 3 * 24 * 3_600_000) } },
      data: { autoSend: false },
    });
  });

  it("caps each clinic's sends per run", async () => {
    serveDue(Array.from({ length: 5 }, (_, index) => ({ id: `d_${index}`, businessId: "biz_1" })));

    const result = await dispatchDueAutomaticDrafts({ now: NOW, deadlineAt: Date.now() + 60_000, perBusinessCap: 2 });

    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2, failed: 0 });
  });

  it("stops a clinic at its sending ceiling and carries on with the next", async () => {
    serveDue([
      { id: "a_1", businessId: "biz_a" },
      { id: "a_2", businessId: "biz_a" },
      { id: "b_1", businessId: "biz_b" },
    ]);
    mocks.sendMessage
      .mockResolvedValueOnce({ ok: false, reason: "rate_limited", error: "Wait." })
      .mockResolvedValueOnce(SENT);

    const result = await dispatchDueAutomaticDrafts({ now: NOW, deadlineAt: Date.now() + 60_000 });

    expect(mocks.markFollowUpDraftSent.mock.calls.map(([args]) => args.id)).toEqual(["a_1", "b_1"]);
    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(mocks.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: expect.anything() }) }));
  });

  it("stops sending on its own a draft that can't go out, so it doesn't block the clinic", async () => {
    serveDue([{ id: "d_1", businessId: "biz_1" }]);
    mocks.markFollowUpDraftSent.mockResolvedValue({ ok: false, error: "This follow-up was already handled." });

    await dispatchDueAutomaticDrafts({ now: NOW, deadlineAt: Date.now() + 60_000 });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "d_1", status: "PENDING", autoSend: true },
      data: { autoSend: false },
    });
  });

  it("keeps a draft whose send failed for a passing reason, to try again next run", async () => {
    serveDue([{ id: "d_1", businessId: "biz_1" }]);
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "provider_error", error: "x" });

    await dispatchDueAutomaticDrafts({ now: NOW, deadlineAt: Date.now() + 60_000 });

    expect(mocks.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "d_1" }) }));
  });

  it("serves every clinic, however long another clinic's queue is", async () => {
    serveDue([
      ...Array.from({ length: 300 }, (_, index) => ({ id: `big_${index}`, businessId: "biz_big" })),
      { id: "small_1", businessId: "biz_small" },
    ]);

    await dispatchDueAutomaticDrafts({ now: NOW, deadlineAt: Date.now() + 60_000 });

    const attempted = mocks.markFollowUpDraftSent.mock.calls.map(([args]) => args.id);
    expect(attempted).toContain("small_1");
    expect(attempted.filter((id: string) => id.startsWith("big_"))).toHaveLength(20);
  });

  it("hands a draft with a bad phone number to review after one refusal", async () => {
    serveDue([{ id: "d_1", businessId: "biz_1" }]);
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "invalid_recipient", error: "x" });

    await dispatchDueAutomaticDrafts({ now: NOW, deadlineAt: Date.now() + 60_000 });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "d_1", status: "PENDING", autoSend: true },
      data: { autoSend: false },
    });
  });

  it("resumes the clinic rotation after the last clinic it reached", async () => {
    serveDue([
      { id: "a_1", businessId: "biz_a" },
      { id: "b_1", businessId: "biz_b" },
      { id: "c_1", businessId: "biz_c" },
    ]);
    mocks.getAutomationsCursor.mockResolvedValue("biz_a");

    await dispatchDueAutomaticDrafts({ now: NOW, deadlineAt: Date.now() + 60_000 });

    expect(mocks.markFollowUpDraftSent.mock.calls.map(([args]) => args.id)).toEqual(["b_1", "c_1", "a_1"]);
    expect(mocks.setAutomationsCursor).toHaveBeenCalledWith("biz_a");
  });

  it("starts nothing once the time budget is spent", async () => {
    serveDue([{ id: "d_1", businessId: "biz_1" }]);

    await dispatchDueAutomaticDrafts({ now: NOW, deadlineAt: Date.now() - 1 });

    expect(mocks.markFollowUpDraftSent).not.toHaveBeenCalled();
  });
});
