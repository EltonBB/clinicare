import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appointment: { findFirst: vi.fn(), count: vi.fn() },
  followUpDraft: { create: vi.fn(), updateMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
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
  replaceRefusedVisitMessage,
  retireMovedCheckupDrafts,
  retireMissedVisitDrafts,
  retireVisitDrafts,
  visitEventForSave,
  suppressOpenReminders,
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
  mocks.followUpDraft.findFirst.mockResolvedValue(null);
  // The suppression runs in a transaction on the same mocked client.
  mocks.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
    callback({
      appointment: mocks.appointment,
      appointmentReminder: mocks.appointmentReminder,
      followUpDraft: mocks.followUpDraft,
      $executeRaw: mocks.$executeRaw,
    })
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
    // A welcome went out before (its booking since deleted); no notice since.
    mocks.followUpDraft.count.mockResolvedValueOnce(1);

    await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW });

    expect(mocks.followUpDraft.count).toHaveBeenCalledWith({
      where: { businessId: "biz_1", clientId: "client_1", kind: "NEW_PATIENT_WELCOME", status: "SENT", sentAt: { not: null } },
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

  it.each([
    ["the visit now belongs to another patient", "client_2"],
    ["the caller didn't say who the save was for", undefined],
  ])("says nothing for a save the visit has moved on from when %s", async (_label, clientId) => {
    // The visit is at generation 2 now, for client_1; this save committed generation 1.
    expect(
      await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "moved", generation: 1, clientId, now: NOW })
    ).toBeNull();
    expect(mocks.followUpDraft.create).not.toHaveBeenCalled();
  });

  it("still tells the same patient after a later detail-only edit, for the visit as it now stands", async () => {
    // A later save changed only the service (generation 2) and said nothing
    // itself; this save's moved notice is still owed (Codex).
    expect(
      await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "moved", generation: 1, clientId: "client_1", now: NOW })
    ).toBe("draft_1");
    expect(mocks.followUpDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "VISIT_CHANGED", clientId: "client_1", appointmentGeneration: 2 }),
      select: { id: true },
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

  it("says nothing for a clinic that never set up WhatsApp", async () => {
    mocks.appointment.findFirst.mockResolvedValue(
      appointment({ business: business({ whatsappEnabled: false, whatsappConnection: null }) })
    );

    expect(await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW })).toBeNull();
  });

  it("still drafts the message while WhatsApp is disconnected, to go out once it reconnects", async () => {
    mocks.appointment.findFirst.mockResolvedValue(
      appointment({ business: business({ whatsappConnection: { status: "DISCONNECTED" } }) })
    );

    expect(await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW })).toBe("draft_1");
  });

  it("tells the patient a cancelled visit is cancelled, replacing an older notice", async () => {
    mocks.appointment.findFirst.mockResolvedValue(appointment({ status: "CANCELLED" }));

    await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "cancelled", now: NOW });

    // Only notices about an older version of the visit: an overlapping older
    // edit can't withdraw the notice for the newer one.
    expect(mocks.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        appointmentId: "appt_1",
        kind: "VISIT_CHANGED",
        status: "PENDING",
        appointmentGeneration: { lt: 2 },
      },
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

  it.each(["NO_SHOW", "COMPLETED"])("tells nothing about a visit moved and marked %s in one edit", async (status) => {
    mocks.appointment.findFirst.mockResolvedValue(appointment({ status }));

    expect(await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "moved", now: NOW })).toBeNull();
    expect(mocks.followUpDraft.create).not.toHaveBeenCalled();
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

describe("replaceRefusedVisitMessage", () => {
  const OWED = { businessId: "biz_1", appointmentId: "appt_1", clientId: "client_1", generation: 1 };

  // It reads the real clock (it takes no `now`), so pin it: the fixture visit
  // is two days after NOW, and stopped being upcoming once that date passed.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drafts the confirmation again for the visit as it now is", async () => {
    expect(await replaceRefusedVisitMessage({ ...OWED, event: "booked" })).toBeUndefined();

    expect(mocks.followUpDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "BOOKING_CONFIRMATION", appointmentGeneration: 2 }) })
    );
    expect(mocks.dispatchSoon).toHaveBeenCalledWith("biz_1");
  });

  it.each(["booked", "cancelled", "missed"] as const)(
    "never sends a refused %s message to the patient the visit was reassigned to",
    async (event) => {
      mocks.appointment.findFirst.mockResolvedValue(
        appointment({
          clientId: "client_2",
          status: event === "cancelled" ? "CANCELLED" : event === "missed" ? "NO_SHOW" : "CONFIRMED",
          ...(event === "missed" ? { startAt: new Date("2026-10-20T07:00:00.000Z") } : {}),
        })
      );

      await replaceRefusedVisitMessage({ ...OWED, event });

      expect(mocks.followUpDraft.create).not.toHaveBeenCalled();
    }
  );
});

