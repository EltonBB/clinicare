import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureThread: vi.fn(),
  transaction: vi.fn(),
  messageCreate: vi.fn(),
  threadUpdate: vi.fn(),
  notificationCreate: vi.fn(),
  deviceFindMany: vi.fn(),
  sendPush: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/mobile/inbox", () => ({ ensureAdminThread: mocks.ensureThread }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    staffDevice: { findMany: mocks.deviceFindMany },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.logError } }));
vi.mock("@/lib/mobile/push", async () => {
  const actual = await vi.importActual<typeof import("./push")>("./push");
  return { ...actual, sendStaffPush: mocks.sendPush };
});

import { postAdminThreadMessage } from "./admin-inbox";

describe("postAdminThreadMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureThread.mockResolvedValue({ id: "thread_1" });
    mocks.messageCreate.mockResolvedValue({ id: "message_1" });
    mocks.threadUpdate.mockResolvedValue({});
    mocks.notificationCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        staffThreadMessage: { create: mocks.messageCreate },
        staffThread: { update: mocks.threadUpdate },
        staffNotification: { create: mocks.notificationCreate },
      }),
    );
    mocks.deviceFindMany.mockResolvedValue([{ expoPushToken: "ExpoPushToken[fixture]" }]);
    mocks.sendPush.mockResolvedValue(undefined);
  });

  it("keeps a saved message successful when the post-commit device lookup fails", async () => {
    mocks.deviceFindMany.mockRejectedValueOnce(new Error("Connection failed"));
    await expect(postAdminThreadMessage("business_1", "staff_1", "Hello")).resolves.toEqual({
      ok: true,
      threadId: "thread_1",
    });
    expect(mocks.messageCreate).toHaveBeenCalledOnce();
    expect(mocks.sendPush).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledOnce();
  });

  it("limits pushes to the same clinic and currently eligible devices", async () => {
    await postAdminThreadMessage("business_1", "staff_1", "Hello");
    const where = mocks.deviceFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      businessId: "business_1",
      staffMemberId: "staff_1",
      revokedAt: null,
      staffMember: { isActive: true, status: { not: "INACTIVE" } },
    });
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(mocks.sendPush).toHaveBeenCalledOnce();
  });

  it("still reports a transaction failure before saving the message", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("Write failed"));
    await expect(postAdminThreadMessage("business_1", "staff_1", "Hello")).rejects.toThrow(
      "Write failed",
    );
    expect(mocks.deviceFindMany).not.toHaveBeenCalled();
  });
});
