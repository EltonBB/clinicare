"use server";

import { ACTION_RATE_LIMIT_ERROR, isWithinActionBudget, requireCurrentWorkspace } from "@/lib/business";
import { checkinDetail } from "@/lib/notification-copy";
import { AUTOMATION_SETTINGS_SELECT, automationSettingsFromBusiness } from "@/lib/automations-data";
import { prisma } from "@/lib/prisma";

// Reminders go out at most 24 hours before a visit (reminders.ts clamps both
// offsets to 1..24), so a visit inside this window is one that is, or soon
// will be, owed a reminder.
const REMINDER_HORIZON_MS = 24 * 60 * 60 * 1000;

export type ReminderWarning = "disconnected" | "errored" | null;

export type WorkspaceNotificationsView = {
  // Combined total across all three sources — feeds ONLY the bell's own badge
  // and header count. NOT the same number as `inboxUnreadCount` below — do not
  // wire this into WorkspaceLiveContext/useWorkspaceUnreadCount, whose existing
  // consumers (the dashboard "Unread messages" KPI, the Messages card badge)
  // specifically mean patient-inbox unread and would silently start counting
  // staff chatter and check-ins as "messages needing a reply" otherwise.
  unreadCount: number;
  // Patient-inbox-only unread — the correct value for anything that means
  // "unread conversations" specifically (WorkspaceLiveContext's `unreadCount`).
  inboxUnreadCount: number;
  // Staff-side unread for the Staff nav badge: unread staff-thread messages
  // plus check-ins the admin hasn't seen. Like inboxUnreadCount it comes from
  // the true (uncapped) counts, NOT the capped `notifications` list, so a busier
  // source can never crowd a quieter one out of its badge.
  staffUnreadCount: number;
  // Set while reminders are switched on and a visit is coming up in the next
  // 24 hours, but WhatsApp isn't healthy: "disconnected" when there is no live
  // link (the reminders cron skips the clinic entirely), "errored" when the
  // link is up but sends are failing (the cron keeps retrying, but reminders
  // may not arrive). Drives the workspace banner and the bell's pinned row, so
  // a WhatsApp problem never stops reminders silently (owner report, 2026-10-18).
  reminderWarning: ReminderWarning;
  notifications: Array<{
    id: string;
    title: string;
    detail: string;
    href: string;
  }>;
};

/**
 * Feeds the app-shell bell — a durable, DB-backed view of what needs the
 * admin's attention, so it survives even if they miss the toast (WorkspaceToaster)
 * that also fires for the same staff activity. Three sources, merged by
 * recency: patient-inbox unread (Conversation.unreadCount), staff↔admin thread
 * unread (StaffThread.unreadForAdmin — the same field the Staff directory's
 * per-row dot already sums; see getStaffUnreadMessageCounts), and staff
 * check-ins the admin hasn't viewed yet (StaffTimeEntry.seenByAdminAt — the
 * toaster's own check-in toast is a 10-minute rolling window with nothing
 * persisted once it scrolls past, so this is the only durable record of a
 * check-in the admin missed). Nothing here marks anything read — that only
 * happens when the admin actually opens the inbox conversation, the staff
 * Messages tab, or (for check-ins) the staff member's detail page, same as
 * everything else in this bell.
 */
