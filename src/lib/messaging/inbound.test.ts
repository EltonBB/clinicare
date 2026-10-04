import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const message = { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() };
  const client = { findMany: vi.fn() };
  const conversation = { upsert: vi.fn(), findMany: vi.fn() };
  const appointment = { findMany: vi.fn() };
  const followUpDraft = { findFirst: vi.fn() };
  const $transaction = vi.fn();
  const confirmAppointmentCore = vi.fn();
  const cancelAppointmentCore = vi.fn();
  const notifyStaffOfAppointmentChange = vi.fn();
  const revalidateCalendarSurfaces = vi.fn();
  const sendMessage = vi.fn();
  return {
    message,
    client,
    conversation,
    appointment,
    followUpDraft,
    $transaction,
    confirmAppointmentCore,
    cancelAppointmentCore,
    notifyStaffOfAppointmentChange,
    revalidateCalendarSurfaces,
    sendMessage,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: mocks.message,
    conversation: mocks.conversation,
    client: mocks.client,
    appointment: mocks.appointment,
    followUpDraft: mocks.followUpDraft,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/lib/appointments-shared", () => ({
  confirmAppointmentCore: mocks.confirmAppointmentCore,
  cancelAppointmentCore: mocks.cancelAppointmentCore,
  notifyStaffOfAppointmentChange: mocks.notifyStaffOfAppointmentChange,
  revalidateCalendarSurfaces: mocks.revalidateCalendarSurfaces,
}));

vi.mock("@/lib/messaging", () => ({
  sendMessage: mocks.sendMessage,
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { applyInboundReplyIntent, recordInboundMessage, recoverAbandonedReplyIntents } from "./inbound";

beforeEach(() => {
  vi.clearAllMocks();
  // No open slot offer by default — the reply-intent tests below run the
  // normal confirm/cancel path unless a test opens one.
  mocks.followUpDraft.findFirst.mockResolvedValue(null);
  // Claiming a message for its reply-intent check succeeds (and releasing one does
  // too), unless a test says another delivery got there first.
  mocks.message.updateMany.mockResolvedValue({ count: 1 });
  // Only the claim-lost path reads the message back; each such test says what it holds.
  mocks.message.findUnique.mockReset();
  mocks.$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) =>
      cb({ conversation: mocks.conversation, message: mocks.message })
  );
});

describe("recordInboundMessage", () => {
  it("ignores an empty body without touching the database", async () => {
    const result = await recordInboundMessage({
      businessId: "biz_1",
      fromPhone: "+38344123456",
      body: "   ",
      providerMessageId: "M1",
    });
    expect(result).toEqual({ recorded: false, reason: "empty_body" });
    expect(mocks.message.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a recipient with too few digits", async () => {
    const result = await recordInboundMessage({
      businessId: "biz_1",
      fromPhone: "12",
      body: "hello",
      providerMessageId: "M1",
    });
    expect(result).toEqual({ recorded: false, reason: "invalid_phone" });
    expect(mocks.message.findFirst).not.toHaveBeenCalled();
  });

  it("skips a duplicate provider message id idempotently, returning the client it was actually stored under (Codex #130: a worker retry needs a clientId to retry the reply-intent step)", async () => {
    mocks.message.findFirst.mockResolvedValue({ id: "existing", clientId: "client_9" });
    // A different client now matches this phone than the one the message was
    // originally stored under — proves the stored value wins over a fresh
    // re-resolve, which could hand a retried "2" reply to the wrong client's
    // appointment if the phone was reassigned in between (Codex #131).
    mocks.client.findMany.mockResolvedValue([{ id: "client_other", name: "Someone Else" }]);
    const result = await recordInboundMessage({
      businessId: "biz_1",
      fromPhone: "+38344123456",
      body: "hello",
      providerMessageId: "M1",
    });
    expect(result).toEqual({ recorded: false, reason: "duplicate", clientId: "client_9", messageId: "existing" });
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it("skips a duplicate whose stored message has no resolved client (none matched, or more than one shared the phone, when it was first recorded)", async () => {
    mocks.message.findFirst.mockResolvedValue({ id: "existing", clientId: null });
    // recordInboundMessage still runs the phoneKey lookup unconditionally
    // before the dedup check (it's needed for the non-duplicate path), so
    // this must be mocked even though this test's assertion doesn't depend
    // on its result — an unmocked call returns undefined, not [].
    mocks.client.findMany.mockResolvedValue([]);
    const result = await recordInboundMessage({
      businessId: "biz_1",
      fromPhone: "+38344123456",
      body: "hello",
      providerMessageId: "M1",
    });
    expect(result).toEqual({ recorded: false, reason: "duplicate", clientId: null, messageId: "existing" });
  });

  it("threads onto the phoneKey conversation and links the matching client", async () => {
    mocks.message.findFirst.mockResolvedValue(null);
    mocks.client.findMany.mockResolvedValue([{ id: "client_9", name: "Mira" }]);
    mocks.conversation.upsert.mockResolvedValue({ id: "conv_1" });
    mocks.message.create.mockResolvedValue({ id: "msg_1" });

    const result = await recordInboundMessage({
      businessId: "biz_1",
      fromPhone: "+383 44 123 456",
      body: "  See you then  ",
      providerMessageId: "M2",
    });

    expect(result).toEqual({ recorded: true, conversationId: "conv_1", clientId: "client_9", messageId: "msg_1" });

    expect(mocks.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId_phoneKey: { businessId: "biz_1", phoneKey: "38344123456" },
        },
      })
    );
    expect(mocks.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv_1",
          clientId: "client_9",
          direction: "INBOUND",
          body: "See you then",
          providerMessageSid: "M2",
        }),
      })
    );
  });

  it("treats two clients sharing a phoneKey as no confident match, but still records the message", async () => {
    mocks.message.findFirst.mockResolvedValue(null);
    // A family sharing one phone: two distinct Client rows in the same
    // business both match this phoneKey (phoneKey is indexed, not unique).
    mocks.client.findMany.mockResolvedValue([
      { id: "client_a", name: "Parent" },
      { id: "client_b", name: "Child" },
    ]);
    mocks.conversation.upsert.mockResolvedValue({ id: "conv_shared" });
    mocks.message.create.mockResolvedValue({ id: "msg_shared" });

    const result = await recordInboundMessage({
      businessId: "biz_1",
      fromPhone: "+38344123456",
      body: "2",
      providerMessageId: "M3",
    });

    // The message is still recorded and threaded normally — only the client
    // identity is left ambiguous (null), same as the no-match case.
    expect(result).toEqual({ recorded: true, conversationId: "conv_shared", clientId: null, messageId: "msg_shared" });
    expect(mocks.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversationId: "conv_shared", clientId: null }),
      })
    );
  });
  describe("a delivery that loses the race on the unique providerMessageSid (P2002)", () => {
    const raceError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

    it("reports a duplicate carrying the winner's messageId and its own stored client, not a fresh phone re-resolve", async () => {
      mocks.message.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "winner", clientId: "client_9" });
      // A different client now matches this phone than the winning row was
      // actually stored under — same regression this round closed on the
      // plain duplicate branch above, proven here too (Codex #131).
      mocks.client.findMany.mockResolvedValue([{ id: "client_other", name: "Someone Else" }]);
      mocks.$transaction.mockRejectedValueOnce(raceError);

      const result = await recordInboundMessage({
        businessId: "biz_1",
        fromPhone: "+38344123456",
        body: "1",
        providerMessageId: "M9",
      });

      expect(result).toEqual({ recorded: false, reason: "duplicate", clientId: "client_9", messageId: "winner" });
    });

    it("falls back to a null messageId (rather than throwing) if the winning row is gone by the second look", async () => {
      mocks.message.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mocks.client.findMany.mockResolvedValue([]);
      mocks.$transaction.mockRejectedValueOnce(raceError);

      const result = await recordInboundMessage({
        businessId: "biz_1",
        fromPhone: "+38344123456",
        body: "1",
        providerMessageId: "M9",
      });

      expect(result).toEqual({ recorded: false, reason: "duplicate", clientId: null, messageId: null });
    });
  });
});

