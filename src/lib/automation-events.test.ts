import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appointment: { findFirst: vi.fn(), count: vi.fn() },
  followUpDraft: { create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  appointmentReminder: { createMany: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  business: { findUnique: vi.fn() },
  dispatchSoon: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: mocks.appointment,
    followUpDraft: mocks.followUpDraft,
    appointmentReminder: mocks.appointmentReminder,
    business: mocks.business,
    $transaction: mocks.$transaction,
  },
}));
vi.mock("@/lib/automation-dispatch-soon", () => ({ dispatchSoon: mocks.dispatchSoon }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  queueMissedVisitMessage,
  queueVisitMessage,
  retireVisitDrafts,
  suppressOpenReminders,
  withdrawMissedVisitMessage,
} from "./automation-events";

const NOW = new Date("2026-10-20T08:00:00.000Z");
const IN_TWO_DAYS = new Date("2026-10-22T08:30:00.000Z");

type Row = { kind: string; enabled: boolean; mode: "AUTOMATIC" | "REVIEW"; timing: number | null; template: string | null; template2: string | null };

function business(overrides: Record<string, unknown> = {}) {
  return {
    name: "Vela Dent",
    plan: "PRO",
    whatsappEnabled: true,
    whatsappConnection: { status: "CONNECTED" },
    automationSettings: [] as Row[],
    reminderSettings: null,
    workflowSettings: null,
    ...overrides,
  };
}

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt_1",
    clientId: "client_1",
    status: "CONFIRMED",
    startAt: IN_TWO_DAYS,
    createdAt: new Date("2026-10-19T09:00:00.000Z"),
    reminderGeneration: 2,
    client: { name: "Maya" },
    staffMember: { name: "Dr. Arta" },
    business: business(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appointment.findFirst.mockResolvedValue(appointment());
  mocks.appointment.count.mockResolvedValue(3);
  mocks.followUpDraft.create.mockResolvedValue({ id: "draft_1" });
  mocks.followUpDraft.updateMany.mockResolvedValue({ count: 0 });
  mocks.followUpDraft.count.mockResolvedValue(0);
  // The suppression runs in a transaction on the same mocked client.
  mocks.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
    callback({ appointment: mocks.appointment, appointmentReminder: mocks.appointmentReminder, $executeRaw: mocks.$executeRaw })
  );
});

describe("queueVisitMessage", () => {
  it("confirms a booking for a returning patient and sends it right away", async () => {
    expect(await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW })).toBe("draft_1");

    expect(mocks.followUpDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "BOOKING_CONFIRMATION",
        autoSend: true,
        appointmentGeneration: 2,
        dedupeKey: "BOOKING_CONFIRMATION:appt_1:2",
        body: expect.stringMatching(/^Hi Maya, your visit at Vela Dent is booked for .+\. Reply here if you need to change it\.$/),
      }),
      select: { id: true },
    });
    expect(mocks.dispatchSoon).toHaveBeenCalledWith("biz_1");
  });

  it("welcomes a first-time patient instead of confirming", async () => {
    mocks.appointment.count.mockResolvedValue(0);

    await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW });

    expect(mocks.followUpDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "NEW_PATIENT_WELCOME" }) })
    );
  });

  it("doesn't welcome a patient again after their first booking was deleted", async () => {
    mocks.appointment.count.mockResolvedValue(0);
    mocks.followUpDraft.count.mockResolvedValue(1);

    await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW });

    expect(mocks.followUpDraft.count).toHaveBeenCalledWith({
      where: { businessId: "biz_1", clientId: "client_1", kind: "NEW_PATIENT_WELCOME", status: "SENT" },
    });
    expect(mocks.followUpDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "BOOKING_CONFIRMATION" }) })
    );
  });

  it("counts only bookings made before this one, so two first bookings at once agree", async () => {
    mocks.appointment.count.mockResolvedValue(0);

    await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW });

    expect(mocks.appointment.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [
          { createdAt: { lt: new Date("2026-10-19T09:00:00.000Z") } },
          { createdAt: new Date("2026-10-19T09:00:00.000Z"), id: { lt: "appt_1" } },
        ],
      }),
    });
  });

  it("says nothing about a visit whose time has passed", async () => {
    mocks.appointment.findFirst.mockResolvedValue(appointment({ startAt: new Date("2026-10-19T08:00:00.000Z") }));

    expect(await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW })).toBeNull();
    expect(mocks.followUpDraft.create).not.toHaveBeenCalled();
  });

  it("says nothing on Basic, where these automations are Pro", async () => {
    mocks.appointment.findFirst.mockResolvedValue(appointment({ business: business({ plan: "BASIC" }) }));

    expect(await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW })).toBeNull();
  });

  it("says nothing while WhatsApp isn't linked", async () => {
    mocks.appointment.findFirst.mockResolvedValue(
      appointment({ business: business({ whatsappConnection: { status: "DISCONNECTED" } }) })
    );

    expect(await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW })).toBeNull();
  });

  it("tells the patient a cancelled visit is cancelled, replacing an older notice", async () => {
    mocks.appointment.findFirst.mockResolvedValue(appointment({ status: "CANCELLED" }));

    await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "cancelled", now: NOW });

    expect(mocks.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", appointmentId: "appt_1", kind: "VISIT_CHANGED", status: "PENDING" },
      data: { status: "DISMISSED" },
    });
    expect(mocks.followUpDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "VISIT_CHANGED",
          body: expect.stringContaining("has been cancelled"),
          dedupeKey: `VISIT_CHANGED:appt_1:cancelled:${IN_TWO_DAYS.getTime()}:2`,
        }),
      })
    );
  });

  it("gives a moved visit its new time", async () => {
    await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "moved", now: NOW });

    expect(mocks.followUpDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: expect.stringContaining("has moved to") }) })
    );
  });

  it("ignores a 'cancelled' event for a visit that isn't cancelled", async () => {
    expect(await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "cancelled", now: NOW })).toBeNull();
  });

  it("leaves a message set to review for staff", async () => {
    mocks.appointment.findFirst.mockResolvedValue(
      appointment({
        business: business({
          automationSettings: [
            { kind: "BOOKING_CONFIRMATION", enabled: true, mode: "REVIEW", timing: null, template: null, template2: null },
          ],
        }),
      })
    );

    await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW });

    expect(mocks.followUpDraft.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ autoSend: false }) }));
    expect(mocks.dispatchSoon).not.toHaveBeenCalled();
  });

  it("never throws: a failed draft doesn't fail the booking", async () => {
    mocks.followUpDraft.create.mockRejectedValue(new Error("db down"));

    await expect(queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW })).resolves.toBeNull();
  });
});

