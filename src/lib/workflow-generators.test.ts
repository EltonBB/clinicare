import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  clientPayment: { findMany: vi.fn() },
  appointment: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import { ELIGIBLE_CLIENT_WHERE } from "@/lib/client-eligibility";
import {
  DEFAULT_WORKFLOW_SETTINGS,
  findPaymentReminderCandidates,
  findRebookCandidates,
  findThankYouCandidates,
  rebookedAppointmentWhere,
  subtractDays,
} from "@/lib/workflow-generators";

const NOW = new Date("2026-07-01T12:00:00Z");
const HOUR_MS = 3_600_000;
// A realistic caller value: delay (2h) + a 24h re-scan window before NOW.
const LOOKBACK_START = new Date(NOW.getTime() - (2 + 24) * HOUR_MS);

const REBOOK_ON = { ...DEFAULT_WORKFLOW_SETTINGS, rebookEnabled: true };

beforeEach(() => vi.clearAllMocks());

describe("findRebookCandidates", () => {
  it("finds clients whose last visit is older than the configured window and have no future appointment", async () => {
    mocks.client.findMany.mockResolvedValue([{ id: "c1", name: "Alex", lastVisitAt: new Date("2026-01-01T00:00:00Z") }]);

    const result = await findRebookCandidates({ businessId: "biz_1", settings: REBOOK_ON, now: NOW });

    expect(result).toEqual([
      {
        clientId: "c1",
        kind: "REBOOK",
        body: expect.stringContaining("Alex"),
        dedupeKey: "REBOOK:c1:2026-07",
      },
    ]);
    expect(mocks.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz_1",
          isArchived: false,
          // 6 months before NOW, in the clinic's own calendar (Codex #130): NOW
          // is 14:00 CEST (UTC+2); January is CET (UTC+1), so the same clinic-
          // local wall-clock time six months earlier is 13:00Z, not 12:00Z — a
          // pure UTC subtraction would have kept 12:00Z and drifted an hour off
          // the clinic's own "N months ago".
          lastVisitAt: { not: null, lt: new Date("2026-01-01T13:00:00Z") },
          appointments: { none: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: NOW } } },
        }),
      })
    );
  });

  it("skips inactive and archived clients and clients who already have an open or this-month rebook draft", async () => {
    mocks.client.findMany.mockResolvedValue([]);

    await findRebookCandidates({ businessId: "biz_1", settings: REBOOK_ON, now: NOW });

    expect(mocks.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ["INACTIVE", "ARCHIVED"] },
          followUpDrafts: {
            none: {
              kind: "REBOOK",
              // Clinic-local (Europe/Budapest, UTC+2 in July) month start, not
              // a UTC boundary — 2026-07-01T00:00 local is 22:00 UTC the day
              // before (Codex #130).
              OR: [{ status: "PENDING" }, { createdAt: { gte: new Date("2026-06-30T22:00:00Z") } }],
            },
          },
        }),
      })
    );
  });

  // Codex #130: an hourly run in the first local hours of a new month used to
  // compute this month's start (and the dedupe key) from the UTC calendar
  // instead of the clinic's own — for Europe/Budapest (UTC+2 in July),
  // 00:30 local on July 1st is still June 30th in UTC, so the old code drafted
  // under "2026-06" while the real local month was already July. A staff
  // member sending that draft before UTC midnight then let the very next
  // hourly run see a genuinely new (UTC) month key and draft a second nudge
  // for the same client in the same clinic-local month.
  it("keys the month by the clinic's local calendar, not UTC — an hour where the two disagree", async () => {
    mocks.client.findMany.mockResolvedValue([{ id: "c1", name: "Alex", lastVisitAt: new Date("2026-01-01T00:00:00Z") }]);
    const earlyLocalJuly = new Date("2026-06-30T22:30:00Z"); // 2026-07-01T00:30 CEST

    const result = await findRebookCandidates({ businessId: "biz_1", settings: REBOOK_ON, now: earlyLocalJuly });

    expect(result[0]?.dedupeKey).toBe("REBOOK:c1:2026-07");
    expect(mocks.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          followUpDrafts: {
            none: {
              kind: "REBOOK",
              OR: [{ status: "PENDING" }, { createdAt: { gte: new Date("2026-06-30T22:00:00Z") } }],
            },
          },
          // The rebooking cutoff itself has the same bug: a run computed
          // straight from UTC calendar fields would still see June 30 and
          // subtract 6 months from THAT, landing the cutoff a full day early
          // (Dec 31 00:30 local instead of Jan 1 00:30 local) — 6 clinic-local
          // months before July 1 00:30, not 6 UTC-calendar months before
          // June 30 22:30 (Codex #130).
          lastVisitAt: { not: null, lt: new Date("2025-12-31T23:30:00Z") },
        }),
      })
    );
  });

  it("bounds each run to a deterministic, capped batch", async () => {
    mocks.client.findMany.mockResolvedValue([]);

    await findRebookCandidates({ businessId: "biz_1", settings: REBOOK_ON, now: NOW });

    expect(mocks.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ lastVisitAt: "asc" }, { id: "asc" }], take: 200 })
    );
  });

  it("honours a non-default rebook window", async () => {
    mocks.client.findMany.mockResolvedValue([]);

    await findRebookCandidates({ businessId: "biz_1", settings: { ...REBOOK_ON, rebookAfterMonths: 12 }, now: NOW });

    expect(mocks.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lastVisitAt: { not: null, lt: new Date("2025-07-01T12:00:00Z") } }),
      })
    );
  });

  it("clamps the cutoff day at month end instead of rolling into the next month", async () => {
    mocks.client.findMany.mockResolvedValue([]);

    // Aug 31 minus 6 months lands in February, which has no 31st: expect Feb 28, not Mar 3.
    await findRebookCandidates({ businessId: "biz_1", settings: REBOOK_ON, now: new Date("2026-08-31T12:00:00Z") });

    expect(mocks.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Same DST crossing as the 6-month test above: August is CEST (UTC+2),
        // February is CET (UTC+1), so 14:00 local both ends is 12:00Z in August
        // and 13:00Z in February.
        where: expect.objectContaining({ lastVisitAt: { not: null, lt: new Date("2026-02-28T13:00:00Z") } }),
      })
    );
  });

  it("returns nothing when rebooking is disabled, whatever the other settings are", async () => {
    const result = await findRebookCandidates({
      businessId: "biz_1",
      settings: { ...DEFAULT_WORKFLOW_SETTINGS, rebookEnabled: false, rebookAfterMonths: 12 },
      now: NOW,
    });
    expect(result).toEqual([]);
    expect(mocks.client.findMany).not.toHaveBeenCalled();
  });
});

