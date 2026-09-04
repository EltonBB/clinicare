import type {
  Client,
  Conversation,
  Message,
  MessageDeliveryStatus,
} from "@prisma/client";

import {
  formatZonedDayName,
  formatZonedFullDate,
  formatZonedShortDate,
  formatZonedTime,
  getAppTimeZone,
  zonedCalendarDaysBetween,
} from "@/lib/time-zone";

export type InboxMessage = {
  id: string;
  sender: "client" | "business" | "system";
  body: string;
  timestamp: string;
  dayLabel: string;
  deliveryStatus?: "queued" | "sent" | "delivered" | "read" | "failed";
  deliveryLabel?: string;
};

export type InboxConversation = {
  id: string;
  phone: string;
  clientId?: string;
  clientName: string;
  displayName: string;
  isLinkedClient: boolean;
  contactStatusLabel: string;
  preview: string;
  unreadCount: number;
  lastMessageAt: string;
  activeLabel: string;
  messages: InboxMessage[];
};

export type InboxViewModel = {
  conversations: InboxConversation[];
  initialConversationId: string;
  // The business-wide unread total (see buildInboxViewFromWorkspace) — not
  // derivable from `conversations` alone, which is capped to a page of the
  // most-recently-updated ones and can be missing older unread conversations.
  totalUnreadCount: number;
};

type InboxConversationRecord = Pick<
  Conversation,
  "id" | "phoneNumber" | "contactName" | "unreadCount" | "updatedAt"
> & {
  messages: Array<
    Pick<
      Message,
      "id" | "direction" | "body" | "sentAt" | "deliveryStatus"
    >
  >;
};

type InboxClientLink = Pick<Client, "id" | "name" | "phone">;

export function normalizePhone(value: string) {
  const trimmed = value
    .trim()
    .replace(/^whatsapp:/i, "")
    .replace(/^tel:/i, "");

  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/[\s().-]/g, "");

  if (normalized.startsWith("+")) {
    return `+${normalized.slice(1).replace(/[^\d]/g, "")}`;
  }

  return normalized.replace(/[^\d]/g, "");
}

export function phoneLookupKey(value: string) {
  return normalizePhone(value).replace(/^\+/, "");
}

function formatConversationTimestamp(date: Date, now: Date, timeZone: string) {
  const daysAgo = zonedCalendarDaysBetween(date, now, timeZone);

  if (daysAgo <= 0) {
    return formatZonedTime(date, timeZone);
  }

  if (daysAgo === 1) {
    return "Yesterday";
  }

  if (daysAgo < 7) {
    return formatZonedDayName(date, timeZone);
  }

  return formatZonedShortDate(date, timeZone);
}

function formatMessageTimestamp(date: Date, timeZone: string) {
  return formatZonedTime(date, timeZone);
}

function formatMessageDayLabel(date: Date, now: Date, timeZone: string) {
  const daysAgo = zonedCalendarDaysBetween(date, now, timeZone);

  if (daysAgo <= 0) {
    return "Today";
  }

  if (daysAgo === 1) {
    return "Yesterday";
  }

  return formatZonedFullDate(date, timeZone);
}

function toMessageSender(direction: Message["direction"]): InboxMessage["sender"] {
  if (direction === "OUTBOUND") {
    return "business";
  }

  if (direction === "SYSTEM") {
    return "system";
  }

  return "client";
}

function toInboxDeliveryStatus(
  status: MessageDeliveryStatus | null
): InboxMessage["deliveryStatus"] {
  if (!status) {
    return undefined;
  }

  return status.toLowerCase() as InboxMessage["deliveryStatus"];
}

function deliveryLabel(status: MessageDeliveryStatus | null) {
  if (!status) {
    return undefined;
  }

  if (status === "FAILED") {
    return "Failed";
  }

  if (status === "READ") {
    return "Read";
  }

  if (status === "DELIVERED") {
    return "Delivered";
  }

  if (status === "SENT") {
    return "Sent";
  }

  return "Queued";
}

// Index clients by their digit phone key once, so each conversation resolves its
// linked client in O(1) instead of re-scanning the whole client list (and
// re-deriving keys) per conversation. Keeps the first client per key, matching
// the previous `find` semantics.
function buildClientPhoneIndex(clients: InboxClientLink[]) {
  const index = new Map<string, InboxClientLink>();

  for (const client of clients) {
    const key = phoneLookupKey(client.phone);
    if (key && !index.has(key)) {
      index.set(key, client);
    }
  }

  return index;
}

export function buildInboxConversation(
  conversation: InboxConversationRecord,
  clients: InboxClientLink[],
  now: Date = new Date(),
  timeZone: string = getAppTimeZone(),
  clientIndex?: Map<string, InboxClientLink>
): InboxConversation {
  const index = clientIndex ?? buildClientPhoneIndex(clients);
  const linkedClient = index.get(phoneLookupKey(conversation.phoneNumber));
  const sortedMessages = [...conversation.messages].sort(
    (first, second) => first.sentAt.getTime() - second.sentAt.getTime()
  );
  const messages = sortedMessages.map((message) => ({
    id: message.id,
    sender: toMessageSender(message.direction),
    body: message.body,
    timestamp: formatMessageTimestamp(message.sentAt, timeZone),
    dayLabel: formatMessageDayLabel(message.sentAt, now, timeZone),
    deliveryStatus: toInboxDeliveryStatus(message.deliveryStatus),
    deliveryLabel: deliveryLabel(message.deliveryStatus),
  }));
  const lastMessage = sortedMessages[sortedMessages.length - 1];
  const lastActivityAt = lastMessage?.sentAt ?? conversation.updatedAt;
  const isLinkedClient = Boolean(linkedClient);
  const fallbackDisplayName =
    conversation.contactName.trim().length > 0 &&
    phoneLookupKey(conversation.contactName) !== phoneLookupKey(conversation.phoneNumber)
      ? conversation.contactName
      : "Unregistered contact";

  return {
    id: conversation.id,
    phone: conversation.phoneNumber,
    clientId: linkedClient?.id,
    clientName: linkedClient?.name ?? fallbackDisplayName,
    displayName: linkedClient?.name ?? fallbackDisplayName,
    isLinkedClient,
    contactStatusLabel: linkedClient ? "Client linked" : "Unregistered contact",
    preview: lastMessage?.body ?? "",
    unreadCount: conversation.unreadCount,
    lastMessageAt: formatConversationTimestamp(lastActivityAt, now, timeZone),
    activeLabel: linkedClient
      ? lastMessage
        ? `Last message ${formatConversationTimestamp(lastActivityAt, now, timeZone)}`
        : ""
      : "Reply first, then convert to client",
    messages,
  };
}

export function buildInboxViewFromWorkspace(args: {
  conversations: InboxConversationRecord[];
  clients: InboxClientLink[];
  // Fetched by the page via a separate, uncapped aggregate — this builder
  // stays a pure passthrough for it rather than summing `conversations`
  // itself, since that array is the same capped page the sum must not match.
  totalUnreadCount: number;
}): InboxViewModel {
  const now = new Date();
  const timeZone = getAppTimeZone();
  const clientIndex = buildClientPhoneIndex(args.clients);
  const conversations = args.conversations.map((conversation) =>
    buildInboxConversation(conversation, args.clients, now, timeZone, clientIndex)
  );

  return {
    conversations,
    initialConversationId: conversations[0]?.id ?? "",
    totalUnreadCount: args.totalUnreadCount,
  };
}
