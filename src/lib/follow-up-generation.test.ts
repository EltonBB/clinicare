import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    business: { findMany: vi.fn() },
    followUpDraft: { create: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
  },
  findRebookCandidates: vi.fn(),
  findPaymentReminderCandidates: vi.fn(),
  findThankYouCandidates: vi.fn(),
  expirePastSlotOffers: vi.fn(),
  isProBusinessPlan: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  getFollowUpCursor: vi.fn(),
  setFollowUpCursor: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/billing", () => ({ isProBusinessPlan: mocks.isProBusinessPlan }));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));
vi.mock("@/lib/slot-offers", () => ({ expirePastSlotOffers: mocks.expirePastSlotOffers }));
vi.mock("@/lib/follow-up-cursor", () => ({
  getFollowUpCursor: mocks.getFollowUpCursor,
  setFollowUpCursor: mocks.setFollowUpCursor,
}));
vi.mock("@/lib/workflow-generators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflow-generators")>();
  return {
    ...actual,
    findRebookCandidates: mocks.findRebookCandidates,
    findPaymentReminderCandidates: mocks.findPaymentReminderCandidates,
    findThankYouCandidates: mocks.findThankYouCandidates,
  };
});

import { INELIGIBLE_CLIENT_WHERE } from "@/lib/client-eligibility";
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
  mocks.prisma.followUpDraft.groupBy.mockResolvedValue([]); // nothing pending yet
  mocks.findRebookCandidates.mockResolvedValue([]);
  mocks.findPaymentReminderCandidates.mockResolvedValue([]);
  mocks.findThankYouCandidates.mockResolvedValue([]);
  mocks.expirePastSlotOffers.mockResolvedValue({ expired: 0, released: 0, failed: 0 });
  // Mirrors billing.ts: PRO and ADVANCED are Pro; TRIAL and BASIC are not.
  mocks.isProBusinessPlan.mockImplementation((plan: string) => plan === "PRO" || plan === "ADVANCED");
  mocks.getFollowUpCursor.mockResolvedValue(null);
  mocks.setFollowUpCursor.mockResolvedValue(undefined);
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
    expect(mocks.expirePastSlotOffers).toHaveBeenCalledWith(undefined, NOW, { onError: expect.any(Function) });
  });

  it("runs the sweep even when there are no businesses to process", async () => {
    const result = await generateFollowUpDrafts(NOW);

    expect(result).toEqual({ businessesProcessed: 0, draftsCreated: 0, draftsExpired: 0, errors: 0, abandonedBusinesses: 0 });
    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledTimes(3);
    expect(mocks.expirePastSlotOffers).toHaveBeenCalledTimes(1);
  });

  it("adds the stale-draft count and the slot-offer count into draftsExpired", async () => {
    mocks.prisma.followUpDraft.updateMany
      .mockResolvedValueOnce({ count: 2 }) // PAYMENT
      .mockResolvedValueOnce({ count: 3 }) // REBOOK
      .mockResolvedValueOnce({ count: 4 }); // THANK_YOU
    mocks.expirePastSlotOffers.mockResolvedValue({ expired: 5, released: 1, failed: 0 });

    const result = await generateFollowUpDrafts(NOW);

    expect(result.draftsExpired).toBe(14);
  });

  it("counts a failed stale-draft sweep as an error but still sweeps slot offers", async () => {
    mocks.prisma.followUpDraft.updateMany.mockRejectedValue(new Error("db down"));
    mocks.expirePastSlotOffers.mockResolvedValue({ expired: 2, released: 0, failed: 0 });

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

  // Codex #130: one offer failing no longer aborts the sweep, so the cron has to
  // hear about it some other way - counted, and logged by id.
  it("counts each slot offer the sweep could not retire as an error, keeping the count of those it did", async () => {
    mocks.expirePastSlotOffers.mockResolvedValue({ expired: 4, released: 3, failed: 2 });

    const result = await generateFollowUpDrafts(NOW);

    expect(result).toMatchObject({ errors: 2, draftsExpired: 4 });
  });

  it("logs a slot offer the sweep failed on by draft and business id only", async () => {
    const failure = new Error("deadlock detected");
    mocks.expirePastSlotOffers.mockImplementation(async (_businessId, _now, options) => {
      options.onError(failure, { id: "draft_9", businessId: "biz_9" });
      return { expired: 0, released: 0, failed: 1 };
    });

    await generateFollowUpDrafts(NOW);

    expect(mocks.logger.error).toHaveBeenCalledWith("Expiring a slot offer failed.", failure, {
      draftId: "draft_9",
      businessId: "biz_9",
    });
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

  // Codex #130: the budget above is only checked between businesses and between
  // writes, so a query that stalls inside a business used to hold the whole
  // invocation until the platform killed it — cursor not advanced, neither
  // sweep run, the same clinic stalling every hourly run. Each business now has
  // its own deadline, like the reminders cron's.
  describe("per-business deadline", () => {
    it("gives up on a business that stalls, still gives the next one its turn, advances the cursor past it and sweeps", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      mocks.prisma.business.findMany.mockResolvedValue([business("biz_1"), business("biz_2")]);
      mocks.findPaymentReminderCandidates.mockImplementationOnce(() => new Promise(() => {})); // biz_1 hangs

      const run = generateFollowUpDrafts(NOW);
      await vi.advanceTimersByTimeAsync(30_000);
      const result = await run;

      expect(mocks.findPaymentReminderCandidates.mock.calls.map((call) => call[0].businessId)).toEqual(["biz_1", "biz_2"]);
      expect(result).toMatchObject({ businessesProcessed: 2, abandonedBusinesses: 1, errors: 1 });
      expect(mocks.logger.error).toHaveBeenCalledWith(
        expect.stringContaining("per-business timeout"),
        undefined,
        expect.objectContaining({ businessId: "biz_1" })
      );
      // Not "biz_1" again: the stalled business took its turn, so the next run
      // starts after it instead of stalling on it forever.
      expect(mocks.setFollowUpCursor).toHaveBeenCalledWith("biz_2");
      expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledTimes(3);
      expect(mocks.expirePastSlotOffers).toHaveBeenCalledTimes(1);
    });

    it("still counts the drafts a business wrote before it stalled", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      mocks.prisma.business.findMany.mockResolvedValue([business("biz_1")]);
      mocks.findPaymentReminderCandidates.mockResolvedValue([paymentInput]);
      mocks.findThankYouCandidates.mockResolvedValue([thankYouInput]);
      mocks.prisma.followUpDraft.create
        .mockResolvedValueOnce({})
        .mockImplementationOnce(() => new Promise(() => {})); // the second insert hangs

      const run = generateFollowUpDrafts(NOW);
      await vi.advanceTimersByTimeAsync(30_000);

      expect(await run).toMatchObject({ draftsCreated: 1, abandonedBusinesses: 1 });
    });

    it("never lets a business run past the run budget: a late-starting one gets only what is left of it", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      mocks.prisma.business.findMany.mockResolvedValue([business("biz_1"), business("biz_2")]);
      // biz_1 finishes 80s into the 90s budget (the clock jumps; no timer fires).
      mocks.findPaymentReminderCandidates
        .mockImplementationOnce(async () => {
          vi.setSystemTime(Date.now() + 80_000);
          return [];
        })
        .mockImplementationOnce(() => new Promise(() => {})); // biz_2 hangs
      let settled = false;

      const run = generateFollowUpDrafts(NOW).then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(10_000); // all that is left of the budget, not the full 30s
      const finishedInTime = settled;
      await vi.advanceTimersByTimeAsync(60_000); // let a failing run finish instead of dangling

      expect(finishedInTime).toBe(true);
      expect((await run).abandonedBusinesses).toBe(1);
    });

    it("does not count, log or time out a business that finishes inside its deadline", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      mocks.prisma.business.findMany.mockResolvedValue([business("biz_1")]);
      mocks.findPaymentReminderCandidates.mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + 20_000);
        return [];
      });

      const result = await generateFollowUpDrafts(NOW);

      expect(result).toMatchObject({ businessesProcessed: 1, abandonedBusinesses: 0, errors: 0 });
      expect(mocks.logger.error).not.toHaveBeenCalled();
    });

    it("swallows the failure of work it already gave up on instead of crashing the run", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      mocks.prisma.business.findMany.mockResolvedValue([business("biz_1")]);
      let failLate: (error: Error) => void = () => {};
      mocks.findPaymentReminderCandidates.mockImplementationOnce(
        () => new Promise((_resolve, reject) => (failLate = reject))
      );

      const run = generateFollowUpDrafts(NOW);
      await vi.advanceTimersByTimeAsync(30_000);
      const result = await run;
      failLate(new Error("connection reset")); // the abandoned query finally fails

      await vi.advanceTimersByTimeAsync(0);
      expect(result.abandonedBusinesses).toBe(1);
    });
  });

  // Codex #130: a fixed `orderBy: { id: "asc" }` list combined with a budget
  // cutoff meant whichever businesses sorted last never got a turn on ANY
  // run — the stop-early warning above says "the next run continues," but
  // without rotation the next run hits the exact same cutoff at the exact
  // same businesses. Mirrors the reminders cron's own fairness fix
  // (reminder-fairness.ts / reminder-cursor.ts), reusing the same
  // rotate/advance helpers rather than a second implementation.
  describe("fairness rotation across runs", () => {
    it("resumes strictly after the persisted cursor instead of always starting at the front of the list", async () => {
      mocks.getFollowUpCursor.mockResolvedValue("biz_1");
      mocks.prisma.business.findMany.mockResolvedValue([business("biz_1"), business("biz_2"), business("biz_3")]);

      await generateFollowUpDrafts(NOW);

      // biz_2 (the smallest id greater than the cursor) is generated for
      // FIRST, not biz_1 — proving the run rotated rather than restarting
      // from the front every time.
      expect(mocks.findPaymentReminderCandidates.mock.calls.map((call) => call[0].businessId)).toEqual([
        "biz_2",
        "biz_3",
        "biz_1",
      ]);
    });

    it("advances the cursor to the last business actually attempted when the budget cuts a run short", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      mocks.getFollowUpCursor.mockResolvedValue(null);
      mocks.prisma.business.findMany.mockResolvedValue([business("biz_1"), business("biz_2"), business("biz_3")]);
      // biz_1 alone spends the whole budget — biz_2 and biz_3 never start.
      mocks.findPaymentReminderCandidates.mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + 91_000);
        return [];
      });

      await generateFollowUpDrafts(NOW);

      // Not "biz_1" again (that would starve biz_2/biz_3 forever) and not
      // "biz_3" (that would skip past businesses this run never touched).
      expect(mocks.setFollowUpCursor).toHaveBeenCalledWith("biz_1");
    });

    it("leaves the persisted cursor untouched when nothing was attempted (e.g. an empty business list)", async () => {
      mocks.prisma.business.findMany.mockResolvedValue([]);

      await generateFollowUpDrafts(NOW);

      expect(mocks.setFollowUpCursor).not.toHaveBeenCalled();
    });
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

  it("expires PAYMENT drafts whose payment is gone or no longer owed, or whose client went inactive/archived", async () => {
    await expireStaleFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        kind: "PAYMENT",
        status: "PENDING",
        OR: [
          { paymentId: null },
          { payment: { status: { notIn: ["Unpaid", "Partially Paid"] } } },
          { client: INELIGIBLE_CLIENT_WHERE },
        ],
      },
      data: { status: "EXPIRED" },
    });
  });

  it("expires REBOOK drafts once the client booked or was back within 28 days, went inactive/archived, the workspace is no longer Pro, or the draft is 35 days old", async () => {
    await expireStaleFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        kind: "REBOOK",
        status: "PENDING",
        OR: [
          {
            client: {
              appointments: {
                some: {
                  OR: [
                    // A future booking...
                    { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: NOW } },
                    // ...or a confirmed/completed visit inside the last 28 days (a walk-in recorded since).
                    { status: { in: ["CONFIRMED", "COMPLETED"] }, startAt: { gt: new Date(NOW.getTime() - 28 * DAY_MS) } },
                  ],
                },
              },
            },
          },
          { client: INELIGIBLE_CLIENT_WHERE },
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

  it("expires THANK_YOU drafts older than 3 days, or whose visit is gone or no longer completed (e.g. since recorded as a no-show), or whose client went inactive/archived", async () => {
    await expireStaleFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        kind: "THANK_YOU",
        status: "PENDING",
        OR: [
          { createdAt: { lt: new Date(NOW.getTime() - 3 * DAY_MS) } },
          { appointmentId: null },
          { appointment: { status: { not: "COMPLETED" } } },
          { client: INELIGIBLE_CLIENT_WHERE },
        ],
      },
      data: { status: "EXPIRED" },
    });
  });

  // Codex #130: the age limits are N clinic-local days like every other day
  // window in the workflows, not N * 24 hours (an hour off across a clock change).
  it("counts the thank-you and rebook age limits in clinic-local days across a daylight-saving change", async () => {
    // 2026-10-26 10:00 CET, the morning after Europe/Budapest left daylight time.
    await expireStaleFollowUpDrafts(new Date("2026-10-26T09:00:00Z"));

    const calls = mocks.prisma.followUpDraft.updateMany.mock.calls.map(([arg]) => arg);
    const ageLimit = (kind: string) =>
      calls
        .find((arg) => arg.where.kind === kind)
        .where.OR.find((branch: { createdAt?: unknown }) => branch.createdAt).createdAt.lt;

    // 3 clinic days earlier: Fri 2026-10-23 10:00 CEST. 35 days earlier: Mon 2026-09-21 10:00 CEST.
    expect(ageLimit("THANK_YOU")).toEqual(new Date("2026-10-23T08:00:00Z"));
    expect(ageLimit("REBOOK")).toEqual(new Date("2026-09-21T08:00:00Z"));
  });
});

