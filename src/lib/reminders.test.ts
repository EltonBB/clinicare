import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const business = { findUnique: vi.fn() };
  const appointment = { findMany: vi.fn() };
  const appointmentReminder = { upsert: vi.fn() };
  const followUpDraft = { create: vi.fn(), count: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) };
  const $transaction = vi.fn();
  const sendMessage = vi.fn();
  const getNoShowRiskAssessments = vi.fn();
  return { business, appointment, appointmentReminder, followUpDraft, $transaction, sendMessage, getNoShowRiskAssessments };
});

vi.mock("@/lib/no-show-risk-data", () => ({ getNoShowRiskAssessments: mocks.getNoShowRiskAssessments }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: mocks.business,
    appointment: mocks.appointment,
    appointmentReminder: mocks.appointmentReminder,
    followUpDraft: mocks.followUpDraft,
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
    clientId: `client_${id}`,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    status: "CONFIRMED",
    client: { id: `client_${id}`, name: "Mira", phone: "+38344123456" },
    staffMember: { name: "Dr. Leka" },
    reminders: [],
  };
}

function business(overrides: Record<string, unknown> = {}) {
  return {
    id: "biz_1",
    name: "Clinic",
    plan: "PRO",
    whatsappEnabled: true,
    automationSettings: [],
    reminderSettings: null,
    workflowSettings: null,
    whatsappConnection: { id: "wa_1", status: "CONNECTED" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.business.findUnique.mockResolvedValue(business());
  mocks.getNoShowRiskAssessments.mockResolvedValue(new Map());
  mocks.appointmentReminder.upsert.mockResolvedValue({});
  mocks.followUpDraft.count.mockResolvedValue(0);
  mocks.$transaction.mockResolvedValue(undefined);
});

describe("syncAppointmentRemindersForBusiness", () => {
  // Codex #133: an edit that resets a booking's reminders without moving it (a
  // new client, say) owes a new reminder — under the old key the worker would
  // replay or refuse it, so the generation is part of the key.
  it("holds a reminder back while a booking or moved message for the visit is going out", async () => {
    const appointment = appointmentIn(1, "appt_1", 3);
    mocks.appointment.findMany.mockResolvedValue([appointment]);
    mocks.followUpDraft.count.mockResolvedValue(1);

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.followUpDraft.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        appointmentId: "appt_1",
        appointmentGeneration: 3,
        kind: { in: ["BOOKING_CONFIRMATION", "NEW_PATIENT_WELCOME", "VISIT_CHANGED"] },
        status: "SENT",
      }),
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    // Nothing recorded: if that message fails, the next run sends the reminder.
    expect(mocks.appointmentReminder.upsert).not.toHaveBeenCalled();
  });

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

  // Codex #136: when this run filled the window itself, about a minute has gone
  // by (sends plus the wait), and the wait must still be taken.
  it("waits out a full minute window the run filled itself", async () => {
    vi.useFakeTimers();
    try {
      mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1"), appointmentIn(1.2, "appt_2")]);
      mocks.sendMessage
        .mockImplementationOnce(async () => {
          vi.setSystemTime(Date.now() + 25_000);
          return { ok: true, providerMessageId: "m", status: "SENT", body: "Hi" };
        })
        .mockResolvedValueOnce({ ok: false, reason: "rate_limited", error: "x", retryAfterSeconds: 36 })
        .mockResolvedValueOnce({ ok: true, providerMessageId: "m", status: "SENT", body: "Hi" });

      const run = syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());
      await vi.advanceTimersByTimeAsync(36_000);
      await run;

      expect(mocks.sendMessage).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
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

describe("syncAppointmentRemindersForBusiness with automation settings", () => {
  const sent = { ok: true, providerMessageId: "m", status: "SENT", body: "Hi" };

  it("sends a Basic clinic's first reminder with its own wording", async () => {
    mocks.business.findUnique.mockResolvedValue(
      business({
        plan: "BASIC",
        reminderSettings: {
          send24HourReminder: true,
          send2HourReminder: true,
          firstReminderHours: 24,
          secondReminderHours: 2,
          template: "Hello {client_name}, {time} {service}",
        },
      })
    );
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(20, "appt_1")]);
    mocks.sendMessage.mockResolvedValue(sent);

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { kind: "freeform", body: expect.stringMatching(/^Hello Mira, .+ $/) },
        idempotencyKey: expect.stringContaining(":TWENTY_FOUR_HOUR:"),
      })
    );
  });

  it("gives a Basic clinic no second reminder", async () => {
    mocks.business.findUnique.mockResolvedValue(business({ plan: "BASIC" }));
    mocks.appointment.findMany.mockResolvedValue([
      { ...appointmentIn(1, "appt_1"), reminders: [{ type: "TWENTY_FOUR_HOUR", status: "SENT", sentAt: new Date(Date.now() - 23 * 3_600_000) }] },
    ]);

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("sends the high-risk reminder only to a high-risk visit", async () => {
    mocks.business.findUnique.mockResolvedValue(
      business({
        automationSettings: [
          { kind: "HIGH_RISK_REMINDER", enabled: true, mode: "AUTOMATIC", timing: 5, template: null, template2: null },
        ],
      })
    );
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(4, "risky"), appointmentIn(4, "steady")]);
    mocks.getNoShowRiskAssessments.mockResolvedValue(
      new Map([
        ["risky", { level: "high", reasons: [], insufficientHistory: false }],
        ["steady", { level: "low", reasons: [], insufficientHistory: false }],
      ])
    );
    mocks.sendMessage.mockResolvedValue(sent);

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    const keys = mocks.sendMessage.mock.calls.map(([input]) => input.idempotencyKey);
    expect(keys).toEqual([expect.stringContaining("risky:HIGH_RISK:"), expect.stringContaining("steady:TWENTY_FOUR_HOUR:")]);
  });

  it("still sends the other reminders when scoring risk fails", async () => {
    mocks.business.findUnique.mockResolvedValue(
      business({
        automationSettings: [
          { kind: "HIGH_RISK_REMINDER", enabled: true, mode: "AUTOMATIC", timing: 5, template: null, template2: null },
        ],
      })
    );
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(4, "appt_1")]);
    mocks.getNoShowRiskAssessments.mockRejectedValue(new Error("pool timeout"));
    mocks.sendMessage.mockResolvedValue(sent);

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: expect.stringContaining("appt_1:TWENTY_FOUR_HOUR:") })
    );
  });

  it("doesn't score risk when the high-risk reminder is off", async () => {
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(4, "appt_1")]);
    mocks.sendMessage.mockResolvedValue(sent);

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.getNoShowRiskAssessments).not.toHaveBeenCalled();
  });

  it("labels the mirrored message with its automation", async () => {
    const tx = {
      conversation: { upsert: vi.fn().mockResolvedValue({ id: "conv_1" }) },
      message: { create: vi.fn() },
      whatsAppConnection: { update: vi.fn() },
    };
    mocks.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1")]);
    mocks.sendMessage.mockResolvedValue(sent);

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(tx.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: "REMINDER", automationKind: "SECOND_REMINDER" }),
    });
  });

  it("sends nothing when every reminder is off", async () => {
    mocks.business.findUnique.mockResolvedValue(
      business({
        automationSettings: [
          { kind: "FIRST_REMINDER", enabled: false, mode: "AUTOMATIC", timing: 24, template: null, template2: null },
          { kind: "SECOND_REMINDER", enabled: false, mode: "AUTOMATIC", timing: 2, template: null, template2: null },
        ],
      })
    );

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });
});