// Codex #130: "N days" in the follow-up workflows means N calendar days on the
// clinic's own clock. Europe/Budapest leaves daylight time on Sun 2026-10-25 and
// enters it on Sun 2026-03-29, so across either change N * 24 hours lands an
// hour off the clinic's wall-clock time.
describe("subtractDays", () => {
  const originalTimeZone = process.env.APP_TIME_ZONE;

  beforeEach(() => {
    process.env.APP_TIME_ZONE = "Europe/Budapest";
  });

  afterEach(() => {
    if (originalTimeZone === undefined) {
      delete process.env.APP_TIME_ZONE;
    } else {
      process.env.APP_TIME_ZONE = originalTimeZone;
    }
  });

  it("keeps the wall-clock time across the autumn change: 10:00 CET minus 3 days is 10:00 CEST, not 11:00", () => {
    // 2026-10-26 10:00 CET -> Fri 2026-10-23 10:00 CEST (08:00Z); 72 hours earlier would be 09:00Z = 11:00 CEST.
    expect(subtractDays(new Date("2026-10-26T09:00:00Z"), 3)).toEqual(new Date("2026-10-23T08:00:00Z"));
  });

  it("keeps the wall-clock time across the spring change: 10:00 CEST minus 3 days is 10:00 CET, not 09:00", () => {
    // 2026-03-31 10:00 CEST -> Sat 2026-03-28 10:00 CET (09:00Z); 72 hours earlier would be 08:00Z = 09:00 CET.
    expect(subtractDays(new Date("2026-03-31T08:00:00Z"), 3)).toEqual(new Date("2026-03-28T09:00:00Z"));
  });

  it("is the same as plain subtraction when no clock change is crossed", () => {
    expect(subtractDays(new Date("2026-07-01T12:00:00Z"), 3)).toEqual(new Date("2026-06-28T12:00:00Z"));
  });

  it("rolls back over month and year ends", () => {
    expect(subtractDays(new Date("2026-03-02T12:00:00Z"), 3)).toEqual(new Date("2026-02-27T12:00:00Z"));
    expect(subtractDays(new Date("2026-01-02T12:00:00Z"), 3)).toEqual(new Date("2025-12-30T12:00:00Z"));
  });

  it("counts days on the clinic's calendar, not UTC's: just after local midnight is still the previous UTC day", () => {
    // 2026-07-02 00:30 CEST is 22:30Z on the 1st; one clinic day earlier is 2026-07-01 00:30 CEST.
    expect(subtractDays(new Date("2026-07-01T22:30:00Z"), 1)).toEqual(new Date("2026-06-30T22:30:00Z"));
  });

  it("keeps milliseconds, so subtracting nothing returns the same instant", () => {
    const instant = new Date("2026-07-01T12:00:00.345Z");
    expect(subtractDays(instant, 0)).toEqual(instant);
  });
});

