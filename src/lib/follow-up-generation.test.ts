import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    business: { findMany: vi.fn() },
    followUpDraft: { create: vi.fn(), updateMany: vi.fn() },
  },
  findRebookCandidates: vi.fn(),
  findPaymentReminderCandidates: vi.fn(),
  findThankYouCandidates: vi.fn(),
  expirePastSlotOffers: vi.fn(),
  isProBusinessPlan: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/billing", () => ({ isProBusinessPlan: mocks.isProBusinessPlan }));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));
vi.mock("@/lib/slot-offers", () => ({ expirePastSlotOffers: mocks.expirePastSlotOffers }));
vi.mock("@/lib/workflow-generators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflow-generators")>();
  return {
    ...actual,
    findRebookCandidates: mocks.findRebookCandidates,
    findPaymentReminderCandidates: mocks.findPaymentReminderCandidates,
    findThankYouCandidates: mocks.findThankYouCandidates,
  };
});

import { expireStaleFollowUpDrafts, generateFollowUpDrafts } from "@/lib/follow-up-generation";
import { DEFAULT_WORKFLOW_SETTINGS, type FollowUpDraftInput } from "@/lib/workflow-generators";

const NOW = new Date("2026-07-01T12:00:00Z");
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const STORED_SETTINGS = {
  rebookEnabled: true,
  rebookAfterMonths: 9,
  paymentReminderEnabled: true,
  paymentReminderAfterDays: 5,
  thankYouEnabled: true,
  thankYouDelayHours: 4,
};

function business(id: string, overrides: Record<string, unknown> = {}) {
  return { id, plan: "PRO", workflowSettings: null, ...overrides };
}

function prismaError(code: string) {
  return Object.assign(new Error(`prisma ${code}`), { code });
}

const rebookInput: FollowUpDraftInput = {
  clientId: "c1",
  kind: "REBOOK",
  body: "rebook body",
  dedupeKey: "REBOOK:c1:2026-07",
};
const paymentInput: FollowUpDraftInput = {
  clientId: "c2",
  kind: "PAYMENT",
  paymentId: "pay1",
  body: "payment body",
  dedupeKey: "PAYMENT:pay1",
};
const thankYouInput: FollowUpDraftInput = {
  clientId: "c3",
  kind: "THANK_YOU",
  appointmentId: "appt1",
  body: "thanks body",
  dedupeKey: "THANK_YOU:appt1",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.business.findMany.mockResolvedValue([]);
  mocks.prisma.followUpDraft.create.mockResolvedValue({});
  mocks.prisma.followUpDraft.updateMany.mockResolvedValue({ count: 0 });
  mocks.findRebookCandidates.mockResolvedValue([]);
  mocks.findPaymentReminderCandidates.mockResolvedValue([]);
  mocks.findThankYouCandidates.mockResolvedValue([]);
  mocks.expirePastSlotOffers.mockResolvedValue({ expired: 0, released: 0 });
  // Mirrors billing.ts: PRO and ADVANCED are Pro; TRIAL and BASIC are not.
  mocks.isProBusinessPlan.mockImplementation((plan: string) => plan === "PRO" || plan === "ADVANCED");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("generateFollowUpDrafts — business selection and settings", () => {
  it("loads only WhatsApp-connected businesses (the same filter reminders use), in stable id order", async () => {
    await generateFollowUpDrafts(NOW);

    expect(mocks.prisma.business.findMany).toHaveBeenCalledTimes(1);
    const args = mocks.prisma.business.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      whatsappEnabled: true,
      whatsappConnection: { is: { status: { in: ["CONNECTED", "ERRORED"] } } },
    });
    expect(args.orderBy).toEqual({ id: "asc" });
    expect(args.select).toMatchObject({ id: true, plan: true, workflowSettings: expect.anything() });
  });

  it("uses a stored settings row when there is one and the defaults when there is not", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([
      business("biz_stored", { workflowSettings: STORED_SETTINGS }),
      business("biz_default", { workflowSettings: null }),
    ]);

    await generateFollowUpDrafts(NOW);

    expect(mocks.findPaymentReminderCandidates).toHaveBeenCalledWith({
      businessId: "biz_stored",
      settings: STORED_SETTINGS,
      now: NOW,
    });
    expect(mocks.findPaymentReminderCandidates).toHaveBeenCalledWith({
      businessId: "biz_default",
      settings: DEFAULT_WORKFLOW_SETTINGS,
      now: NOW,
    });
  });

  it("never calls the rebook generator for a Basic workspace, but still runs the other two", async () => {
    // A downgraded workspace may still have rebookEnabled stored as true — the
    // plan check, not the stored toggle, is what keeps rebook a Pro feature.
    mocks.prisma.business.findMany.mockResolvedValue([
      business("biz_basic", { plan: "BASIC", workflowSettings: STORED_SETTINGS }),
    ]);

    await generateFollowUpDrafts(NOW);

    expect(mocks.findRebookCandidates).not.toHaveBeenCalled();
    expect(mocks.findPaymentReminderCandidates).toHaveBeenCalledTimes(1);
    expect(mocks.findThankYouCandidates).toHaveBeenCalledTimes(1);
  });

  it("runs all three generators for a Pro workspace", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_pro")]);

    await generateFollowUpDrafts(NOW);

    expect(mocks.findRebookCandidates).toHaveBeenCalledWith({
      businessId: "biz_pro",
      settings: DEFAULT_WORKFLOW_SETTINGS,
      now: NOW,
    });
    expect(mocks.findPaymentReminderCandidates).toHaveBeenCalledTimes(1);
    expect(mocks.findThankYouCandidates).toHaveBeenCalledTimes(1);
  });
});