describe("generateFollowUpDrafts — per-kind pending cap (50)", () => {
  function candidates(kind: FollowUpDraftInput["kind"], count: number, prefix: string = kind): FollowUpDraftInput[] {
    return Array.from({ length: count }, (_, index) => ({
      clientId: `c_${prefix}_${index}`,
      kind,
      body: `${kind} body`,
      dedupeKey: `${prefix}:${index}`,
    }));
  }

  function writtenKeys(kind?: FollowUpDraftInput["kind"], businessId?: string) {
    return mocks.prisma.followUpDraft.create.mock.calls
      .map(([arg]) => arg.data)
      .filter((data) => (!kind || data.kind === kind) && (!businessId || data.businessId === businessId))
      .map((data) => data.dedupeKey);
  }

  it("counts PENDING drafts once per business, scoped to that business and the generated kinds", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_1"), business("biz_2")]);

    await generateFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.groupBy).toHaveBeenCalledTimes(2);
    for (const businessId of ["biz_1", "biz_2"]) {
      expect(mocks.prisma.followUpDraft.groupBy).toHaveBeenCalledWith({
        by: ["kind"],
        where: { businessId, status: "PENDING", kind: { in: ["REBOOK", "PAYMENT", "THANK_YOU"] } },
        _count: { _all: true },
      });
    }
  });

  it("writes nothing for a kind already at the cap, and doesn't even query its generator", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_1")]);
    mocks.prisma.followUpDraft.groupBy.mockResolvedValue([
      { kind: "REBOOK", _count: { _all: 50 } },
      { kind: "PAYMENT", _count: { _all: 50 } },
      { kind: "THANK_YOU", _count: { _all: 50 } },
    ]);
    mocks.findRebookCandidates.mockResolvedValue(candidates("REBOOK", 3));
    mocks.findPaymentReminderCandidates.mockResolvedValue(candidates("PAYMENT", 3));
    mocks.findThankYouCandidates.mockResolvedValue(candidates("THANK_YOU", 3));

    const result = await generateFollowUpDrafts(NOW);

    expect(mocks.prisma.followUpDraft.create).not.toHaveBeenCalled();
    expect(mocks.findRebookCandidates).not.toHaveBeenCalled();
    expect(mocks.findPaymentReminderCandidates).not.toHaveBeenCalled();
    expect(mocks.findThankYouCandidates).not.toHaveBeenCalled();
    expect(result).toMatchObject({ draftsCreated: 0, errors: 0 });
  });

  it("with partial room, writes exactly the remaining slots — the oldest candidates, in order — per kind", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_1")]);
    mocks.prisma.followUpDraft.groupBy.mockResolvedValue([
      { kind: "REBOOK", _count: { _all: 47 } }, // room for 3
      { kind: "PAYMENT", _count: { _all: 49 } }, // room for 1
      // no THANK_YOU pending: room for 50
    ]);
    mocks.findRebookCandidates.mockResolvedValue(candidates("REBOOK", 200));
    mocks.findPaymentReminderCandidates.mockResolvedValue(candidates("PAYMENT", 5));
    mocks.findThankYouCandidates.mockResolvedValue(candidates("THANK_YOU", 60));

    const result = await generateFollowUpDrafts(NOW);

    expect(writtenKeys("REBOOK")).toEqual(["REBOOK:0", "REBOOK:1", "REBOOK:2"]);
    expect(writtenKeys("PAYMENT")).toEqual(["PAYMENT:0"]);
    expect(writtenKeys("THANK_YOU")).toEqual(candidates("THANK_YOU", 50).map((input) => input.dedupeKey));
    expect(result.draftsCreated).toBe(54);
  });

  it("gives each business its own room: one clinic's backlog doesn't use up another's", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_full"), business("biz_empty")]);
    mocks.prisma.followUpDraft.groupBy.mockImplementation(async ({ where }: { where: { businessId: string } }) =>
      where.businessId === "biz_full" ? [{ kind: "PAYMENT", _count: { _all: 50 } }] : []
    );
    mocks.findPaymentReminderCandidates.mockImplementation(async ({ businessId }: { businessId: string }) =>
      candidates("PAYMENT", 2, businessId)
    );
    mocks.findThankYouCandidates.mockImplementation(async ({ businessId }: { businessId: string }) =>
      candidates("THANK_YOU", 2, businessId)
    );

    await generateFollowUpDrafts(NOW);

    expect(writtenKeys("PAYMENT", "biz_full")).toEqual([]);
    // Payment being full doesn't limit the same clinic's thank-yous.
    expect(writtenKeys("THANK_YOU", "biz_full")).toEqual(["biz_full:0", "biz_full:1"]);
    expect(writtenKeys("PAYMENT", "biz_empty")).toEqual(["biz_empty:0", "biz_empty:1"]);
    expect(writtenKeys("THANK_YOU", "biz_empty")).toEqual(["biz_empty:0", "biz_empty:1"]);
  });

  it("counts a failed pending-count query against that business and still runs the next one", async () => {
    mocks.prisma.business.findMany.mockResolvedValue([business("biz_bad"), business("biz_good")]);
    mocks.prisma.followUpDraft.groupBy.mockImplementation(async ({ where }: { where: { businessId: string } }) => {
      if (where.businessId === "biz_bad") throw new Error("db hiccup");
      return [];
    });
    mocks.findPaymentReminderCandidates.mockResolvedValue([paymentInput]);

    const result = await generateFollowUpDrafts(NOW);

    expect(result).toMatchObject({ businessesProcessed: 2, draftsCreated: 1, errors: 1 });
    expect(writtenKeys(undefined, "biz_good")).toEqual(["PAYMENT:pay1"]);
  });
});