describe("rebookedAppointmentWhere", () => {
  it("counts the recent-visit window in clinic-local days across a clock change", () => {
    // 28 clinic days before 2026-10-26 10:00 CET is 2026-09-28 10:00 CEST (08:00Z).
    expect(rebookedAppointmentWhere(new Date("2026-10-26T09:00:00Z"))).toEqual({
      OR: [
        { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: new Date("2026-10-26T09:00:00Z") } },
        { status: { in: ["CONFIRMED", "COMPLETED"] }, startAt: { gt: new Date("2026-09-28T08:00:00Z") } },
      ],
    });
  });
});

describe("findPaymentReminderCandidates", () => {
  it("finds unpaid/partially-paid payments older than the configured window, one draft per payment", async () => {
    mocks.clientPayment.findMany.mockResolvedValue([{ id: "pay_1", clientId: "c1", client: { name: "Alex" } }]);

    const result = await findPaymentReminderCandidates({ businessId: "biz_1", settings: DEFAULT_WORKFLOW_SETTINGS, now: NOW });

    expect(result).toEqual([
      {
        clientId: "c1",
        kind: "PAYMENT",
        paymentId: "pay_1",
        body: "Hi Alex, a friendly reminder that you have an unpaid payment with us. Please get in touch if you have any questions.",
        dedupeKey: "PAYMENT:pay_1",
      },
    ]);
    expect(mocks.clientPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz_1",
          status: { in: ["Unpaid", "Partially Paid"] },
          createdAt: { lt: new Date("2026-06-28T12:00:00Z") }, // 3 days before NOW
        }),
      })
    );
  });

  it("never puts a money amount in the patient message (no per-clinic currency yet), so it doesn't even read one", async () => {
    mocks.clientPayment.findMany.mockResolvedValue([{ id: "pay_1", clientId: "c1", client: { name: "Alex" }, amountCents: 5000 }]);

    const [draft] = await findPaymentReminderCandidates({ businessId: "biz_1", settings: DEFAULT_WORKFLOW_SETTINGS, now: NOW });

    expect(draft.body).not.toMatch(/[$€£]|\d/);
    expect(mocks.clientPayment.findMany.mock.calls[0][0].select).toEqual({
      id: true,
      clientId: true,
      client: { select: { name: true } },
    });
  });

  // Codex #130: the rebooking nudge and slot offers already skip a client the
  // clinic archived or deactivated on purpose; a payment reminder must not be
  // drafted for one either (and it is the query that must say so, so the 200-row
  // cap drains real candidates instead of re-reading the same ineligible rows).
  it("only drafts for clients the clinic still contacts", async () => {
    mocks.clientPayment.findMany.mockResolvedValue([]);

    await findPaymentReminderCandidates({ businessId: "biz_1", settings: DEFAULT_WORKFLOW_SETTINGS, now: NOW });

    expect(mocks.clientPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ client: ELIGIBLE_CLIENT_WHERE }) })
    );
  });

  it("skips payments that already have a payment draft, and bounds each run", async () => {
    mocks.clientPayment.findMany.mockResolvedValue([]);

    await findPaymentReminderCandidates({ businessId: "biz_1", settings: DEFAULT_WORKFLOW_SETTINGS, now: NOW });

    expect(mocks.clientPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ followUpDrafts: { none: { kind: "PAYMENT" } } }),
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 200,
      })
    );
  });

  it("counts the reminder delay in clinic-local days, so it doesn't drift an hour across a clock change", async () => {
    mocks.clientPayment.findMany.mockResolvedValue([]);

    await findPaymentReminderCandidates({
      businessId: "biz_1",
      settings: DEFAULT_WORKFLOW_SETTINGS,
      now: new Date("2026-10-26T09:00:00Z"), // 10:00 CET, the morning after daylight time ended
    });

    // 3 clinic days earlier: Fri 2026-10-23 10:00 CEST. (72 hours earlier would be 09:00Z.)
    expect(mocks.clientPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { lt: new Date("2026-10-23T08:00:00Z") } }),
      })
    );
  });

  it("honours a non-default reminder delay", async () => {
    mocks.clientPayment.findMany.mockResolvedValue([]);

    await findPaymentReminderCandidates({
      businessId: "biz_1",
      settings: { ...DEFAULT_WORKFLOW_SETTINGS, paymentReminderAfterDays: 7 },
      now: NOW,
    });

    expect(mocks.clientPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { lt: new Date("2026-06-24T12:00:00Z") } }),
      })
    );
  });

  it("returns nothing when disabled, whatever the other settings are", async () => {
    const result = await findPaymentReminderCandidates({
      businessId: "biz_1",
      settings: { ...DEFAULT_WORKFLOW_SETTINGS, paymentReminderEnabled: false, paymentReminderAfterDays: 7 },
      now: NOW,
    });
    expect(result).toEqual([]);
    expect(mocks.clientPayment.findMany).not.toHaveBeenCalled();
  });
});