describe("generateFollowUpDrafts — thank-you lookback window", () => {
  it("computes the lookback per business as now - (that business's delay + 24h), always earlier than the delay cutoff", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([
      business("biz_4h", { workflowSettings: STORED_SETTINGS }), // 4h delay
      business("biz_default"), // default 2h delay
    ]);

    await generateFollowUpDrafts(NOW);

    const calls = mocks.findThankYouCandidates.mock.calls.map(([arg]) => arg);
    expect(calls).toHaveLength(2);

    const stored = calls.find((arg) => arg.businessId === "biz_4h");
    const fallback = calls.find((arg) => arg.businessId === "biz_default");

    expect(stored.lookbackWindowStart).toEqual(new Date(NOW.getTime() - 28 * HOUR_MS));
    expect(fallback.lookbackWindowStart).toEqual(new Date(NOW.getTime() - 26 * HOUR_MS));

    // The generator throws unless the start is strictly earlier than now - delay.
    expect(stored.lookbackWindowStart.getTime()).toBeLessThan(NOW.getTime() - 4 * HOUR_MS);
    expect(fallback.lookbackWindowStart.getTime()).toBeLessThan(
      NOW.getTime() - DEFAULT_WORKFLOW_SETTINGS.thankYouDelayHours * HOUR_MS
    );
  });
});

