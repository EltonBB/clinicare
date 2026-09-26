import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const message = { findFirst: vi.fn(), create: vi.fn() };
  const client = { findMany: vi.fn() };
  const conversation = { upsert: vi.fn() };
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

import { applyInboundReplyIntent, recordInboundMessage } from "./inbound";

beforeEach(() => {
  vi.clearAllMocks();
  // No open slot offer by default — the reply-intent tests below run the
  // normal confirm/cancel path unless a test opens one.
  mocks.followUpDraft.findFirst.mockResolvedValue(null);
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

  it("skips a duplicate provider message id idempotently", async () => {
    mocks.message.findFirst.mockResolvedValue({ id: "existing" });
    const result = await recordInboundMessage({
      businessId: "biz_1",
      fromPhone: "+38344123456",
      body: "hello",
      providerMessageId: "M1",
    });
    expect(result).toEqual({ recorded: false, reason: "duplicate" });
    expect(mocks.client.findMany).not.toHaveBeenCalled();
    expect(mocks.$transaction).not.toHaveBeenCalled();
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

    expect(result).toEqual({ recorded: true, conversationId: "conv_1", clientId: "client_9" });

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
    expect(result).toEqual({ recorded: true, conversationId: "conv_shared", clientId: null });
    expect(mocks.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversationId: "conv_shared", clientId: null }),
      })
    );
  });
});

describe("applyInboundReplyIntent", () => {
  const NOW = new Date("2026-07-01T12:00:00Z");
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
    mocks.followUpDraft.findFirst.mockResolvedValueOnce({ id: "draft_offer" });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body, now: NOW });

    expect(result).toEqual({ applied: false, reason: "open_offer" });
    // Scoped to this client in this business: a SENT offer from the last 48
    // hours that is still live — its entry still holds it and the offered
    // slot is still cancelled and ahead.
    expect(mocks.followUpDraft.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        clientId: "client_1",
        kind: "SLOT_OFFER",
        status: "SENT",
        sentAt: { gte: new Date("2026-06-29T12:00:00Z") },
        waitlistEntry: { status: "OFFERED" },
        appointment: { status: "CANCELLED", startAt: { gt: NOW } },
      },
      select: { id: true },
    });
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
    expect(mocks.confirmAppointmentCore).not.toHaveBeenCalled();
    expect(mocks.cancelAppointmentCore).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("ends the stand-down once the offer is no longer live (its slot passed, or the appointment is back on)", async () => {
    // The live-offer filter finds nothing for an offer whose slot has passed
    // (appointment.startAt <= now) or whose appointment was un-cancelled, even
    // inside the 48-hour window — so the reply acts on the reminder as usual.
    mocks.followUpDraft.findFirst.mockResolvedValueOnce(null);
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.cancelAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });
    mocks.sendMessage.mockResolvedValueOnce({ ok: false, reason: "provider_error", error: "x" });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "2", now: NOW });

    const [{ where }] = mocks.followUpDraft.findFirst.mock.calls[0];
    expect(where.appointment).toEqual({ status: "CANCELLED", startAt: { gt: NOW } });
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
});