describe("findThankYouCandidates", () => {
  it("finds appointments completed inside the scan window, dedupe keyed per appointment", async () => {
    mocks.appointment.findMany.mockResolvedValue([{ id: "appt_1", clientId: "c1", client: { name: "Alex" } }]);

    const result = await findThankYouCandidates({
      businessId: "biz_1",
      settings: DEFAULT_WORKFLOW_SETTINGS,
      now: NOW,
      lookbackWindowStart: LOOKBACK_START,
    });

    expect(result).toEqual([
      { clientId: "c1", kind: "THANK_YOU", appointmentId: "appt_1", body: expect.stringContaining("Alex"), dedupeKey: "THANK_YOU:appt_1" },
    ]);
    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz_1",
          status: "COMPLETED",
          // (NOW - 26h, NOW - 2h]
          endAt: { lte: new Date("2026-07-01T10:00:00Z"), gt: new Date("2026-06-30T10:00:00Z") },
        }),
      })
    );
  });

  it("only drafts for clients the clinic still contacts", async () => {
    mocks.appointment.findMany.mockResolvedValue([]);

    await findThankYouCandidates({
      businessId: "biz_1",
      settings: DEFAULT_WORKFLOW_SETTINGS,
      now: NOW,
      lookbackWindowStart: LOOKBACK_START,
    });

    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ client: ELIGIBLE_CLIENT_WHERE }) })
    );
  });

  it("skips appointments that already have a thank-you draft, and bounds each run", async () => {
    mocks.appointment.findMany.mockResolvedValue([]);

    const result = await findThankYouCandidates({
      businessId: "biz_1",
      settings: DEFAULT_WORKFLOW_SETTINGS,
      now: NOW,
      lookbackWindowStart: LOOKBACK_START,
    });

    expect(result).toEqual([]);
    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ followUpDrafts: { none: { kind: "THANK_YOU" } } }),
        orderBy: [{ endAt: "asc" }, { id: "asc" }],
        take: 200,
      })
    );
  });

  it("honours a non-default thank-you delay", async () => {
    mocks.appointment.findMany.mockResolvedValue([]);

    await findThankYouCandidates({
      businessId: "biz_1",
      settings: { ...DEFAULT_WORKFLOW_SETTINGS, thankYouDelayHours: 6 },
      now: NOW,
      lookbackWindowStart: new Date(NOW.getTime() - (6 + 24) * HOUR_MS),
    });

    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          endAt: { lte: new Date("2026-07-01T06:00:00Z"), gt: new Date("2026-06-30T06:00:00Z") },
        }),
      })
    );
  });

  it("throws instead of silently scanning an empty window when the lookback starts inside the delay", async () => {
    // Delay is 2h, so a 1h lookback makes (NOW - 1h, NOW - 2h] an empty interval.
    await expect(
      findThankYouCandidates({
        businessId: "biz_1",
        settings: DEFAULT_WORKFLOW_SETTINGS,
        now: NOW,
        lookbackWindowStart: new Date(NOW.getTime() - HOUR_MS),
      })
    ).rejects.toThrow("lookbackWindowStart must be earlier");
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });

  it("throws when the lookback starts exactly at the delay cutoff", async () => {
    await expect(
      findThankYouCandidates({
        businessId: "biz_1",
        settings: DEFAULT_WORKFLOW_SETTINGS,
        now: NOW,
        lookbackWindowStart: new Date(NOW.getTime() - 2 * HOUR_MS),
      })
    ).rejects.toThrow("lookbackWindowStart must be earlier");
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });

  it("returns nothing when disabled, even with an inverted window", async () => {
    const result = await findThankYouCandidates({
      businessId: "biz_1",
      settings: { ...DEFAULT_WORKFLOW_SETTINGS, thankYouEnabled: false, thankYouDelayHours: 6 },
      now: NOW,
      lookbackWindowStart: NOW,
    });
    expect(result).toEqual([]);
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });
});
