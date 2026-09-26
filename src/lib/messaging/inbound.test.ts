import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const message = { findFirst: vi.fn(), create: vi.fn() };
  const client = { findFirst: vi.fn() };
  const conversation = { upsert: vi.fn() };
  const appointment = { findMany: vi.fn() };
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

import { applyInboundReplyIntent, recordInboundMessage } from "./inbound";

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(mocks.client.findFirst).not.toHaveBeenCalled();
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it("threads onto the phoneKey conversation and links the matching client", async () => {
    mocks.message.findFirst.mockResolvedValue(null);
    mocks.client.findFirst.mockResolvedValue({ id: "client_9", name: "Mira" });
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
});

describe("applyInboundReplyIntent", () => {
  const NOW = new Date("2026-07-01T12:00:00Z");
  const REMINDED_UPCOMING = {
    id: "appt_1",
    startAt: new Date("2026-07-02T09:00:00Z"),
    staffMemberId: "staff_1",
    client: { phone: "+38344123456" },
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

  it("confirms the one unambiguous match and sends a confirmation", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.confirmAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "yes", now: NOW });

    expect(result).toEqual({ applied: true, intent: "confirm", appointmentId: "appt_1" });
    expect(mocks.confirmAppointmentCore).toHaveBeenCalledWith({ id: "appt_1", businessId: "biz_1" });
    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: "WHATSAPP", to: "+38344123456" }));
  });

  it("cancels the one unambiguous match, sends a confirmation, and notifies staff", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.cancelAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "2", now: NOW });

    expect(result).toEqual({ applied: true, intent: "cancel", appointmentId: "appt_1" });
    expect(mocks.notifyStaffOfAppointmentChange).toHaveBeenCalledWith("biz_1", "staff_1", "appt_1", "changed");
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalledWith(["client_1"], ["staff_1"]);
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