describe("queueMissedVisitMessage", () => {
  it("drafts the missed-visit message for after the clinic's delay, for review by default", async () => {
    mocks.appointment.findFirst.mockResolvedValue(appointment({ status: "NO_SHOW", startAt: new Date("2026-10-20T07:00:00.000Z") }));

    await queueMissedVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", now: NOW });

    expect(mocks.followUpDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "MISSED_VISIT",
          autoSend: false,
          sendAfter: new Date(NOW.getTime() + 3_600_000),
          // One per mark, so marking it again after an undo drafts anew.
          dedupeKey: `MISSED_VISIT:appt_1:${NOW.getTime()}`,
          body: "Hi Maya, we missed you today. Would you like to book a new time?",
        }),
      })
    );
  });

  it("drafts nothing for a visit that hasn't started", async () => {
    mocks.appointment.findFirst.mockResolvedValue(null);

    expect(await queueMissedVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", now: NOW })).toBeNull();
    expect(mocks.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ startAt: { lte: NOW } }) })
    );
  });

  it("withdraws a waiting missed-visit message when the no-show is undone", async () => {
    await withdrawMissedVisitMessage({ businessId: "biz_1", appointmentId: "appt_1" });

    expect(mocks.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", appointmentId: "appt_1", kind: "MISSED_VISIT", status: "PENDING" },
      data: { status: "DISMISSED" },
    });
  });
});

describe("suppressOpenReminders", () => {
  it("records the reminders already due as covered, so a same-day booking gets one message", async () => {
    mocks.appointment.findFirst.mockResolvedValue({ startAt: new Date(NOW.getTime() + 30 * 60_000) });
    mocks.business.findUnique.mockResolvedValue(business());

    await suppressOpenReminders({ businessId: "biz_1", appointmentId: "appt_1", appointmentGeneration: 2, now: NOW });

    expect(mocks.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ reminderGeneration: 2 }) })
    );
    expect(mocks.appointmentReminder.createMany).toHaveBeenCalledWith({
      data: [
        { appointmentId: "appt_1", type: "TWENTY_FOUR_HOUR", status: "SENT", sentAt: NOW },
        { appointmentId: "appt_1", type: "TWO_HOUR", status: "SENT", sentAt: NOW },
      ],
      skipDuplicates: true,
    });
  });

  it("also covers a reminder that failed earlier and would be retried", async () => {
    mocks.appointment.findFirst.mockResolvedValue({ startAt: new Date(NOW.getTime() + 30 * 60_000) });
    mocks.business.findUnique.mockResolvedValue(business());

    await suppressOpenReminders({ businessId: "biz_1", appointmentId: "appt_1", appointmentGeneration: 2, now: NOW });

    expect(mocks.appointmentReminder.updateMany).toHaveBeenCalledWith({
      where: { appointmentId: "appt_1", type: { in: ["TWENTY_FOUR_HOUR", "TWO_HOUR"] }, status: "FAILED" },
      data: { status: "SENT", sentAt: NOW },
    });
  });

  it("leaves reminders whose window opens later alone", async () => {
    mocks.appointment.findFirst.mockResolvedValue({ startAt: IN_TWO_DAYS });
    mocks.business.findUnique.mockResolvedValue(business());

    await suppressOpenReminders({ businessId: "biz_1", appointmentId: "appt_1", appointmentGeneration: 2, now: NOW });

    expect(mocks.appointmentReminder.createMany).not.toHaveBeenCalled();
  });
});

describe("retireVisitDrafts", () => {
  it("covers nothing once the visit has moved on from the version the message described", async () => {
    mocks.appointment.findFirst.mockResolvedValue(null);
    mocks.business.findUnique.mockResolvedValue(business());

    await suppressOpenReminders({ businessId: "biz_1", appointmentId: "appt_1", appointmentGeneration: 1, now: NOW });

    expect(mocks.appointmentReminder.createMany).not.toHaveBeenCalled();
    expect(mocks.appointmentReminder.updateMany).not.toHaveBeenCalled();
  });

  it("withdraws the drafts that named the visit as it was, and says if a booking message was waiting", async () => {
    const tx = { followUpDraft: { updateMany: vi.fn(), count: vi.fn().mockResolvedValue(1) } };

    expect(await retireVisitDrafts(tx as never, "appt_1")).toEqual({ bookingMessageRetired: true });

    expect(tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        appointmentId: "appt_1",
        status: "PENDING",
        kind: { in: ["BOOKING_CONFIRMATION", "NEW_PATIENT_WELCOME", "VISIT_CHANGED", "MISSED_VISIT"] },
      },
      data: { status: "DISMISSED" },
    });
  });
});
