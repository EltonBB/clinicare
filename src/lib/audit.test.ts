import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMany, loggerError } = vi.hoisted(() => ({ createMany: vi.fn(), loggerError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { createMany } } }));
vi.mock("@/lib/logger", () => ({ logger: { error: loggerError } }));

import { ownerActor, recordAudit, staffActor } from "./audit";

describe("recordAudit", () => {
  beforeEach(() => {
    createMany.mockReset();
    loggerError.mockReset();
  });

  it("writes one row per entry, ids only", async () => {
    createMany.mockResolvedValue({ count: 2 });
    await recordAudit([
      { businessId: "biz", actor: ownerActor({ id: "user_1" }), action: "client.view", clientId: "client_1" },
      { businessId: "biz", actor: staffActor({ id: "staff_1" }), action: "appointment.cancel", clientId: "client_1", recordId: "appt_1" },
    ]);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { businessId: "biz", actorType: "OWNER", actorId: "user_1", action: "client.view", clientId: "client_1", recordId: null },
        { businessId: "biz", actorType: "STAFF", actorId: "staff_1", action: "appointment.cancel", clientId: "client_1", recordId: "appt_1" },
      ],
    });
  });

  it("writes nothing for an empty list", async () => {
    await recordAudit([]);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("never throws: a failed write is logged with ids only", async () => {
    createMany.mockRejectedValue(new Error("db down"));
    await expect(
      recordAudit({ businessId: "biz", actor: ownerActor({ id: "user_1" }), action: "payment.update", clientId: "client_1", recordId: "pay_1" })
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith("Audit log write failed.", expect.any(Error), {
      businessId: "biz",
      action: "payment.update",
      count: 1,
    });
  });
});
