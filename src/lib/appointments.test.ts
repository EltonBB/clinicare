import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const appointment = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const $transaction = vi.fn();
  const refreshClientLastVisitAt = vi.fn();
  return { appointment, $transaction, refreshClientLastVisitAt };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: mocks.appointment,
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
  mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ appointment: mocks.appointment })
  );
});

describe("completePastConfirmedAppointments", () => {
  it("does nothing when no confirmed appointment is due", async () => {
    mocks.appointment.findMany.mockResolvedValue([]);

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
});