describe("generateFollowUpDrafts — writing drafts", () => {
  it("writes one PENDING draft per candidate, persisting appointmentId, paymentId and dedupeKey", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_1")]);
    mocks.findRebookCandidates.mockResolvedValue([rebookInput]);
    mocks.findPaymentReminderCandidates.mockResolvedValue([paymentInput]);
    mocks.findThankYouCandidates.mockResolvedValue([thankYouInput]);

    const result = await generateFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.create).toHaveBeenCalledTimes(3);
    expect(mocks.prisma.followUpDraft.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        clientId: "c2",
        kind: "PAYMENT",
        status: "PENDING",
        appointmentId: undefined,
        paymentId: "pay1",
        dedupeKey: "PAYMENT:pay1",
        body: "payment body",
      },
    });
    expect(mocks.prisma.followUpDraft.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        clientId: "c3",
        kind: "THANK_YOU",
        status: "PENDING",
        appointmentId: "appt1",
        paymentId: undefined,
        dedupeKey: "THANK_YOU:appt1",
        body: "thanks body",
      },
    });
    expect(result).toMatchObject({ businessesProcessed: 1, draftsCreated: 3, errors: 0 });
  });

  it("treats a duplicate dedupeKey (P2002) as a benign skip and does not count it", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_1")]);
    mocks.findPaymentReminderCandidates.mockResolvedValue([paymentInput]);
    mocks.findThankYouCandidates.mockResolvedValue([thankYouInput]);
    mocks.prisma.followUpDraft.create.mockRejectedValueOnce(prismaError("P2002")).mockResolvedValueOnce({});

    const result = await generateFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ draftsCreated: 1, errors: 0 });
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it("treats a foreign-key violation (P2003, record deleted since it was read) as a benign skip", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_1")]);
    mocks.findPaymentReminderCandidates.mockResolvedValue([paymentInput]);
    mocks.findThankYouCandidates.mockResolvedValue([thankYouInput]);
    mocks.prisma.followUpDraft.create.mockRejectedValueOnce(prismaError("P2003")).mockResolvedValueOnce({});

    const result = await generateFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ draftsCreated: 1, errors: 0 });
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it("counts any other write error against that business and still runs the next business", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_bad"), business("biz_good")]);
    mocks.findPaymentReminderCandidates.mockImplementation(async ({ businessId }: { businessId: string }) =>
      businessId === "biz_bad" ? [paymentInput] : [{ ...paymentInput, paymentId: "pay2", dedupeKey: "PAYMENT:pay2" }]
    );
    mocks.prisma.followUpDraft.create.mockImplementation(async ({ data }: { data: { businessId: string } }) => {
      if (data.businessId === "biz_bad") throw new Error("connection reset");
      return {};
    });

    const result = await generateFollowUpDrafts(NOW);

    expect(result).toMatchObject({ businessesProcessed: 2, draftsCreated: 1, errors: 1 });
    // Record id only — no client names or draft text in the log context.
    expect(mocks.logger.error).toHaveBeenCalledWith(expect.any(String), expect.any(Error), { businessId: "biz_bad" });
    // The business after the failing one was still processed.
    expect(mocks.findPaymentReminderCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz_good" })
    );
  });

  it("still counts drafts created before a later write in the same business threw", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_1")]);
    mocks.findPaymentReminderCandidates.mockResolvedValue([paymentInput]);
    mocks.findThankYouCandidates.mockResolvedValue([thankYouInput]);
    mocks.prisma.followUpDraft.create.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("boom"));

    const result = await generateFollowUpDrafts(NOW);

    expect(result).toMatchObject({ draftsCreated: 1, errors: 1 });
  });

  it("keeps the other generators' candidates when one generator rejects", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_1")]);
    mocks.findRebookCandidates.mockRejectedValue(new Error("rebook query failed"));
    mocks.findPaymentReminderCandidates.mockResolvedValue([paymentInput]);
    mocks.findThankYouCandidates.mockResolvedValue([thankYouInput]);

    const result = await generateFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ draftsCreated: 2, errors: 1 });
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).toHaveBeenCalledWith(expect.stringContaining("rebook"), expect.any(Error), {
      businessId: "biz_1",
    });
  });

  it("turns a generator that throws synchronously into a counted error, not a crash", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_1")]);
    mocks.findThankYouCandidates.mockImplementation(() => {
      throw new Error("sync failure");
    });
    mocks.findPaymentReminderCandidates.mockResolvedValue([paymentInput]);

    const result = await generateFollowUpDrafts(NOW);

    expect(result).toMatchObject({ draftsCreated: 1, errors: 1 });
  });
});

