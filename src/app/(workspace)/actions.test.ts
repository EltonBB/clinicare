import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentWorkspace: vi.fn(),
  isWithinActionBudget: vi.fn(),
  conversation: { aggregate: vi.fn(), findMany: vi.fn() },
  staffThread: { aggregate: vi.fn(), findMany: vi.fn() },
  staffTimeEntry: { count: vi.fn(), findMany: vi.fn() },
  business: { findUnique: vi.fn() },
  appointment: { count: vi.fn() },
}));

vi.mock("@/lib/business", () => ({
  ACTION_RATE_LIMIT_ERROR: "rate limited",
  isWithinActionBudget: mocks.isWithinActionBudget,
  requireCurrentWorkspace: mocks.requireCurrentWorkspace,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: mocks.conversation,
    staffThread: mocks.staffThread,
    staffTimeEntry: mocks.staffTimeEntry,
    business: mocks.business,
    appointment: mocks.appointment,
  },
}));
// reminders.ts pulls in the messaging stack; only its pure readiness rule is used here.
vi.mock("@/lib/messaging", () => ({ sendMessage: vi.fn() }));

import { refreshWorkspaceNotificationsAction } from "./actions";
import { isReminderChannelReady } from "@/lib/reminders";

function channel(overrides: {
  whatsappEnabled?: boolean;
  status?: string | null;
  send24?: boolean;
  send2?: boolean;
} = {}) {
  return {
    whatsappEnabled: overrides.whatsappEnabled ?? true,
    whatsappConnection: overrides.status === null ? null : { status: overrides.status ?? "CONNECTED" },
    reminderSettings: { send24HourReminder: overrides.send24 ?? true, send2HourReminder: overrides.send2 ?? true },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentWorkspace.mockResolvedValue({ business: { id: "biz_1" }, user: { id: "user_1" } });
  mocks.isWithinActionBudget.mockResolvedValue(true);
  mocks.conversation.aggregate.mockResolvedValue({ _sum: { unreadCount: 0 } });
  mocks.conversation.findMany.mockResolvedValue([]);
  mocks.staffThread.aggregate.mockResolvedValue({ _sum: { unreadForAdmin: 0 } });
  mocks.staffThread.findMany.mockResolvedValue([]);
  mocks.staffTimeEntry.count.mockResolvedValue(0);
  mocks.staffTimeEntry.findMany.mockResolvedValue([]);
  mocks.appointment.count.mockResolvedValue(1);
});

describe("isReminderChannelReady", () => {
  it("is ready only while enabled and CONNECTED or ERRORED, the states the reminders cron sends through", () => {
    expect(isReminderChannelReady(true, "CONNECTED")).toBe(true);
    expect(isReminderChannelReady(true, "ERRORED")).toBe(true);
    expect(isReminderChannelReady(true, "DISCONNECTED")).toBe(false);
    expect(isReminderChannelReady(true, "PENDING_SETUP")).toBe(false);
    expect(isReminderChannelReady(true, undefined)).toBe(false);
    expect(isReminderChannelReady(false, "CONNECTED")).toBe(false);
  });
});

// Owner report 2026-10-18: a dropped WhatsApp link stopped reminders with no
// sign anywhere but Settings.
describe("refreshWorkspaceNotificationsAction remindersBlocked", () => {
  it("flags a disconnected clinic with a visit coming up in the next 24 hours", async () => {
    mocks.business.findUnique.mockResolvedValue(channel({ status: "DISCONNECTED" }));

    const result = await refreshWorkspaceNotificationsAction();

    expect(result.view?.remindersBlocked).toBe(true);
    expect(mocks.appointment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: "biz_1", status: { notIn: ["CANCELLED", "NO_SHOW"] } }),
      })
    );
  });

  it("flags a clinic that never connected WhatsApp", async () => {
    mocks.business.findUnique.mockResolvedValue(channel({ whatsappEnabled: false, status: null }));

    expect((await refreshWorkspaceNotificationsAction()).view?.remindersBlocked).toBe(true);
  });

  it("stays quiet when nothing is booked in the next 24 hours", async () => {
    mocks.business.findUnique.mockResolvedValue(channel({ status: "DISCONNECTED" }));
    mocks.appointment.count.mockResolvedValue(0);

    expect((await refreshWorkspaceNotificationsAction()).view?.remindersBlocked).toBe(false);
  });

  it("stays quiet, without counting visits, while the link is up", async () => {
    mocks.business.findUnique.mockResolvedValue(channel({ status: "ERRORED" }));

    expect((await refreshWorkspaceNotificationsAction()).view?.remindersBlocked).toBe(false);
    expect(mocks.appointment.count).not.toHaveBeenCalled();
  });

  it("stays quiet when both reminders are switched off", async () => {
    mocks.business.findUnique.mockResolvedValue(channel({ status: "DISCONNECTED", send24: false, send2: false }));

    expect((await refreshWorkspaceNotificationsAction()).view?.remindersBlocked).toBe(false);
    expect(mocks.appointment.count).not.toHaveBeenCalled();
  });
});