describe("applyInboundReplyIntent", () => {
  const NOW = new Date("2026-07-01T12:00:00Z");
  // The check compares a matched visit's start with the real clock, so the
  // clock is pinned to the replies' time.
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());
  const REMINDED_UPCOMING = {
    id: "appt_1",
    startAt: new Date("2026-07-02T09:00:00Z"),
    staffMemberId: "staff_1",
    status: "PENDING" as const,
    client: { phone: "+38344123456", name: "Mira" },
  };

  it("does nothing when the body has no intent", async () => {
    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "hello", now: NOW });
    expect(result).toEqual({ applied: false, reason: "no_intent" });
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });

  it("does nothing when the phone didn't match a client", async () => {
    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: null, body: "1", now: NOW });
    expect(result).toEqual({ applied: false, reason: "no_client" });
  });

  it("does nothing when there's no unambiguous match", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([]);
    expect(await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW })).toEqual({
      applied: false,
      reason: "no_match",
    });

    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING, { ...REMINDED_UPCOMING, id: "appt_2" }]);
    expect(await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW })).toEqual({
      applied: false,
      reason: "ambiguous",
    });
  });

  it("confirms the one unambiguous match, sends a confirmation, mirrors it to the inbox, and revalidates", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.confirmAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });
    mocks.sendMessage.mockResolvedValueOnce({
      ok: true,
      providerMessageId: "wamid_confirm",
      status: "SENT",
      body: "You're confirmed for 09:00 on July 2, 2026. See you then!",
    });
    mocks.conversation.upsert.mockResolvedValueOnce({ id: "conv_confirm" });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "yes", now: NOW });

    expect(result).toEqual({ applied: true, intent: "confirm", appointmentId: "appt_1" });
    expect(mocks.confirmAppointmentCore).toHaveBeenCalledWith({ id: "appt_1", businessId: "biz_1" });
    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: "WHATSAPP", to: "+38344123456" }));
    // Finding 3: the automatic confirm reply is mirrored into the client's inbox
    // thread, same shape as reminders.ts/sendInboxMessageAction.
    expect(mocks.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv_confirm",
          clientId: "client_1",
          direction: "OUTBOUND",
          body: "You're confirmed for 09:00 on July 2, 2026. See you then!",
          providerMessageSid: "wamid_confirm",
          deliveryStatus: "SENT",
        }),
      })
    );
    // Finding 2: the confirm branch now revalidates the calendar surfaces too
    // (the cancel branch already did).
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalledWith(["client_1"], ["staff_1"]);
  });

  // Codex #130: a delivery the worker retries can reach the acknowledgement again (a
  // confirm then takes the already-confirmed path); the patient's own message names it,
  // so the second answer is a replay, not a second WhatsApp message.
  it("keys the acknowledgement by the patient's message, and sends unkeyed without one", async () => {
    for (let run = 0; run < 2; run += 1) {
      mocks.appointment.findMany.mockResolvedValueOnce([{ ...REMINDED_UPCOMING, status: "CONFIRMED" }]);
      mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });
    }

    await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", messageId: "msg_in_1", now: NOW });
    expect(mocks.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ idempotencyKey: "reply-ack:msg_in_1" }));

    await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW });
    expect(mocks.sendMessage).toHaveBeenLastCalledWith(expect.not.objectContaining({ idempotencyKey: expect.anything() }));
  });

  it("doesn't mirror an acknowledgement whose delivery is uncertain, and still applies the confirm", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.confirmAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });
    mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "delivery_uncertain", error: "x" });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW });

    expect(result).toEqual({ applied: true, intent: "confirm", appointmentId: "appt_1" });
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.message.create).not.toHaveBeenCalled();
  });

  it("acknowledges a 1 on an already-confirmed appointment without touching it", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([{ ...REMINDED_UPCOMING, status: "CONFIRMED" }]);
    mocks.sendMessage.mockResolvedValueOnce({
      ok: true,
      providerMessageId: "wamid_again",
      status: "SENT",
      body: "You're confirmed for 09:00 on July 2, 2026. See you then!",
    });
    mocks.conversation.upsert.mockResolvedValueOnce({ id: "conv_again" });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW });

    expect(result).toEqual({ applied: false, reason: "already_confirmed" });
    expect(mocks.confirmAppointmentCore).not.toHaveBeenCalled();
    expect(mocks.revalidateCalendarSurfaces).not.toHaveBeenCalled();
    // the answer still lands in the client's Inbox thread like the other automatic replies
    expect(mocks.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversationId: "conv_again", direction: "OUTBOUND", providerMessageSid: "wamid_again" }),
      })
    );
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+38344123456",
        message: expect.objectContaining({ body: expect.stringContaining("You're confirmed for") }),
      })
    );
  });

  it("with one pending and one confirmed visit, a 1 confirms the pending one", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([
      { ...REMINDED_UPCOMING, id: "appt_confirmed", status: "CONFIRMED" },
      REMINDED_UPCOMING,
    ]);
    mocks.confirmAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });
    mocks.sendMessage.mockResolvedValueOnce({ ok: true, providerMessageId: "wamid_p", status: "SENT", body: "You're confirmed" });
    mocks.conversation.upsert.mockResolvedValueOnce({ id: "conv_p" });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW });

    expect(result).toEqual({ applied: true, intent: "confirm", appointmentId: "appt_1" });
    expect(mocks.confirmAppointmentCore).toHaveBeenCalledWith({ id: "appt_1", businessId: "biz_1" });
  });

  it("stays silent on a 1 when several visits are already confirmed (no way to tell which)", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([
      { ...REMINDED_UPCOMING, id: "appt_a", status: "CONFIRMED" },
      { ...REMINDED_UPCOMING, id: "appt_b", status: "CONFIRMED" },
    ]);

    expect(await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW })).toEqual({
      applied: false,
      reason: "ambiguous",
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("cancels the one unambiguous match, sends a confirmation, mirrors it to the inbox, and notifies staff", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.cancelAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });
    mocks.sendMessage.mockResolvedValueOnce({
      ok: true,
      providerMessageId: "wamid_cancel",
      status: "SENT",
      body: "Your appointment on July 2, 2026 at 09:00 has been cancelled.",
    });
    mocks.conversation.upsert.mockResolvedValueOnce({ id: "conv_cancel" });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "2", now: NOW });

    expect(result).toEqual({ applied: true, intent: "cancel", appointmentId: "appt_1" });
    expect(mocks.notifyStaffOfAppointmentChange).toHaveBeenCalledWith("biz_1", "staff_1", "appt_1", "changed");
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalledWith(["client_1"], ["staff_1"]);
    // Finding 3: the automatic cancel reply is mirrored into the client's inbox
    // thread too.
    expect(mocks.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv_cancel",
          clientId: "client_1",
          direction: "OUTBOUND",
          body: "Your appointment on July 2, 2026 at 09:00 has been cancelled.",
          providerMessageSid: "wamid_cancel",
          deliveryStatus: "SENT",
        }),
      })
    );
  });

  it("does not fail the confirm outcome when the inbox mirror write throws", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.confirmAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });
    mocks.sendMessage.mockResolvedValueOnce({
      ok: true,
      providerMessageId: "wamid_confirm",
      status: "SENT",
      body: "You're confirmed for 09:00 on July 2, 2026. See you then!",
    });
    mocks.conversation.upsert.mockRejectedValueOnce(new Error("db unavailable"));

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "yes", now: NOW });

    // The mirror write is best-effort — its failure must not surface as a
    // failed confirm.
    expect(result).toEqual({ applied: true, intent: "confirm", appointmentId: "appt_1" });
  });

  it.each([
    ["yes", "confirm"],
    ["2", "cancel"],
  ])("stands down on %j while the client has an open slot offer — nothing is confirmed or cancelled", async (body) => {
    mocks.followUpDraft.findFirst.mockResolvedValueOnce({ sentAt: NOW }); // delivered

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body, now: NOW });

    expect(result).toEqual({ applied: false, reason: "open_offer" });
    // Scoped to this client in this business: a SENT offer that is still
    // live — its entry still holds it and the offered slot is still
    // cancelled and ahead — for however long that lasts, with no separate
    // time cutoff of its own (Codex #130: a prior 48-hour cutoff on top of
    // this liveness check could let a still-live offer's late reply fall
    // through and act on an unrelated appointment instead).
    expect(mocks.followUpDraft.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        clientId: "client_1",
        kind: "SLOT_OFFER",
        status: "SENT",
        waitlistEntry: { status: "OFFERED" },
        appointment: {
          status: "CANCELLED",
          startAt: { gt: NOW },
          OR: [{ staffMemberId: null }, { staffMember: { isActive: true, status: { not: "INACTIVE" } } }],
        },
        client: { isArchived: false, status: { notIn: ["INACTIVE", "ARCHIVED"] } },
      },
      // A delivered offer wins over one still being sent.
      select: { sentAt: true },
      orderBy: { sentAt: { sort: "desc", nulls: "last" } },
    });
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
    expect(mocks.confirmAppointmentCore).not.toHaveBeenCalled();
    expect(mocks.cancelAppointmentCore).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  // Codex #130: an offer with no recorded delivery is either still on its way
  // or went out with its delivery write failed. Acting on the reminder could
  // confirm or cancel the wrong visit; standing down for good could drop a
  // reply meant for the reminder. So the reply is handed back for a retry.
  it("neither acts nor stands down while an offer to the client is still being sent", async () => {
    mocks.followUpDraft.findFirst.mockResolvedValueOnce({ sentAt: null });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "yes", now: NOW });

    expect(result).toEqual({ applied: false, reason: "offer_sending" });
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
    expect(mocks.confirmAppointmentCore).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("releases the message's claim and reports it in progress (so the worker retries) while the offer is being sent", async () => {
    vi.useFakeTimers({ now: NOW });
    mocks.followUpDraft.findFirst.mockResolvedValueOnce({ sentAt: null });

    const result = await applyInboundReplyIntent({
      businessId: "biz_1",
      clientId: "client_1",
      body: "2",
      messageId: "msg_1",
      now: NOW,
    });

    expect(result).toEqual({ applied: false, reason: "in_progress" });
    expect(mocks.message.updateMany).toHaveBeenLastCalledWith({
      where: { id: "msg_1", replyIntentLeaseUntil: new Date(NOW.getTime() + 2 * 60 * 1000) },
      data: { replyIntentLeaseUntil: null },
    });
    expect(mocks.cancelAppointmentCore).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("ends the stand-down once the offer is no longer live (its slot passed, or the appointment is back on)", async () => {
    // The live-offer filter finds nothing for an offer whose slot has passed
    // (appointment.startAt <= now) or whose appointment was un-cancelled — so
    // the reply acts on the reminder as usual.
    mocks.followUpDraft.findFirst.mockResolvedValueOnce(null);
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.cancelAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });
    mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "2", now: NOW });

    const [{ where }] = mocks.followUpDraft.findFirst.mock.calls[0];
    expect(where.appointment).toEqual({
      status: "CANCELLED",
      startAt: { gt: NOW },
      OR: [{ staffMemberId: null }, { staffMember: { isActive: true, status: { not: "INACTIVE" } } }],
    });
    expect(result).toEqual({ applied: true, intent: "cancel", appointmentId: "appt_1" });
  });

  it("keeps the normal confirm path when the client has no open slot offer", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.confirmAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });
    mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "yes", now: NOW });

    expect(mocks.followUpDraft.findFirst).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ applied: true, intent: "confirm", appointmentId: "appt_1" });
  });

  it("reports no_match instead of throwing when the guarded mutation itself found nothing to change", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.confirmAppointmentCore.mockResolvedValueOnce({ ok: false, status: 409, error: "conflict" });
    expect(await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW })).toEqual({
      applied: false,
      reason: "no_match",
    });
  });

  // CodeRabbit #130: the worker retries a delivery when the app's 200 is lost in
  // transit, or gives up after 10s while the first request is still running.
  // Without a per-message claim the retry re-runs the check against the
  // appointment the first attempt already confirmed and sends the patient the
  // "you're confirmed" message again.
  describe("per-message claim (a worker retry must not re-send a reply)", () => {
    const LEASE_END = new Date(NOW.getTime() + 2 * 60 * 1000);
    // Claimable when nobody has finished it and no lease is running: never
    // leased, released, or leased by a check that died (Codex #130).
    const CLAIM = {
      where: {
        id: "msg_1",
        replyIntentHandledAt: null,
        OR: [{ replyIntentLeaseUntil: null }, { replyIntentLeaseUntil: { lte: NOW } }],
      },
      data: { replyIntentLeaseUntil: LEASE_END },
    };
    // Release and finish touch only this run's own lease.
    const OWN_LEASE = { id: "msg_1", replyIntentLeaseUntil: LEASE_END };
    const FINISH = { where: OWN_LEASE, data: { replyIntentHandledAt: NOW, replyIntentLeaseUntil: null } };
    const RELEASE = { where: OWN_LEASE, data: { replyIntentLeaseUntil: null } };
    const args = { businessId: "biz_1", clientId: "client_1", body: "1", messageId: "msg_1", now: NOW };
    const claimedBy = (replyIntentHandledAt: Date | null, replyIntentLeaseUntil: Date | null = null) => {
      mocks.message.updateMany.mockResolvedValueOnce({ count: 0 });
      mocks.message.findUnique.mockResolvedValueOnce({ replyIntentHandledAt, replyIntentLeaseUntil });
    };

    beforeEach(() => vi.useFakeTimers({ now: NOW }));
    afterEach(() => vi.useRealTimers());

    it("skips everything, including the reply, when another delivery already handled this message", async () => {
      claimedBy(new Date(NOW.getTime() - 5_000)); // finished 5s before this retry

      const result = await applyInboundReplyIntent(args);

      expect(result).toEqual({ applied: false, reason: "already_handled" });
      expect(mocks.message.updateMany).toHaveBeenCalledTimes(1);
      expect(mocks.message.updateMany).toHaveBeenCalledWith(CLAIM);
      expect(mocks.appointment.findMany).not.toHaveBeenCalled();
      expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    // Codex #130: a retry that overlaps a still-running first delivery used to
    // be told "already handled" (200), ending the worker's retries; if that
    // first delivery then failed and released its claim, nothing ever applied
    // the reply. It is now "in_progress", which the webhook answers with a 5xx.
    // Codex #130 (again): answering each overlapping retry at once spent the
    // worker's four attempts (1/2/4s apart) in ~17s — before a check whose
    // acknowledgement send can take 25s could fail and release its claim. A
    // retry now waits for the running check, up to 8s, before answering.
    describe("a retry that finds the check still running", () => {
      const RUNNING = new Date(NOW.getTime() + 2 * 60 * 1000 - 10_000); // claimed 10s before this retry

      it("waits for it, then reports it in progress (not handled) without doing anything itself", async () => {
        mocks.message.updateMany.mockResolvedValue({ count: 0 });
        mocks.message.findUnique.mockResolvedValue({ replyIntentHandledAt: null, replyIntentLeaseUntil: RUNNING });

        const pending = applyInboundReplyIntent(args);
        await vi.advanceTimersByTimeAsync(7_000);
        let settled = false;
        void pending.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false); // still waiting inside its 8s

        await vi.advanceTimersByTimeAsync(1_500);
        expect(await pending).toEqual({ applied: false, reason: "in_progress" });
        expect(mocks.message.findUnique.mock.calls.length).toBeGreaterThan(10); // polled while waiting
        expect(mocks.appointment.findMany).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
      });

      it("does the work itself when the running check fails and releases its claim while it waits", async () => {
        claimedBy(null, RUNNING); // then the next claim attempt succeeds (the default)
        mocks.appointment.findMany.mockResolvedValueOnce([{ ...REMINDED_UPCOMING, status: "CONFIRMED" }]);
        mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });

        const pending = applyInboundReplyIntent(args);
        await vi.advanceTimersByTimeAsync(500);

        expect(await pending).toEqual({ applied: false, reason: "already_confirmed" });
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
      });

      it("reports it handled once the running check finishes while it waits", async () => {
        mocks.message.updateMany.mockResolvedValue({ count: 0 });
        mocks.message.findUnique
          .mockResolvedValueOnce({ replyIntentHandledAt: null, replyIntentLeaseUntil: RUNNING })
          .mockResolvedValueOnce({ replyIntentHandledAt: new Date(NOW.getTime() + 300), replyIntentLeaseUntil: null });

        const pending = applyInboundReplyIntent(args);
        await vi.advanceTimersByTimeAsync(500);

        expect(await pending).toEqual({ applied: false, reason: "already_handled" });
        expect(mocks.sendMessage).not.toHaveBeenCalled();
      });
    });

    // Codex #130: a check whose instance died left its lease behind, and once
    // that lease got close enough to the retry's clock it read as handled for
    // good - the reply was never applied. "Handled" is now its own column, and
    // a lease that has run out is claimed again.
    it("reads it as handled from the handled mark alone, whatever its time", async () => {
      claimedBy(new Date(NOW.getTime() + 60 * 60 * 1000)); // even an hour ahead (clock difference)

      expect(await applyInboundReplyIntent(args)).toEqual({ applied: false, reason: "already_handled" });
      expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it("takes over a claim whose lease ran out without the check finishing, and does the work", async () => {
      claimedBy(null, new Date(NOW.getTime() - 1)); // the check that held it died
      mocks.appointment.findMany.mockResolvedValueOnce([{ ...REMINDED_UPCOMING, status: "CONFIRMED" }]);
      mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });

      expect(await applyInboundReplyIntent(args)).toEqual({ applied: false, reason: "already_confirmed" });
      expect(mocks.message.updateMany).toHaveBeenNthCalledWith(2, CLAIM); // at once, no wait
      expect(mocks.message.updateMany).toHaveBeenNthCalledWith(3, FINISH);
    });

    it("claims it at once when the claim was released between its two reads, and does the work", async () => {
      claimedBy(null, null);
      mocks.appointment.findMany.mockResolvedValueOnce([{ ...REMINDED_UPCOMING, status: "CONFIRMED" }]);
      mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });

      expect(await applyInboundReplyIntent(args)).toEqual({ applied: false, reason: "already_confirmed" });
      expect(mocks.message.updateMany).toHaveBeenNthCalledWith(2, CLAIM);
    });

    it("treats a message deleted since as handled — nothing left to act on", async () => {
      mocks.message.updateMany.mockResolvedValueOnce({ count: 0 });
      mocks.message.findUnique.mockResolvedValueOnce(null);

      expect(await applyInboundReplyIntent(args)).toEqual({ applied: false, reason: "already_handled" });
      expect(mocks.message.findUnique).toHaveBeenCalledTimes(1);
    });

    it("marks the claim finished once the check completes, so later retries read it as handled", async () => {
      mocks.appointment.findMany.mockResolvedValueOnce([{ ...REMINDED_UPCOMING, status: "CONFIRMED" }]);
      mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });

      await applyInboundReplyIntent(args);

      expect(mocks.message.updateMany).toHaveBeenNthCalledWith(1, CLAIM);
      expect(mocks.message.updateMany).toHaveBeenNthCalledWith(2, FINISH);
    });

    it("still returns the outcome when marking the claim finished fails — the work is already done", async () => {
      mocks.appointment.findMany.mockResolvedValueOnce([{ ...REMINDED_UPCOMING, status: "CONFIRMED" }]);
      mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });
      mocks.message.updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error("finish failed"));

      expect(await applyInboundReplyIntent(args)).toEqual({ applied: false, reason: "already_confirmed" });
    });

    it("claims the message before doing anything else, then runs the check and keeps the claim", async () => {
      const order: string[] = [];
      mocks.message.updateMany.mockImplementationOnce(async () => {
        order.push("claim");
        return { count: 1 };
      });
      mocks.appointment.findMany.mockImplementationOnce(async () => {
        order.push("lookup");
        return [REMINDED_UPCOMING];
      });
      mocks.confirmAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });
      mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });

      const result = await applyInboundReplyIntent({ ...args, body: "yes" });

      expect(result).toEqual({ applied: true, intent: "confirm", appointmentId: "appt_1" });
      expect(order).toEqual(["claim", "lookup"]);
      // claimed, then marked finished — never released: the message stays handled
      expect(mocks.message.updateMany).not.toHaveBeenCalledWith(RELEASE);
    });

    it("keeps the claim whatever the non-throwing outcome, so an already-confirmed acknowledgement is only ever sent once", async () => {
      mocks.appointment.findMany.mockResolvedValueOnce([{ ...REMINDED_UPCOMING, status: "CONFIRMED" }]);
      mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });

      const result = await applyInboundReplyIntent(args);

      expect(result).toEqual({ applied: false, reason: "already_confirmed" });
      expect(mocks.message.updateMany).not.toHaveBeenCalledWith(RELEASE);
    });

    it("releases the claim and rethrows when the check throws, so the retry can do the work", async () => {
      mocks.appointment.findMany.mockRejectedValueOnce(new Error("transient database failure"));

      await expect(applyInboundReplyIntent(args)).rejects.toThrow("transient database failure");

      expect(mocks.message.updateMany).toHaveBeenCalledTimes(2);
      expect(mocks.message.updateMany).toHaveBeenNthCalledWith(1, CLAIM);
      expect(mocks.message.updateMany).toHaveBeenNthCalledWith(2, RELEASE);
    });

    it("still surfaces the original error when releasing the claim fails too", async () => {
      mocks.appointment.findMany.mockRejectedValueOnce(new Error("transient database failure"));
      mocks.message.updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error("release failed"));

      await expect(applyInboundReplyIntent(args)).rejects.toThrow("transient database failure");
    });

    it("does not write to the message for ordinary chat text or an unmatched client (nothing to act on)", async () => {
      mocks.appointment.findMany.mockResolvedValue([]);

      expect(await applyInboundReplyIntent({ ...args, body: "hello, are you open on Saturday?" })).toEqual({
        applied: false,
        reason: "no_intent",
      });
      expect(await applyInboundReplyIntent({ ...args, clientId: null })).toEqual({ applied: false, reason: "no_client" });

      expect(mocks.message.updateMany).not.toHaveBeenCalled();
    });

    it("does not touch the message at all when no messageId is given (direct callers unchanged)", async () => {
      mocks.appointment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW });
      await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", messageId: null, now: NOW });

      expect(mocks.message.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe("recoverAbandonedReplyIntents", () => {
  const NOW = new Date("2026-07-01T12:00:00Z");
  const SENT_AT = new Date(NOW.getTime() - 60 * 60 * 1000); // the reply came in an hour ago
  const ABANDONED_WHERE = {
    direction: "INBOUND",
    replyIntentHandledAt: null,
    replyIntentLeaseUntil: { lte: NOW, gt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000) },
  };
  const abandoned = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    clientId: "client_1",
    body: "1",
    sentAt: SENT_AT,
    ...overrides,
  });
  // The abandoned replies of each workspace, oldest first.
  const serve = (byWorkspace: Record<string, Array<ReturnType<typeof abandoned>>>) => {
    mocks.conversation.findMany.mockResolvedValue(Object.keys(byWorkspace).sort().map((businessId) => ({ businessId })));
    mocks.message.findMany.mockImplementation(
      async ({ where }: { where: { conversation: { businessId: string } } }) =>
        byWorkspace[where.conversation.businessId] ?? []
    );
  };

  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("finds the workspaces with unfinished replies whose lease ran out in the last day, then each one's oldest", async () => {
    serve({ biz_1: [] });

    expect(await recoverAbandonedReplyIntents(NOW)).toEqual({ recovered: 0 });
    expect(mocks.conversation.findMany).toHaveBeenCalledWith({
      where: { messages: { some: ABANDONED_WHERE } },
      select: { businessId: true },
      distinct: ["businessId"],
      orderBy: { businessId: "asc" },
    });
    expect(mocks.message.findMany).toHaveBeenCalledWith({
      where: { ...ABANDONED_WHERE, conversation: { businessId: "biz_1" } },
      select: { id: true, clientId: true, body: true, sentAt: true },
      orderBy: { replyIntentLeaseUntil: "asc" },
      take: 20,
    });
  });

  it("does nothing more when no workspace has anything to recover", async () => {
    serve({});

    expect(await recoverAbandonedReplyIntents(NOW)).toEqual({ recovered: 0 });
    expect(mocks.message.findMany).not.toHaveBeenCalled();
  });

  // Codex #133: oldest-first across every workspace let one backlog fill each
  // batch while another workspace's replies aged out of the window.
  describe("workspaces take turns", () => {
    const order = () => mocks.message.updateMany.mock.calls.map(([args]) => (args as { where: { id: string } }).where.id);

    beforeEach(() => {
      // No reminded visit to act on: each check just claims and finishes.
      mocks.appointment.findMany.mockResolvedValue([]);
    });

    it("deals the batch round-robin across workspaces, oldest first within each", async () => {
      serve({
        biz_a: [abandoned("a1"), abandoned("a2"), abandoned("a3")],
        biz_b: [abandoned("b1")],
      });
      // An hour whose turn leads with the first workspace.
      vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));

      await recoverAbandonedReplyIntents(new Date("2026-07-01T00:00:00Z"));

      // Each check claims (1st write) then finishes (2nd write).
      expect(order().filter((_, index) => index % 2 === 0)).toEqual(["a1", "b1", "a2", "a3"]);
    });

    it("caps the batch at 20, so one workspace's backlog can't take a turn from the others", async () => {
      serve({
        biz_a: Array.from({ length: 20 }, (_, index) => abandoned(`a${index}`)),
        biz_b: Array.from({ length: 20 }, (_, index) => abandoned(`b${index}`)),
        biz_c: [abandoned("c1")],
      });

      await recoverAbandonedReplyIntents(NOW);

      // Rounds of three, then of two: the cap cuts the last round short.
      const claimed = order().filter((_, index) => index % 2 === 0);
      expect(claimed).toHaveLength(20);
      expect(claimed).toContain("c1");
    });

    it("lets a different workspace lead each hour", async () => {
      serve({ biz_a: [abandoned("a1")], biz_b: [abandoned("b1")] });
      const oddHour = new Date("2026-07-01T01:00:00Z");
      vi.setSystemTime(oddHour);

      await recoverAbandonedReplyIntents(oddHour);

      expect(order()[0]).toBe("b1");
    });
  });

  it("runs the reply check again for each, through the usual claim", async () => {
    serve({ biz_1: [abandoned("msg_1")] });
    mocks.appointment.findMany.mockResolvedValueOnce([
      {
        id: "appt_1",
        startAt: new Date("2026-07-02T09:00:00Z"),
        staffMemberId: "staff_1",
        status: "PENDING",
        client: { phone: "+38344123456", name: "Mira" },
      },
    ]);
    mocks.confirmAppointmentCore.mockResolvedValueOnce({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: "staff_1",
      changed: true,
    });
    mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });

    expect(await recoverAbandonedReplyIntents(NOW)).toEqual({ recovered: 1 });
    expect(mocks.confirmAppointmentCore).toHaveBeenCalledWith({ id: "appt_1", businessId: "biz_1" });
    expect(mocks.message.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "msg_1",
        replyIntentHandledAt: null,
        OR: [{ replyIntentLeaseUntil: null }, { replyIntentLeaseUntil: { lte: NOW } }],
      },
      data: { replyIntentLeaseUntil: new Date(NOW.getTime() + 2 * 60 * 1000) },
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "reply-ack:msg_1" }));
  });

  it("closes a claim with nothing left to act on (client deleted) without running the check", async () => {
    serve({ biz_1: [abandoned("msg_1", { clientId: null })] });

    await recoverAbandonedReplyIntents(NOW);

    expect(mocks.message.updateMany).toHaveBeenCalledWith({
      where: { id: "msg_1", replyIntentHandledAt: null },
      data: { replyIntentHandledAt: NOW, replyIntentLeaseUntil: null },
    });
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });

  it("matches each reply as of when it was sent, not as of the sweep", async () => {
    serve({ biz_1: [abandoned("msg_1", { body: "2" })] });
    mocks.appointment.findMany.mockResolvedValueOnce([]);

    await recoverAbandonedReplyIntents(NOW);

    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ startAt: { gt: SENT_AT } }) })
    );
  });

  // Codex #133: recovered late, a reply could otherwise match a booking staff
  // made after it (a manual cancel-and-rebook) and cancel that one instead.
  it("only matches bookings that existed, and had been reminded, when the reply was sent", async () => {
    serve({ biz_1: [abandoned("msg_1", { body: "2" })] });
    mocks.appointment.findMany.mockResolvedValueOnce([]);

    await recoverAbandonedReplyIntents(NOW);

    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lte: SENT_AT },
          reminders: { some: { status: "SENT", sentAt: { lte: SENT_AT } } },
        }),
      })
    );
  });

  // Matched as of the reply, a visit may have started since: an hour-old "2"
  // must not cancel a visit that is already under way.
  it("leaves alone a visit that has started since the reply was sent", async () => {
    serve({ biz_1: [abandoned("msg_1", { body: "2" })] });
    mocks.appointment.findMany.mockResolvedValueOnce([
      {
        id: "appt_1",
        startAt: new Date(NOW.getTime() - 10 * 60 * 1000),
        staffMemberId: "staff_1",
        status: "CONFIRMED",
        client: { phone: "+38344123456", name: "Mira" },
      },
    ]);

    expect(await recoverAbandonedReplyIntents(NOW)).toEqual({ recovered: 1 });
    expect(mocks.cancelAppointmentCore).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("starts no new check past its deadline", async () => {
    serve({ biz_1: [abandoned("msg_1"), abandoned("msg_2")] });
    mocks.appointment.findMany.mockImplementationOnce(async () => {
      vi.setSystemTime(NOW.getTime() + 1_000);
      return [];
    });

    await recoverAbandonedReplyIntents(NOW, NOW.getTime() + 500);

    expect(mocks.appointment.findMany).toHaveBeenCalledTimes(1);
  });

  it("logs a message it can't recover and carries on with the rest", async () => {
    serve({ biz_1: [abandoned("msg_1"), abandoned("msg_2")] });
    mocks.appointment.findMany.mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce([]);

    expect(await recoverAbandonedReplyIntents(NOW)).toEqual({ recovered: 1 });
    expect(mocks.appointment.findMany).toHaveBeenCalledTimes(2);
  });
});