describe("generateFollowUpDrafts — stale-draft sweep and totals", () => {
  it("runs the sweep even when a business failed", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_bad")]);
    mocks.findPaymentReminderCandidates.mockResolvedValue([paymentInput]);
    mocks.prisma.followUpDraft.create.mockRejectedValue(new Error("boom"));

    const result = await generateFollowUpDrafts(NOW);

    expect(result.errors).toBe(1);
    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledTimes(3);
    expect(mocks.expirePastSlotOffers).toHaveBeenCalledWith(undefined, NOW);
  });

  it("runs the sweep even when there are no businesses to process", async () => {
    const result = await generateFollowUpDrafts(NOW);

    expect(result).toEqual({ businessesProcessed: 0, draftsCreated: 0, draftsExpired: 0, errors: 0 });
    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledTimes(3);
    expect(mocks.expirePastSlotOffers).toHaveBeenCalledTimes(1);
  });

  it("adds the stale-draft count and the slot-offer count into draftsExpired", async () => {
    mocks.prisma.followUpDraft.updateMany
      .mockResolvedValueOnce({ count: 2 }) // PAYMENT
      .mockResolvedValueOnce({ count: 3 }) // REBOOK
      .mockResolvedValueOnce({ count: 4 }); // THANK_YOU
    mocks.expirePastSlotOffers.mockResolvedValue({ expired: 5, released: 1 });

    const result = await generateFollowUpDrafts(NOW);

    expect(result.draftsExpired).toBe(14);
  });

  it("counts a failed stale-draft sweep as an error but still sweeps slot offers", async () => {
    mocks.prisma.followUpDraft.updateMany.mockRejectedValue(new Error("db down"));
    mocks.expirePastSlotOffers.mockResolvedValue({ expired: 2, released: 0 });

    const result = await generateFollowUpDrafts(NOW);

    expect(result).toMatchObject({ errors: 1, draftsExpired: 2 });
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
  });

  it("counts a failed slot-offer sweep as an error without losing the stale-draft count", async () => {
    mocks.prisma.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.expirePastSlotOffers.mockRejectedValue(new Error("slot sweep failed"));

    const result = await generateFollowUpDrafts(NOW);

    expect(result).toMatchObject({ errors: 1, draftsExpired: 3 });
  });

  it("stops starting new businesses once the wall-clock budget is spent, warns, and still sweeps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_1"), business("biz_2"), business("biz_3")]);
    // The first business is slow enough (its candidate query) to use up the
    // whole 90s budget, before it has anything to write.
    mocks.findPaymentReminderCandidates.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 91_000);
      return [];
    });

    const result = await generateFollowUpDrafts(NOW);

    expect(mocks.findPaymentReminderCandidates).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ businessesProcessed: 1, draftsCreated: 0, errors: 0 });
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledTimes(3);
  });

  it("stops writing mid-batch once the budget is spent, keeps what it wrote, and still sweeps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // One clinic with a big backlog and a second one waiting behind it.
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_big"), business("biz_next")]);
    mocks.findPaymentReminderCandidates.mockResolvedValue([paymentInput]);
    mocks.findThankYouCandidates.mockResolvedValue([thankYouInput, { ...thankYouInput, dedupeKey: "THANK_YOU:appt2" }]);
    // The first insert is slow enough to spend the whole 90s budget.
    mocks.prisma.followUpDraft.create.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 91_000);
      return {};
    });

    const result = await generateFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ businessesProcessed: 1, draftsCreated: 1, errors: 0 });
    // The second business is never started once the first spent the budget.
    expect(mocks.findPaymentReminderCandidates).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledTimes(3);
    expect(mocks.expirePastSlotOffers).toHaveBeenCalledTimes(1);
  });

  it("warns and sweeps when the budget runs out inside the last business's batch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_only")]);
    mocks.findPaymentReminderCandidates.mockResolvedValue([paymentInput]);
    mocks.findThankYouCandidates.mockResolvedValue([thankYouInput]);
    mocks.prisma.followUpDraft.create.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 91_000);
      return {};
    });

    const result = await generateFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.create).toHaveBeenCalledTimes(1);
    expect(result.draftsCreated).toBe(1);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledTimes(3);
  });

  it("does not stop early when the run stays inside the budget", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_1"), business("biz_2")]);
    mocks.findPaymentReminderCandidates.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 60_000);
      return [];
    });

    const result = await generateFollowUpDrafts(NOW);

    expect(result.businessesProcessed).toBe(2);
    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });
});