describe("one message per version of a visit", () => {
  it("gives way to a moved or cancel notice for the same version, after its own write", async () => {
    mocks.followUpDraft.count.mockResolvedValue(1);

    expect(await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW })).toBeNull();

    expect(mocks.followUpDraft.count).toHaveBeenCalledWith({
      where: { businessId: "biz_1", appointmentId: "appt_1", appointmentGeneration: 2, kind: "VISIT_CHANGED", status: { in: ["PENDING", "SENT"] } },
    });
    expect(mocks.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "draft_1", status: "PENDING" },
      data: { status: "DISMISSED" },
    });
    expect(mocks.dispatchSoon).not.toHaveBeenCalled();
  });

  it("has a moved notice withdraw a booking message waiting for the same version", async () => {
    await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "moved", now: NOW });

    expect(mocks.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        appointmentId: "appt_1",
        appointmentGeneration: 2,
        kind: { in: ["BOOKING_CONFIRMATION", "NEW_PATIENT_WELCOME"] },
        // Waiting, or claimed but not yet sent: a delivered one is left alone.
        OR: [{ status: "PENDING" }, { status: "SENT", sentAt: null }],
      },
      data: { status: "DISMISSED" },
    });
  });

  it("keeps one welcome per patient when two first bookings are saved at once", async () => {
    mocks.appointment.count.mockResolvedValue(0);
    mocks.followUpDraft.create.mockResolvedValueOnce({ id: "draft_1" }).mockResolvedValueOnce({ id: "draft_2" });
    // The other booking's welcome was drafted first.
    mocks.followUpDraft.findFirst.mockResolvedValue({ id: "draft_other" });

    expect(await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW })).toBe("draft_2");

    expect(mocks.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "draft_1", status: "PENDING" },
      data: { status: "DISMISSED" },
    });
    expect(mocks.followUpDraft.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ kind: "BOOKING_CONFIRMATION" }) })
    );
  });

  it("counts as the first welcome only one sent, or one waiting for a booking that still stands", async () => {
    mocks.appointment.count.mockResolvedValue(0);

    await queueVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "booked", now: NOW });

    // A welcome left over from a deleted or cancelled first booking can't win.
    expect(mocks.followUpDraft.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz_1",
          clientId: "client_1",
          kind: "NEW_PATIENT_WELCOME",
          OR: [{ status: "SENT", sentAt: { not: null } }, { status: { in: ["PENDING", "SENT"] }, appointment: { status: { in: ["PENDING", "CONFIRMED"] } } }],
        },
      })
    );
  });

  it.each([
    ["a new booking", { isNew: true, newStatus: "CONFIRMED" }, "booked"],
    ["a visit given to another patient at a new time", { clientChanged: true, timeChanged: true }, "booked"],
    // Neither patient held this cancelled visit as it now stands: no message.
    [
      "a visit cancelled and given to another patient in one save",
      { wasNewlyCancelled: true, clientChanged: true, newStatus: "CANCELLED" },
      null,
    ],
    ["a new time", { timeChanged: true }, "moved"],
    ["a cancellation", { wasNewlyCancelled: true, newStatus: "CANCELLED" }, "cancelled"],
    ["a reset that retired a waiting confirmation", { bookingMessageRetired: true }, "booked"],
    ["a cancelled visit restored", { wasReactivated: true }, "booked"],
    ["a later edit that retired a waiting moved notice", { visitNoticeRetired: "moved" }, "moved"],
    [
      "a later edit to a cancelled visit that retired its waiting notice",
      { visitNoticeRetired: "cancelled", newStatus: "CANCELLED" },
      "cancelled",
    ],
    ["a status change only", {}, null],
  ])("tells the patient about %s", (_label, change, expected) => {
    const save = {
      isNew: false,
      newStatus: "CONFIRMED",
      wasNewlyCancelled: false,
      timeChanged: false,
      clientChanged: false,
      bookingMessageRetired: false,
      wasReactivated: false,
      visitNoticeRetired: null,
      ...change,
    };
    expect(visitEventForSave(save as Parameters<typeof visitEventForSave>[0])).toBe(expected);
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

  it("drafts nothing when the no-show was undone after this request read it", async () => {
    mocks.appointment.findFirst
      .mockResolvedValueOnce(appointment({ status: "NO_SHOW", startAt: new Date("2026-10-20T07:00:00.000Z") }))
      // Re-read under the visit's lock: staff marked it attended meanwhile.
      .mockResolvedValueOnce(null);

    expect(await queueMissedVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", now: NOW })).toBeNull();
    expect(mocks.$executeRaw).toHaveBeenCalled();
    // Re-checked under the lock as the same no-show, patient and visit version it read.
    expect(mocks.appointment.findFirst).toHaveBeenLastCalledWith({
      where: { id: "appt_1", businessId: "biz_1", status: "NO_SHOW", reminderGeneration: 2, clientId: "client_1" },
      select: { id: true },
    });
    expect(mocks.followUpDraft.create).not.toHaveBeenCalled();
  });

  it("drafts no second message beside one already waiting for this visit version", async () => {
    mocks.appointment.findFirst.mockResolvedValue(appointment({ status: "NO_SHOW", startAt: new Date("2026-10-20T07:00:00.000Z") }));
    mocks.followUpDraft.count.mockResolvedValue(1);

    expect(await queueMissedVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", now: NOW })).toBeNull();
    // Checked under the visit's exclusive lock, so two callers can't both see none.
    expect((mocks.$executeRaw.mock.calls[0][0] as string[]).join("?")).toContain("FOR NO KEY UPDATE");
    expect(mocks.followUpDraft.count).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        appointmentId: "appt_1",
        kind: "MISSED_VISIT",
        appointmentGeneration: 2,
        OR: [{ status: "PENDING" }, { status: "SENT", sentAt: null }],
      },
    });
    expect(mocks.followUpDraft.create).not.toHaveBeenCalled();
  });

  it("drafts a refused missed-visit message again while the visit is still a no-show", async () => {
    mocks.appointment.findFirst.mockResolvedValue(appointment({ status: "NO_SHOW", startAt: new Date("2026-10-20T07:00:00.000Z") }));

    await replaceRefusedVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", event: "missed", clientId: "client_1", generation: 1 });

    expect(mocks.followUpDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "MISSED_VISIT" }) })
    );
  });

  it("still drafts the missed-visit message while WhatsApp is disconnected", async () => {
    mocks.appointment.findFirst.mockResolvedValue(
      appointment({
        status: "NO_SHOW",
        startAt: new Date("2026-10-20T07:00:00.000Z"),
        business: business({ whatsappConnection: { status: "DISCONNECTED" } }),
      })
    );

    expect(await queueMissedVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", now: NOW })).toBe("draft_1");
  });

  it("drafts nothing for a visit that hasn't started", async () => {
    mocks.appointment.findFirst.mockResolvedValue(null);

    expect(await queueMissedVisitMessage({ businessId: "biz_1", appointmentId: "appt_1", now: NOW })).toBeNull();
    expect(mocks.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ startAt: { lte: NOW } }) })
    );
  });

  it("withdraws a waiting (or claimed, not yet sent) missed-visit message, inside the caller's transaction", async () => {
    const tx = { followUpDraft: { updateMany: vi.fn() } };
    await retireMissedVisitDrafts(tx as never, { businessId: "biz_1", appointmentId: "appt_1" });

    expect(mocks.followUpDraft.updateMany).not.toHaveBeenCalled();
    expect(tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        appointmentId: "appt_1",
        kind: "MISSED_VISIT",
        OR: [{ status: "PENDING" }, { status: "SENT", sentAt: null }],
      },
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

  it("also covers a reminder that failed earlier, or was drafted for review, so replies and the risk score count it", async () => {
    mocks.appointment.findFirst.mockResolvedValue({ startAt: new Date(NOW.getTime() + 30 * 60_000) });
    mocks.business.findUnique.mockResolvedValue(business());

    await suppressOpenReminders({ businessId: "biz_1", appointmentId: "appt_1", appointmentGeneration: 2, now: NOW });

    expect(mocks.appointmentReminder.updateMany).toHaveBeenCalledWith({
      where: { appointmentId: "appt_1", type: { in: ["TWENTY_FOUR_HOUR", "TWO_HOUR"] }, status: { in: ["FAILED", "DRAFTED"] } },
      data: { status: "SENT", sentAt: NOW },
    });
    // The insert goes first: one racing a reminder being drafted waits for it,
    // then the update and the withdrawal see that reminder and its draft.
    const order = [
      mocks.appointmentReminder.createMany.mock.invocationCallOrder[0],
      mocks.appointmentReminder.updateMany.mock.invocationCallOrder[0],
      mocks.followUpDraft.updateMany.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("withdraws a covered reminder still waiting in To review, or claimed by staff but not yet sent", async () => {
    mocks.appointment.findFirst.mockResolvedValue({ startAt: new Date(NOW.getTime() + 30 * 60_000) });
    mocks.business.findUnique.mockResolvedValue(business());

    await suppressOpenReminders({ businessId: "biz_1", appointmentId: "appt_1", appointmentGeneration: 2, now: NOW });

    expect(mocks.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        appointmentId: "appt_1",
        kind: { in: ["FIRST_REMINDER", "SECOND_REMINDER"] },
        OR: [{ status: "PENDING" }, { status: "SENT", sentAt: null }],
      },
      data: { status: "DISMISSED" },
    });
  });

  it("leaves reminders whose window opens later alone", async () => {
    mocks.appointment.findFirst.mockResolvedValue({ startAt: IN_TWO_DAYS });
    mocks.business.findUnique.mockResolvedValue(business());

    await suppressOpenReminders({ businessId: "biz_1", appointmentId: "appt_1", appointmentGeneration: 2, now: NOW });

    expect(mocks.appointmentReminder.createMany).not.toHaveBeenCalled();
  });
});

describe("retireMovedCheckupDrafts", () => {
  it("withdraws inside the transaction it is given", async () => {
    const tx = { followUpDraft: { updateMany: vi.fn() } };

    await retireMovedCheckupDrafts({ businessId: "biz_1", followUpReminderId: "fr_1", remindAt: NOW }, tx as never);

    expect(tx.followUpDraft.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.followUpDraft.updateMany).not.toHaveBeenCalled();
  });

  it("withdraws a check-up nudge drafted for a date the clinic just moved", async () => {
    const remindAt = new Date("2026-10-19T09:00:00.000Z");

    await retireMovedCheckupDrafts({ businessId: "biz_1", followUpReminderId: "fr_1", remindAt });

    expect(mocks.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        followUpReminderId: "fr_1",
        kind: "CHECKUP_DUE",
        dedupeKey: { not: `CHECKUP_DUE:fr_1:${remindAt.getTime()}` },
        OR: [{ status: "PENDING" }, { status: "SENT", sentAt: null }],
      },
      data: { status: "DISMISSED" },
    });
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

  it("withdraws the drafts that named the visit as it was, and says which messages were waiting", async () => {
    const tx = {
      followUpDraft: {
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([{ dedupeKey: "VISIT_CHANGED:appt_1:moved:1:2" }]),
      },
    };

    expect(await retireVisitDrafts(tx as never, "appt_1")).toEqual({
      bookingMessageRetired: true,
      visitNoticeRetired: "moved",
      missedVisitRetired: true,
    });
    expect(tx.followUpDraft.count).toHaveBeenCalledWith({ where: { appointmentId: "appt_1", status: "PENDING", kind: "MISSED_VISIT" } });

    expect(tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        appointmentId: "appt_1",
        status: "PENDING",
        kind: {
          in: [
            "BOOKING_CONFIRMATION",
            "NEW_PATIENT_WELCOME",
            "VISIT_CHANGED",
            "MISSED_VISIT",
            "FIRST_REMINDER",
            "SECOND_REMINDER",
            "HIGH_RISK_REMINDER",
          ],
        },
      },
      data: { status: "DISMISSED" },
    });
  });
});
