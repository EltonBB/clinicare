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
import { refreshWorkspaceNotificationsAction } from "./actions";

function channel(overrides: {
  whatsappEnabled?: boolean;
  status?: string | null;
  send24?: boolean;
  send2?: boolean;
} = {}) {
  return {
    plan: "PRO",
    whatsappEnabled: overrides.whatsappEnabled ?? true,
    whatsappConnection: overrides.status === null ? null : { status: overrides.status ?? "CONNECTED" },
    automationSettings: [],
    workflowSettings: null,
    reminderSettings: {
      send24HourReminder: overrides.send24 ?? true,
      send2HourReminder: overrides.send2 ?? true,
      firstReminderHours: 24,
      secondReminderHours: 2,
      template: null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentWorkspace.mockResolvedValue({
    business: { id: "biz_1", billingMode: "COMPLIMENTARY" },
    user: { id: "user_1" },
  });
  mocks.isWithinActionBudget.mockResolvedValue(true);
  mocks.conversation.aggregate.mockResolvedValue({ _sum: { unreadCount: 0 } });
  mocks.conversation.findMany.mockResolvedValue([]);
  mocks.staffThread.aggregate.mockResolvedValue({ _sum: { unreadForAdmin: 0 } });
  mocks.staffThread.findMany.mockResolvedValue([]);
  mocks.staffTimeEntry.count.mockResolvedValue(0);
  mocks.staffTimeEntry.findMany.mockResolvedValue([]);
  mocks.appointment.count.mockResolvedValue(1);
});

// Owner report 2026-10-18: a dropped WhatsApp link stopped reminders with no
// sign anywhere but Settings.
describe("refreshWorkspaceNotificationsAction reminderWarning", () => {
  const warningFor = async () => (await refreshWorkspaceNotificationsAction()).view?.reminderWarning;

  it("warns a disconnected clinic with a visit coming up in the next 24 hours", async () => {
    mocks.business.findUnique.mockResolvedValue(channel({ status: "DISCONNECTED" }));

    expect(await warningFor()).toBe("disconnected");
    expect(mocks.appointment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: "biz_1", status: { notIn: ["CANCELLED", "NO_SHOW"] } }),
      })
    );
  });

  it("warns a clinic that never connected WhatsApp", async () => {
    mocks.business.findUnique.mockResolvedValue(channel({ whatsappEnabled: false, status: null }));

    expect(await warningFor()).toBe("disconnected");
  });

  // Codex #166: the cron keeps retrying an ERRORED link, but its sends are
  // failing, so the owner still has to hear about it.
  it("warns, distinctly, while the link is ERRORED", async () => {
    mocks.business.findUnique.mockResolvedValue(channel({ status: "ERRORED" }));

    expect(await warningFor()).toBe("errored");
  });

  it("stays quiet for a read-only workspace, which sends no reminders by design", async () => {
    mocks.requireCurrentWorkspace.mockResolvedValue({
      business: { id: "biz_1", billingMode: "SUBSCRIPTION", subscriptionStatus: "CANCELED" },
      user: { id: "user_1" },
    });
    mocks.business.findUnique.mockResolvedValue(channel({ status: "DISCONNECTED" }));

    expect(await warningFor()).toBeNull();
    expect(mocks.appointment.count).not.toHaveBeenCalled();
  });

  it("stays quiet when nothing is booked in the next 24 hours", async () => {
    mocks.business.findUnique.mockResolvedValue(channel({ status: "DISCONNECTED" }));
    mocks.appointment.count.mockResolvedValue(0);

    expect(await warningFor()).toBeNull();
  });

  it("stays quiet, without counting visits, while connected", async () => {
    mocks.business.findUnique.mockResolvedValue(channel({ status: "CONNECTED" }));

    expect(await warningFor()).toBeNull();
    expect(mocks.appointment.count).not.toHaveBeenCalled();
  });

  it("stays quiet when both reminders are switched off", async () => {
    mocks.business.findUnique.mockResolvedValue(channel({ status: "DISCONNECTED", send24: false, send2: false }));

    expect(await warningFor()).toBeNull();
    expect(mocks.appointment.count).not.toHaveBeenCalled();
  });
});
