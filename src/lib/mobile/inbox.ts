import { prisma } from "@/lib/prisma";
import type { StaffContext } from "@/lib/staff-auth";

/**
 * Internal staff↔admin messaging + notifications for the mobile app. This is the
 * doctor talking to the clinic ADMIN (the Vela dashboard user) — NOT patients.
 * It is deliberately separate from the patient-facing Conversation/Message
 * (WhatsApp) models and never carries clinical detail in notifications/push.
 *
 * View-model types and pure serializers live in inbox-serializers.ts (unit
 * tested without a DB) and are re-exported below for existing callers.
 */

export {
  serializeConversation,
  serializeMessage,
  serializeNotification,
} from "@/lib/mobile/inbox-serializers";
export type {
  MobileConversation,
  MobileDeliveryStatus,
  MobileMessage,
  MobileMessageSender,
  MobileNotification,
  MobileNotificationKind,
} from "@/lib/mobile/inbox-serializers";

import {
  serializeConversation,
  serializeMessage,
  serializeNotification,
  type MobileConversation,
  type MobileMessage,
  type MobileNotification,
} from "@/lib/mobile/inbox-serializers";

// ---- DB operations (all scoped to the signed-in staff member) --------------

export async function listConversations(ctx: StaffContext): Promise<MobileConversation[]> {
  const threads = await prisma.staffThread.findMany({
    where: { businessId: ctx.business.id, staffMemberId: ctx.staffMember.id },
    orderBy: { lastMessageAt: "desc" },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return threads.map((thread) => serializeConversation(thread));
}

/**
 * The single staff↔admin thread per staff member, created on first use. Shared
 * with the admin (web) side so both perspectives operate on the same thread.
 */
export async function ensureAdminThread(businessId: string, staffMemberId: string) {
  const existing = await prisma.staffThread.findFirst({
    where: { businessId, staffMemberId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return existing;
  }
  return prisma.staffThread.create({
    data: { businessId, staffMemberId, subtitle: "Front desk" },
  });
}

/**
 * Post a SYSTEM line to the staff↔admin thread (creating it if needed) and bump
 * the admin's unread. Surfaces a doctor's self-service action — e.g. a
 * cancellation — to the admin, who reads the thread on the staff detail page, so
 * the action isn't silent. Callers wrap this best-effort: a notice must never
 * fail the action it describes.
 */
export async function postSystemMessageToAdminThread(
  businessId: string,
  staffMemberId: string,
  body: string
): Promise<void> {
  const thread = await ensureAdminThread(businessId, staffMemberId);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.staffThreadMessage.create({
      data: { threadId: thread.id, sender: "SYSTEM", body },
    });
    await tx.staffThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: now, unreadForAdmin: { increment: 1 } },
    });
  });
}

/**
 * Find a thread by id, or the sentinel "admin" → the staff's existing admin
 * thread. READ-ONLY: never creates a thread (threads are created on first send,
 * so reads can't write). Returns null when no thread exists yet.
 */
async function findThread(ctx: StaffContext, idParam: string) {
  if (idParam === "admin") {
    return prisma.staffThread.findFirst({
      where: { businessId: ctx.business.id, staffMemberId: ctx.staffMember.id },
      orderBy: { createdAt: "asc" },
    });
  }
  return prisma.staffThread.findFirst({
    where: { id: idParam, businessId: ctx.business.id, staffMemberId: ctx.staffMember.id },
  });
}

/** The empty admin conversation shown before any message has been exchanged. */
function emptyAdminConversation(): MobileConversation {
  return {
    id: "admin",
    contactName: "Clinic admin",
    subtitle: "Vela dashboard",
    preview: "",
    lastAtLabel: "",
    unreadCount: 0,
    messages: [],
  };
}

export async function getConversation(
  ctx: StaffContext,
  idParam: string
): Promise<MobileConversation | null> {
  const thread = await findThread(ctx, idParam);
  if (!thread) {
    // The admin conversation always opens (empty) so the staff can start it.
    return idParam === "admin" ? emptyAdminConversation() : null;
  }
  const full = await prisma.staffThread.findUnique({
    where: { id: thread.id },
    // The thread grows monotonically forever (system messages on every
    // cancellation, etc.) with no natural cap — take the most recent 100 by
    // querying desc; serializeConversation already re-sorts into chronological
    // order internally, so feeding it a desc-ordered batch is safe.
    include: { messages: { orderBy: { createdAt: "desc" }, take: 100 } },
  });
  return full ? serializeConversation(full) : null;
}

export type PostMessageResult =
  | { ok: true; threadId: string; message: MobileMessage }
  | { ok: false; status: number; error: string };

export async function postConversationMessage(
  ctx: StaffContext,
  idParam: string,
  body: string
): Promise<PostMessageResult> {
  const trimmed = body.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: "Message can't be empty." };
  }

  // Sending creates the admin thread on first use (write path may create).
  const thread =
    idParam === "admin"
      ? await ensureAdminThread(ctx.business.id, ctx.staffMember.id)
      : await findThread(ctx, idParam);
  if (!thread) {
    return { ok: false, status: 404, error: "Conversation not found." };
  }

  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.staffThreadMessage.create({
      data: { threadId: thread.id, sender: "STAFF", body: trimmed },
    });
    await tx.staffThread.update({
      where: { id: thread.id },
      // Staff sent → the admin (dashboard) now has an unread to read.
      data: { lastMessageAt: now, unreadForAdmin: { increment: 1 } },
    });
    return created;
  });

  return { ok: true, threadId: thread.id, message: serializeMessage(message, now) };
}

export async function markConversationRead(ctx: StaffContext, idParam: string): Promise<boolean> {
  const thread = await findThread(ctx, idParam);
  if (!thread) {
    // Nothing to mark yet (no thread created) — treat as a no-op success.
    return true;
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.staffThread.update({
      where: { id: thread.id },
      data: { unreadForStaff: 0 },
    });
    // Mark inbound (admin) messages as read.
    await tx.staffThreadMessage.updateMany({
      where: { threadId: thread.id, sender: "ADMIN", readAt: null },
      data: { readAt: now },
    });
  });
  return true;
}

export async function listNotifications(ctx: StaffContext): Promise<MobileNotification[]> {
  const notifications = await prisma.staffNotification.findMany({
    where: { businessId: ctx.business.id, staffMemberId: ctx.staffMember.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return notifications.map((notification) => serializeNotification(notification));
}

export async function markNotificationRead(ctx: StaffContext, id: string): Promise<boolean> {
  const result = await prisma.staffNotification.updateMany({
    where: { id, businessId: ctx.business.id, staffMemberId: ctx.staffMember.id, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

export async function registerDevicePushToken(
  ctx: StaffContext,
  expoPushToken: string
): Promise<void> {
  await prisma.staffDevice.update({
    where: { id: ctx.device.id },
    data: { expoPushToken },
  });
}
