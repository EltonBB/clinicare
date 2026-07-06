import { ensureAdminThread } from "@/lib/mobile/inbox";
import { buildStaffPushPayload, sendStaffPush } from "@/lib/mobile/push";
import { clockLabel, dayLabel } from "@/lib/mobile/relative-time";
import { prisma } from "@/lib/prisma";

/**
 * Admin (Vela dashboard) side of the staff↔admin thread. The admin reads and
 * replies to a staff member's messages; their reply notifies + pushes the staff
 * member's device. Mirror of lib/mobile/inbox.ts (the staff/mobile side).
 */

export type AdminThreadMessage = {
  id: string;
  mine: boolean; // true = sent by the admin
  system: boolean;
  body: string;
  timeLabel: string;
  dayLabel: string;
};

export type AdminThreadView = {
  threadId: string;
  messages: AdminThreadMessage[];
  unreadForAdmin: number;
};

export async function getAdminThread(
  businessId: string,
  staffMemberId: string
): Promise<AdminThreadView> {
  // READ-ONLY: don't create a thread just because the admin viewed the page.
  const thread = await prisma.staffThread.findFirst({
    where: { businessId, staffMemberId },
    orderBy: { createdAt: "asc" },
  });
  if (!thread) {
    return { threadId: "", messages: [], unreadForAdmin: 0 };
  }
  // Mirror of the take:100 cap in lib/mobile/inbox.ts's getConversation — same
  // table, same unbounded growth (system messages on every cancellation), just
  // the admin-side viewer instead of the staff one. Query desc for the cap,
  // then re-sort ascending for display (same pattern as serializeConversation).
  const recentMessages = await prisma.staffThreadMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const messages = [...recentMessages].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const now = new Date();

  return {
    threadId: thread.id,
    messages: messages.map((message) => ({
      id: message.id,
      mine: message.sender === "ADMIN",
      system: message.sender === "SYSTEM",
      body: message.body,
      timeLabel: clockLabel(message.createdAt),
      dayLabel: dayLabel(message.createdAt, now),
    })),
    unreadForAdmin: thread.unreadForAdmin,
  };
}

export type PostAdminMessageResult =
  | { ok: true; threadId: string }
  | { ok: false; error: string };

export async function postAdminThreadMessage(
  businessId: string,
  staffMemberId: string,
  body: string
): Promise<PostAdminMessageResult> {
  const trimmed = body.trim();
  if (!trimmed) {
    return { ok: false, error: "Message can't be empty." };
  }

  const thread = await ensureAdminThread(businessId, staffMemberId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.staffThreadMessage.create({
      data: { threadId: thread.id, sender: "ADMIN", body: trimmed },
    });
    await tx.staffThread.update({
      where: { id: thread.id },
      // Admin sent → the staff member now has an unread on their phone.
      data: { lastMessageAt: now, unreadForStaff: { increment: 1 } },
    });
    // In-app notification for the staff Alerts screen (generic, non-PHI).
    await tx.staffNotification.create({
      data: {
        businessId,
        staffMemberId,
        kind: "MESSAGE",
        title: "New message",
        body: "You have a new message from your clinic.",
        linkType: "conversation",
        linkId: thread.id,
      },
    });
  });

  // Best-effort push to the staff member's devices (never blocks the reply).
  const devices = await prisma.staffDevice.findMany({
    where: { businessId, staffMemberId, revokedAt: null, expoPushToken: { not: null } },
    select: { expoPushToken: true },
  });
  await sendStaffPush(
    devices.map((device) => device.expoPushToken),
    buildStaffPushPayload({ kind: "message", linkType: "conversation", linkId: thread.id })
  );

  return { ok: true, threadId: thread.id };
}

export async function markAdminThreadRead(
  businessId: string,
  staffMemberId: string
): Promise<void> {
  // READ-ONLY w.r.t. thread existence — nothing to mark if none exists yet.
  const thread = await prisma.staffThread.findFirst({
    where: { businessId, staffMemberId },
    orderBy: { createdAt: "asc" },
  });
  if (!thread) {
    return;
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.staffThread.update({
      where: { id: thread.id },
      data: { unreadForAdmin: 0 },
    });
    await tx.staffThreadMessage.updateMany({
      where: { threadId: thread.id, sender: "STAFF", readAt: null },
      data: { readAt: now },
    });
  });
}
