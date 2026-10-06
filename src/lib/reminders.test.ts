import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const business = { findUnique: vi.fn() };
  const appointment = { findMany: vi.fn() };
  const appointmentReminder = { upsert: vi.fn() };
  const $transaction = vi.fn();
  const sendMessage = vi.fn();
  return { business, appointment, appointmentReminder, $transaction, sendMessage };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: mocks.business,
    appointment: mocks.appointment,
    appointmentReminder: mocks.appointmentReminder,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/lib/messaging", () => ({ sendMessage: mocks.sendMessage }));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { createReminderRunProgress, syncAppointmentRemindersForBusiness } from "./reminders";

function appointmentIn(hours: number, id: string, reminderGeneration = 0) {
  return {
    id,
    reminderGeneration,
    startAt: new Date(Date.now() + hours * 60 * 60 * 1000),
    client: { id: `client_${id}`, name: "Mira", phone: "+38344123456" },
    staffMember: { name: "Dr. Leka" },
    reminders: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.business.findUnique.mockResolvedValue({
    id: "biz_1",
    name: "Clinic",
    whatsappEnabled: true,
    reminderSettings: null,
    whatsappConnection: { id: "wa_1", status: "CONNECTED" },
  });
  mocks.appointmentReminder.upsert.mockResolvedValue({});
  mocks.$transaction.mockResolvedValue(undefined);
});

describe("syncAppointmentRemindersForBusiness", () => {
  // Codex #133: an edit that resets a booking's reminders without moving it (a
  // new client, say) owes a new reminder — under the old key the worker would
  // replay or refuse it, so the generation is part of the key.
  it("keys each send by appointment, reminder slot, booking time and reminder generation", async () => {
    const appointment = appointmentIn(1, "appt_1", 3);
    mocks.appointment.findMany.mockResolvedValue([appointment]);
    mocks.sendMessage.mockResolvedValue({ ok: true, providerMessageId: "m", status: "SENT", body: "Hi" });

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `reminder:appt_1:TWO_HOUR:${appointment.startAt.getTime()}:3` })
    );
  });

  // Codex #130: an uncertain send may already be with the patient — recording it FAILED
  // would have the next hourly run send it again.
  it("records an uncertain reminder as SENT so no later run sends it twice, without mirroring it", async () => {
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1")]);
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "delivery_uncertain", error: "x" });
    const progress = createReminderRunProgress();

    await syncAppointmentRemindersForBusiness("biz_1", progress);

    expect(mocks.appointmentReminder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "SENT" }),
        update: expect.objectContaining({ status: "SENT" }),
      })
    );
    expect(mocks.$transaction).not.toHaveBeenCalled();
    // Not confirmed, so it isn't counted as sent.
    expect(progress).toMatchObject({ sent: 0, failed: 1 });
  });

  it("still records a definite failure as FAILED, to be retried", async () => {
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1")]);
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "provider_error", error: "x" });

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.appointmentReminder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  // Codex #136: at the clinic's sending ceiling nothing went out, so nothing is
  // recorded and the rest of the run waits for the next hour.
  it("stops the run at the clinic's hourly ceiling without recording anything", async () => {
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1"), appointmentIn(1.2, "appt_2")]);
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "rate_limited", error: "x", retryAfterSeconds: 1_500 });

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.appointmentReminder.upsert).not.toHaveBeenCalled();
  });

  // Codex #136: a full minute window is waited out, not deferred an hour, so a
  // visit starting before the next run still gets its reminder.
  it("waits out a full minute window, then sends the reminder", async () => {
    vi.useFakeTimers();
    try {
      mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1")]);
      mocks.sendMessage
        .mockResolvedValueOnce({ ok: false, reason: "rate_limited", error: "x", retryAfterSeconds: 40 })
        .mockResolvedValueOnce({ ok: true, providerMessageId: "m", status: "SENT", body: "Hi" });

      const run = syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());
      await vi.advanceTimersByTimeAsync(39_000);
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_000);
      await run;

      expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
      expect(mocks.appointmentReminder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ status: "SENT" }) })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts uncertain sends toward the breaker that stops a run against a stalled link", async () => {
    mocks.appointment.findMany.mockResolvedValue([
      appointmentIn(1, "appt_1"),
      appointmentIn(1.2, "appt_2"),
      appointmentIn(1.4, "appt_3"),
    ]);
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "delivery_uncertain", error: "x" });

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });
});
