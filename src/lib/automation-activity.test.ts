import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ message: { findMany: vi.fn(), groupBy: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: { message: mocks.message } }));

import { ACTIVITY_PAGE_SIZE, listAutomationActivity, parseActivityKind } from "./automation-activity";

const NOW = new Date("2026-10-20T10:00:00.000Z");

function message(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    automationKind: "THANK_YOU",
    clientId: "client_1",
    sentAt: new Date("2026-10-20T08:00:00.000Z"),
    deliveryStatus: "DELIVERED",
    client: { name: "Maya" },
    conversation: { contactName: "Maya" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.message.findMany.mockResolvedValue([message("m_1")]);
  mocks.message.groupBy.mockResolvedValue([
    { automationKind: "THANK_YOU", _count: { _all: 4 } },
    { automationKind: "FIRST_REMINDER", _count: { _all: 9 } },
  ]);
});

describe("listAutomationActivity", () => {
  it("lists this workspace's automated sends from the last 30 days, newest first", async () => {
    const result = await listAutomationActivity({ businessId: "biz_1", now: NOW });

    const args = mocks.message.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      direction: "OUTBOUND",
      automationKind: { not: null },
      sentAt: { gte: new Date("2026-09-20T10:00:00.000Z") },
      conversation: { is: { businessId: "biz_1" } },
    });
    expect(args.orderBy).toEqual([{ sentAt: "desc" }, { id: "desc" }]);
    expect(result.rows).toEqual([
      expect.objectContaining({ id: "m_1", label: "Thank-you", clientName: "Maya", status: "Delivered" }),
    ]);
    expect(result.counts).toEqual({ THANK_YOU: 4, FIRST_REMINDER: 9 });
    expect(result.total).toBe(13);
  });

  it("filters by automation and pages server-side", async () => {
    mocks.message.findMany.mockResolvedValue(
      Array.from({ length: ACTIVITY_PAGE_SIZE + 1 }, (_, index) => message(`m_${index}`))
    );

    const result = await listAutomationActivity({ businessId: "biz_1", kind: "THANK_YOU", page: 2, now: NOW });

    const args = mocks.message.findMany.mock.calls[0][0];
    expect(args.where.automationKind).toBe("THANK_YOU");
    expect(args.skip).toBe(ACTIVITY_PAGE_SIZE);
    expect(result.rows).toHaveLength(ACTIVITY_PAGE_SIZE);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(4);
  });

  it("names a send with no client record after its conversation", async () => {
    mocks.message.findMany.mockResolvedValue([message("m_1", { clientId: null, client: null, deliveryStatus: "FAILED" })]);

    const [row] = (await listAutomationActivity({ businessId: "biz_1", now: NOW })).rows;

    expect(row).toMatchObject({ clientId: null, clientName: "Maya", status: "Failed" });
  });
});

describe("parseActivityKind", () => {
  it("only accepts a real automation", () => {
    expect(parseActivityKind("THANK_YOU")).toBe("THANK_YOU");
    expect(parseActivityKind("DROP TABLE")).toBeUndefined();
    expect(parseActivityKind(undefined)).toBeUndefined();
  });
});