function reviewTx(generation: number | null = 4, markerAfter = "DRAFTED") {
  const tx = {
    $executeRaw: vi.fn(),
    appointment: { findFirst: vi.fn().mockResolvedValue(generation === null ? null : { id: "appt_1" }) },
    followUpDraft: { createMany: vi.fn().mockResolvedValue({ count: 1 }), updateMany: vi.fn() },
    appointmentReminder: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ status: markerAfter }),
    },
  };
  mocks.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  return tx;
}

function reviewSecondReminder() {
  mocks.business.findUnique.mockResolvedValue(
    business({
      automationSettings: [
        { kind: "SECOND_REMINDER", enabled: true, mode: "REVIEW", timing: 2, template: null, template2: null },
      ],
    })
  );
}

describe("syncAppointmentRemindersForBusiness with a reminder set to review", () => {
  it("drafts the due reminder for To review instead of sending it, marked drafted, not sent", async () => {
    reviewSecondReminder();
    const appointment = appointmentIn(1, "appt_1", 4);
    mocks.appointment.findMany.mockResolvedValue([appointment]);
    const tx = reviewTx();

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(tx.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ reminderGeneration: 4 }) })
    );
    expect(tx.followUpDraft.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          kind: "SECOND_REMINDER",
          appointmentId: "appt_1",
          appointmentGeneration: 4,
          autoSend: false,
          dedupeKey: `SECOND_REMINDER:appt_1:${appointment.startAt.getTime()}:4`,
        }),
      ],
      skipDuplicates: true,
    });
    // DRAFTED: a "2" reply can't be read as an answer to it, nor the risk score count it.
    // Recorded before the draft, and never over a row a covering message marked sent.
    expect(tx.appointmentReminder.createMany).toHaveBeenCalledWith({
      data: [{ appointmentId: "appt_1", type: "TWO_HOUR", status: "DRAFTED" }],
      skipDuplicates: true,
    });
    expect(tx.appointmentReminder.updateMany).toHaveBeenCalledWith({
      where: { appointmentId: "appt_1", type: "TWO_HOUR", status: "FAILED" },
      data: expect.objectContaining({ status: "DRAFTED" }),
    });
    expect(tx.appointmentReminder.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.followUpDraft.createMany.mock.invocationCallOrder[0]
    );
  });

  it("drafts nothing when a message covering the reminder already marked it sent", async () => {
    reviewSecondReminder();
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1", 4)]);
    const tx = reviewTx(4, "SENT");

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("withdraws a longer-lead reminder still waiting for review when it drafts a more urgent one", async () => {
    reviewSecondReminder();
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1", 4)]);
    const tx = reviewTx();

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        appointmentId: "appt_1",
        kind: { in: ["FIRST_REMINDER", "HIGH_RISK_REMINDER"] },
        OR: [{ status: "PENDING" }, { status: "SENT", sentAt: null }],
      },
      data: { status: "DISMISSED" },
    });
  });

  it("drafts nothing for a visit an edit moved on since this run read it", async () => {
    reviewSecondReminder();
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1", 4)]);
    const tx = reviewTx(null);

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(tx.followUpDraft.createMany).not.toHaveBeenCalled();
    expect(tx.appointmentReminder.createMany).not.toHaveBeenCalled();
  });

  it("withdraws a waiting longer-lead review reminder before sending a more urgent one", async () => {
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1")]);
    mocks.sendMessage.mockResolvedValue({ ok: true, providerMessageId: "m", status: "SENT", body: "Hi" });

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    const retire = mocks.followUpDraft.updateMany.mock.invocationCallOrder[0];
    const send = mocks.sendMessage.mock.invocationCallOrder[0];
    expect(retire).toBeLessThan(send);
  });

  it("drafts nothing when the clinic switched the reminder back to automatic during the run", async () => {
    mocks.business.findUnique
      .mockResolvedValueOnce(
        business({
          automationSettings: [
            { kind: "SECOND_REMINDER", enabled: true, mode: "REVIEW", timing: 2, template: null, template2: null },
          ],
        })
      )
      .mockResolvedValue(business());
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1")]);
    const tx = reviewTx();
    mocks.sendMessage.mockResolvedValue({ ok: true, providerMessageId: "m", status: "SENT", body: "Hi" });

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(tx.followUpDraft.createMany).not.toHaveBeenCalled();
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("doesn't send a reminder the clinic switched to review during the run", async () => {
    mocks.business.findUnique
      .mockResolvedValueOnce(business())
      .mockResolvedValue(
        business({
          automationSettings: [
            { kind: "SECOND_REMINDER", enabled: true, mode: "REVIEW", timing: 2, template: null, template2: null },
          ],
        })
      );
    mocks.appointment.findMany.mockResolvedValue([appointmentIn(1, "appt_1")]);

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe("syncAppointmentRemindersForBusiness review drafts without a phone", () => {
  it("still drafts a review reminder for a client with no usable phone, so staff can fix it", async () => {
    reviewSecondReminder();
    mocks.appointment.findMany.mockResolvedValue([
      { ...appointmentIn(1, "appt_1"), client: { id: "client_appt_1", name: "Mira", phone: "" } },
    ]);
    const tx = reviewTx(0);

    await syncAppointmentRemindersForBusiness("biz_1", createReminderRunProgress());

    expect(tx.followUpDraft.createMany).toHaveBeenCalled();
  });
});
