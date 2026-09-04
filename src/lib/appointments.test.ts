import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const appointment = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const client = {
    findMany: vi.fn(),
  };
  const $transaction = vi.fn();
  const refreshClientLastVisitAt = vi.fn();
  return { appointment, client, $transaction, refreshClientLastVisitAt };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: mocks.appointment,
    client: mocks.client,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/lib/appointments-shared", () => ({
  refreshClientLastVisitAt: mocks.refreshClientLastVisitAt,
}));

import { completePastConfirmedAppointments } from "./appointments";

const BUSINESS_ID = "biz_1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appointment.findMany.mockResolvedValue([]);
  mocks.client.findMany.mockResolvedValue([]);
  mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ appointment: mocks.appointment })
  );
});

describe("completePastConfirmedAppointments", () => {
  it("does nothing when no confirmed appointment is due and no client is stale", async () => {
    await completePastConfirmedAppointments(BUSINESS_ID);

    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(mocks.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.refreshClientLastVisitAt).not.toHaveBeenCalled();
  });

  it("completes due appointments and refreshes lastVisitAt for each affected client", async () => {
    // The appointment being auto-completed here was future-dated when
    // created, so refreshClientLastVisitAt found nothing to set back then —
    // this is the exact case that left lastVisitAt stuck at null forever
    // without this refresh (Codex finding on the "No visits" chip fix).
    mocks.appointment.findMany.mockResolvedValue([
      { clientId: "client_1" },
      { clientId: "client_2" },
    ]);
    mocks.appointment.updateMany.mockResolvedValue({ count: 2 });

    await completePastConfirmedAppointments(BUSINESS_ID);

    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: BUSINESS_ID, status: "CONFIRMED" }),
        distinct: ["clientId"],
      })
    );
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: BUSINESS_ID, status: "CONFIRMED" }),
        data: { status: "COMPLETED" },
      })
    );
    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledTimes(2);
    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledWith(
      "client_1",
      BUSINESS_ID,
      expect.anything()
    );
    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledWith(
      "client_2",
      BUSINESS_ID,
      expect.anything()
    );
  });

  it("refreshes only once per distinct client even with multiple due appointments", async () => {
    // distinct: ["clientId"] is asserted above on the query itself — this
    // confirms the loop doesn't separately re-introduce a per-appointment
    // (rather than per-client) refresh even if that ever changed.
    mocks.appointment.findMany.mockResolvedValue([{ clientId: "client_1" }]);
    mocks.appointment.updateMany.mockResolvedValue({ count: 3 });

    await completePastConfirmedAppointments(BUSINESS_ID);

    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledTimes(1);
  });

  it("backfills a client stuck at lastVisitAt: null from before this refresh existed, with no due appointment this pass", async () => {
    // Codex finding: a client whose visit was auto-completed before this fix
    // shipped already has lastVisitAt null and nothing left to trigger a
    // refresh — this must self-heal without requiring a new appointment.
    mocks.client.findMany.mockResolvedValue([{ id: "client_stale" }]);

    await completePastConfirmedAppointments(BUSINESS_ID);

    expect(mocks.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: BUSINESS_ID,
          lastVisitAt: null,
        }),
      })
    );
    // Nothing is newly due, so there's no status update to run and nothing
    // needs the transaction — the backfill refresh runs standalone (no tx
    // argument), matching the Codex finding that an unbounded historical
    // backlog must not risk Prisma's default 5s transaction timeout.
    expect(mocks.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledTimes(1);
    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledWith("client_stale", BUSINESS_ID);
  });

  it("dedupes a client that is both newly due and already stale, refreshing it once via the transaction path", async () => {
    mocks.appointment.findMany.mockResolvedValue([{ clientId: "client_1" }]);
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.client.findMany.mockResolvedValue([{ id: "client_1" }]);

    await completePastConfirmedAppointments(BUSINESS_ID);

    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledTimes(1);
    // The due-path call carries a tx as its 3rd argument — confirms the
    // stale-backlog loop correctly skipped this client rather than
    // refreshing it a second time outside the transaction.
    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledWith(
      "client_1",
      BUSINESS_ID,
      expect.anything()
    );
  });

  it("keeps the historical backfill outside the transaction even when appointments are also due", async () => {
    // Two different clients: client_1 has a newly-due appointment,
    // client_stale is a pre-existing, unrelated backlog entry. Both must be
    // refreshed, but only client_1's refresh should carry a tx.
    mocks.appointment.findMany.mockResolvedValue([{ clientId: "client_1" }]);
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.client.findMany.mockResolvedValue([{ id: "client_stale" }]);

    await completePastConfirmedAppointments(BUSINESS_ID);

    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledTimes(2);
    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledWith(
      "client_1",
      BUSINESS_ID,
      expect.anything()
    );
    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledWith("client_stale", BUSINESS_ID);
  });

  it("splits a large backlog of newly-due clients into separate, smaller transactions instead of one unbounded one", async () => {
    // Codex finding: the throttled sweep only runs once per 5 minutes per
    // business and only when someone navigates, so a quiet clinic (a
    // multi-day closure) can accumulate far more than a handful of newly-due
    // clients before the next run — one giant transaction over all of them
    // risks Prisma's default 5s interactive-transaction timeout.
    const dueClientIds = Array.from({ length: 30 }, (_, index) => `client_${index}`);
    mocks.appointment.findMany.mockResolvedValue(
      dueClientIds.map((clientId) => ({ clientId }))
    );
    mocks.appointment.updateMany.mockResolvedValue({ count: 30 });

    await completePastConfirmedAppointments(BUSINESS_ID);

    // 30 clients at a batch size of 25 -> two transactions, not one.
    expect(mocks.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalledTimes(30);

    const updateManyWhereClauses = mocks.appointment.updateMany.mock.calls.map(
      ([args]) => args.where
    );
    expect(updateManyWhereClauses).toHaveLength(2);
    // Each batch's completion update is scoped to only that batch's clients,
    // not a blanket update over every due appointment in one go.
    expect(updateManyWhereClauses[0].clientId.in).toHaveLength(25);
    expect(updateManyWhereClauses[1].clientId.in).toHaveLength(5);
    const allBatchedClientIds = [
      ...updateManyWhereClauses[0].clientId.in,
      ...updateManyWhereClauses[1].clientId.in,
    ];
    expect(new Set(allBatchedClientIds)).toEqual(new Set(dueClientIds));
  });
});
