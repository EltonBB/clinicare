import type { StaffNotification, StaffThread, StaffThreadMessage } from "@prisma/client";

import { clockLabel, dayLabel, relativeLabel } from "@/lib/mobile/relative-time";

/**
 * Pure view-model types + serializers for internal staff↔admin messaging and
 * notifications — split out of inbox.ts (which re-exports all of these) so
 * they can be unit-tested without importing prisma.ts, whose module-level
 * DATABASE_URL read throws in any environment without a real DB configured
 * (CI included — see ci.yml: "Offline only — no DB or secrets needed"). The
 * `@prisma/client` import here is type-only (erased at compile time), so it
 * carries none of that risk; a value import of `@/lib/prisma` does not
 * belong in this file — if one is ever needed, move the function to inbox.ts.
 */

export type MobileMessageSender = "them" | "me" | "system";
export type MobileDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export type MobileMessage = {
  id: string;
  sender: MobileMessageSender;
  body: string;
  timeLabel: string;
  dayLabel: string;
  delivery?: MobileDeliveryStatus;
};

export type MobileConversation = {
  id: string;
  contactName: string;
  subtitle: string;
  preview: string;
  lastAtLabel: string;
  unreadCount: number;
  messages: MobileMessage[];
};

export type MobileNotificationKind = "message" | "appointment" | "reminder" | "system";

export type MobileNotification = {
  id: string;
  kind: MobileNotificationKind;
  title: string;
  body: string;
  atLabel: string;
  group: "New" | "Earlier";
  read: boolean;
  link?: { type: "conversation" | "appointment"; id: string };
};

export function serializeMessage(message: StaffThreadMessage, now: Date = new Date()): MobileMessage {
  const sender: MobileMessageSender =
    message.sender === "STAFF" ? "me" : message.sender === "ADMIN" ? "them" : "system";
  return {
    id: message.id,
    sender,
    body: message.body,
    timeLabel: clockLabel(message.createdAt),
    dayLabel: dayLabel(message.createdAt, now),
    // Only the staff's own (outbound) messages carry a delivery state.
    delivery: sender === "me" ? (message.readAt ? "read" : "sent") : undefined,
  };
}

export function serializeConversation(
  thread: StaffThread & { messages: StaffThreadMessage[] },
  now: Date = new Date()
): MobileConversation {
  const ordered = [...thread.messages].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const latest = ordered[ordered.length - 1];
  return {
    id: thread.id,
    contactName: "Clinic admin",
    subtitle: thread.subtitle ?? "Vela dashboard",
    preview: latest?.body ?? "",
    lastAtLabel:
      dayLabel(thread.lastMessageAt, now) === "Today"
        ? clockLabel(thread.lastMessageAt)
        : dayLabel(thread.lastMessageAt, now),
    unreadCount: thread.unreadForStaff,
    messages: ordered.map((message) => serializeMessage(message, now)),
  };
}

export function serializeNotification(
  notification: StaffNotification,
  now: Date = new Date()
): MobileNotification {
  const read = notification.readAt !== null;
  const linkType = notification.linkType;
  const link =
    (linkType === "conversation" || linkType === "appointment") && notification.linkId
      ? { type: linkType as "conversation" | "appointment", id: notification.linkId }
      : undefined;
  return {
    id: notification.id,
    kind: notification.kind.toLowerCase() as MobileNotificationKind,
    title: notification.title,
    body: notification.body,
    atLabel: relativeLabel(notification.createdAt, now),
    group: read ? "Earlier" : "New",
    read,
    link,
  };
}
