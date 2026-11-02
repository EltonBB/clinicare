import type { StaffNotification, StaffThread, StaffThreadMessage } from "@prisma/client";

import type { Locale } from "@/i18n/config";
import { storedLabel } from "@/i18n/format";
import { messages } from "@/i18n/messages";
import { translateServerText } from "@/i18n/server-text";
import { clockLabel, dayLabel, isZonedToday, relativeLabel, systemNoticeText } from "@/lib/mobile/relative-time";

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

export function serializeMessage(
  message: StaffThreadMessage,
  now: Date = new Date(),
  locale: Locale = "en"
): MobileMessage {
  const sender: MobileMessageSender =
    message.sender === "STAFF" ? "me" : message.sender === "ADMIN" ? "them" : "system";
  return {
    id: message.id,
    sender,
    // System notices are stored in English; people's own words stay as written.
    body: sender === "system" ? systemNoticeText(message.body, locale) : message.body,
    timeLabel: clockLabel(message.createdAt),
    dayLabel: dayLabel(message.createdAt, now, locale),
    // Only the staff's own (outbound) messages carry a delivery state.
    delivery: sender === "me" ? (message.readAt ? "read" : "sent") : undefined,
  };
}

export function serializeConversation(
  thread: StaffThread & { messages: StaffThreadMessage[] },
  now: Date = new Date(),
  locale: Locale = "en"
): MobileConversation {
  const t = messages[locale].mobile;
  const ordered = [...thread.messages].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const serialized = ordered.map((message) => serializeMessage(message, now, locale));
  return {
    id: thread.id,
    contactName: t.clinicAdmin,
    subtitle: storedLabel(t.threadSubtitles, thread.subtitle ?? "Vela dashboard"),
    preview: serialized[serialized.length - 1]?.body ?? "",
    lastAtLabel: isZonedToday(thread.lastMessageAt, now)
      ? clockLabel(thread.lastMessageAt)
      : dayLabel(thread.lastMessageAt, now, locale),
    unreadCount: thread.unreadForStaff,
    messages: serialized,
  };
}

export function serializeNotification(
  notification: StaffNotification,
  now: Date = new Date(),
  locale: Locale = "en"
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
    // Stored in English when the event happened.
    title: translateServerText(notification.title, locale),
    body: translateServerText(notification.body, locale),
    atLabel: relativeLabel(notification.createdAt, now, locale),
    group: read ? "Earlier" : "New",
    read,
    link,
  };
}