describe("expireStaleFollowUpDrafts", () => {
  it("returns the sum of the three rule counts", async () => {
    mocks.prisma.followUpDraft.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 4 });

    await expect(expireStaleFollowUpDrafts(NOW)).resolves.toBe(7);
  });

  it("expires only PENDING drafts, each rule scoped to its own kind, and never touches SENT", async () => {
    await expireStaleFollowUpDrafts(NOW);

    const calls = mocks.prisma.followUpDraft.updateMany.mock.calls.map(([arg]) => arg);
    expect(calls).toHaveLength(3);
    expect(calls.map((arg) => arg.where.kind).sort()).toEqual(["PAYMENT", "REBOOK", "THANK_YOU"]);
    for (const arg of calls) {
      expect(arg.where.status).toBe("PENDING");
      expect(arg.data).toEqual({ status: "EXPIRED" });
      expect(JSON.stringify(arg.where)).not.toContain("SENT");
    }
  });

  it("expires PAYMENT drafts whose payment is gone or no longer owed", async () => {
    await expireStaleFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        kind: "PAYMENT",
        status: "PENDING",
        OR: [{ paymentId: null }, { payment: { status: { notIn: ["Unpaid", "Partially Paid"] } } }],
      },
      data: { status: "EXPIRED" },
    });
  });

  it("expires REBOOK drafts once the client booked, went inactive/archived, the workspace is no longer Pro, or the draft is 35 days old", async () => {
    await expireStaleFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        kind: "REBOOK",
        status: "PENDING",
        OR: [
          {
            client: {
              appointments: { some: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: NOW } } },
            },
          },
          { client: { OR: [{ isArchived: true }, { status: { in: ["INACTIVE", "ARCHIVED"] } }] } },
          { business: { plan: { in: ["TRIAL", "BASIC"] } } },
          { createdAt: { lt: new Date(NOW.getTime() - 35 * DAY_MS) } },
        ],
      },
      data: { status: "EXPIRED" },
    });
  });

  it("expires PENDING REBOOK drafts of a workspace that is no longer Pro, classifying plans by isProBusinessPlan", async () => {
    await expireStaleFollowUpDrafts(NOW);

    const rebook = mocks.prisma.followUpDraft.updateMany.mock.calls
      .map(([arg]) => arg)
      .find((arg) => arg.where.kind === "REBOOK");
    const planBranch = rebook.where.OR.find((branch: { business?: unknown }) => branch.business);

    // Never PRO or ADVANCED: a Pro workspace's drafts must survive this rule.
    expect(planBranch).toEqual({ business: { plan: { in: ["TRIAL", "BASIC"] } } });
    expect(rebook.where.status).toBe("PENDING");
  });

  it("follows isProBusinessPlan when it classifies plans differently (no hard-coded plan list)", async () => {
    mocks.isProBusinessPlan.mockImplementation((plan: string) => plan === "PRO");

    await expireStaleFollowUpDrafts(NOW);

    const rebook = mocks.prisma.followUpDraft.updateMany.mock.calls
      .map(([arg]) => arg)
      .find((arg) => arg.where.kind === "REBOOK");
    const planBranch = rebook.where.OR.find((branch: { business?: unknown }) => branch.business);

    expect(planBranch).toEqual({ business: { plan: { in: ["TRIAL", "BASIC", "ADVANCED"] } } });
  });

  it("expires THANK_YOU drafts older than 3 days", async () => {
    await expireStaleFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        kind: "THANK_YOU",
        status: "PENDING",
        createdAt: { lt: new Date(NOW.getTime() - 3 * DAY_MS) },
      },
      data: { status: "EXPIRED" },
    });
  });
});