export async function refreshWorkspaceNotificationsAction(): Promise<{
  ok: boolean;
  error?: string;
  view?: WorkspaceNotificationsView;
}> {
  const { business, user } = await requireCurrentWorkspace("/dashboard", {
    missingBusinessRedirect: "/onboarding",
  });

  if (!(await isWithinActionBudget(user.id))) {
    return { ok: false, error: ACTION_RATE_LIMIT_ERROR };
  }

  const [
    unreadAggregate,
    notificationRows,
    staffUnreadAggregate,
    staffThreadRows,
    unseenCheckInsCount,
    checkInRows,
    reminderChannel,
  ] = await Promise.all([
    prisma.conversation.aggregate({
      where: {
        businessId: business.id,
        unreadCount: {
          gt: 0,
        },
      },
      _sum: {
        unreadCount: true,
      },
    }),
    prisma.conversation.findMany({
      where: {
        businessId: business.id,
        unreadCount: {
          gt: 0,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 3,
      select: {
        id: true,
        contactName: true,
        unreadCount: true,
        updatedAt: true,
      },
    }),
    prisma.staffThread.aggregate({
      where: { businessId: business.id, unreadForAdmin: { gt: 0 } },
      _sum: { unreadForAdmin: true },
    }),
    prisma.staffThread.findMany({
      where: { businessId: business.id, unreadForAdmin: { gt: 0 } },
      orderBy: { lastMessageAt: "desc" },
      take: 3,
      select: {
        staffMemberId: true,
        unreadForAdmin: true,
        lastMessageAt: true,
        staffMember: { select: { name: true } },
      },
    }),
    prisma.staffTimeEntry.count({
      where: { businessId: business.id, seenByAdminAt: null },
    }),
    prisma.staffTimeEntry.findMany({
      where: { businessId: business.id, seenByAdminAt: null },
      orderBy: { checkedInAt: "desc" },
      take: 3,
      select: {
        id: true,
        checkedInAt: true,
        staffMemberId: true,
        staffMember: { select: { name: true } },
      },
    }),
    prisma.business.findUnique({
      where: { id: business.id },
      select: {
        whatsappEnabled: true,
        whatsappConnection: { select: { status: true } },
        ...AUTOMATION_SETTINGS_SELECT,
      },
    }),
  ]);

  const automations = reminderChannel ? automationSettingsFromBusiness(reminderChannel) : null;
  const remindersOn =
    !!automations &&
    (automations.FIRST_REMINDER.enabled || automations.SECOND_REMINDER.enabled || automations.HIGH_RISK_REMINDER.enabled);
  // Healthy means fully CONNECTED. Deliberately stricter than the reminders
  // cron, which also retries an ERRORED link so it can self-heal: those sends
  // are failing right now, so the owner should hear about it (Codex #166).
  const connectionStatus = reminderChannel?.whatsappConnection?.status;
  const channelHealthy = !!reminderChannel?.whatsappEnabled && connectionStatus === "CONNECTED";
  // Visits are only counted when there's a problem, so a healthy clinic pays
  // nothing extra per poll. Same status filter as the reminders cron's query.
  const visitsOwedReminders =
    !!reminderChannel &&
    remindersOn &&
    !channelHealthy &&
    (await prisma.appointment.count({
      where: {
        businessId: business.id,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        startAt: { gt: new Date(), lte: new Date(Date.now() + REMINDER_HORIZON_MS) },
      },
      take: 1,
    })) > 0;
  const reminderWarning: ReminderWarning = !visitsOwedReminders
    ? null
    : reminderChannel?.whatsappEnabled && connectionStatus === "ERRORED"
      ? "errored"
      : "disconnected";

  const inboxItems = notificationRows.map((row) => ({
    id: `conversation:${row.id}`,
    title: row.contactName,
    detail: `${row.unreadCount} unread message${
      row.unreadCount === 1 ? "" : "s"
    } waiting in the inbox.`,
    href: "/inbox",
    atMs: row.updatedAt.getTime(),
  }));

  const staffItems = staffThreadRows.map((row) => ({
    id: `staff:${row.staffMemberId}`,
    title: row.staffMember.name,
    detail: `${row.unreadForAdmin} unread message${
      row.unreadForAdmin === 1 ? "" : "s"
    } in your team thread.`,
    href: `/staff/${row.staffMemberId}?tab=messages`,
    atMs: row.lastMessageAt.getTime(),
  }));

  const checkinItems = checkInRows.map((row) => ({
    id: `checkin:${row.id}`,
    title: row.staffMember.name,
    detail: checkinDetail(row.checkedInAt),
    href: `/staff/${row.staffMemberId}`,
    atMs: row.checkedInAt.getTime(),
  }));

  // Each source is capped at 3 rows before merging, then the combined list at
  // 4 — so a just-arrived item can in rare cases be counted in unreadCount
  // but not make this visible-4 cut if the other sources have several more
  // recent rows. Acceptable: this list is a backstop to the live toast
  // (WorkspaceToaster), not the only place the event surfaces, and the badge
  // total itself is never capped.
  const notifications = [...inboxItems, ...staffItems, ...checkinItems]
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, 4)
    .map((item) => ({ id: item.id, title: item.title, detail: item.detail, href: item.href }));

  const inboxUnreadCount = unreadAggregate._sum.unreadCount ?? 0;
  const staffMessageUnreadCount = staffUnreadAggregate._sum.unreadForAdmin ?? 0;

  return {
    ok: true,
    view: {
      unreadCount: inboxUnreadCount + staffMessageUnreadCount + unseenCheckInsCount,
      inboxUnreadCount,
      staffUnreadCount: staffMessageUnreadCount + unseenCheckInsCount,
      reminderWarning,
      notifications,
    },
  };
}
