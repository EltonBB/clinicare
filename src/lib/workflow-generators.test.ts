import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  clientPayment: { findMany: vi.fn() },
  appointment: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import {
  DEFAULT_WORKFLOW_SETTINGS,
  findPaymentReminderCandidates,
  findRebookCandidates,
  findThankYouCandidates,
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
          lastVisitAt: { not: null, lt: new Date("2026-01-01T12:00:00Z") }, // 6 months before NOW
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
              OR: [{ status: "PENDING" }, { createdAt: { gte: new Date("2026-07-01T00:00:00Z") } }],
            },
          },
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
        where: expect.objectContaining({ lastVisitAt: { not: null, lt: new Date("2026-02-28T12:00:00Z") } }),
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

describe("findPaymentReminderCandidates", () => {
  it("finds unpaid/partially-paid payments older than the configured window, one draft per payment", async () => {
    mocks.clientPayment.findMany.mockResolvedValue([
      { id: "pay_1", clientId: "c1", client: { name: "Alex" }, amountCents: 5000 },
    ]);

    const result = await findPaymentReminderCandidates({ businessId: "biz_1", settings: DEFAULT_WORKFLOW_SETTINGS, now: NOW });

    expect(result).toEqual([
      {
        clientId: "c1",
        kind: "PAYMENT",
        paymentId: "pay_1",
        body: expect.stringContaining("Alex"),
        dedupeKey: "PAYMENT:pay_1",
      },
    ]);
    expect(result[0].body).toContain("an unpaid payment of $50.00");
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
