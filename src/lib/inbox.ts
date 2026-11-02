import type {
  Client,
  Conversation,
  Message,
  MessageDeliveryStatus,
} from "@prisma/client";

import type { Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { messages as dictionaries } from "@/i18n/messages";
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
  // False for an "extra" unread conversation fetchInboxConversations pulled
  // in beyond the recency cap — its `messages` is a 1-entry preview, not the
  // usual thread. True means the standard recent-window fetch (the latest
  // RECENT_MESSAGE_LIMIT messages — not literally every message ever sent;
  // there is no further pagination past that). The client hydrates the
  // standard window on open instead of rendering the 1-message preview (see
  // the hydration effect in inbox-workspace.tsx).
  hasFullHistory: boolean;
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
  // Omitted by callers that always fetch the standard recent-window thread
  // (hydrateConversation in inbox/actions.ts) — only fetchInboxConversations
  // sets this explicitly, since it's the only caller that can produce a
  // truncated 1-message preview instead.
  hasFullHistory?: boolean;
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

/**
 * The name a conversation is shown under, everywhere: the linked client's name
 * when the number belongs to a client, otherwise the contact's WhatsApp profile
 * name, unless that is just the number itself.
 */
export function conversationDisplayName(
  contactName: string,
  phoneNumber: string,
  linkedClientName?: string | null,
  locale: Locale = "en"
): string {
  if (linkedClientName) {
    return linkedClientName;
  }
  return contactName.trim().length > 0 && phoneLookupKey(contactName) !== phoneLookupKey(phoneNumber)
    ? contactName
    : dictionaries[locale].inbox.view.unregistered;
}

type Copy = { locale: Locale; t: (typeof dictionaries)["en"]["inbox"]["view"] };

function formatConversationTimestamp(date: Date, now: Date, timeZone: string, { locale, t }: Copy) {
  const daysAgo = zonedCalendarDaysBetween(date, now, timeZone);

  if (daysAgo <= 0) {
    return formatZonedTime(date, timeZone, locale);
  }

  if (daysAgo === 1) {
    return t.yesterday;
  }

  if (daysAgo < 7) {
    return formatZonedDayName(date, timeZone, locale);
  }

  return formatZonedShortDate(date, timeZone, locale);
}

function formatMessageDayLabel(date: Date, now: Date, timeZone: string, { locale, t }: Copy) {
  const daysAgo = zonedCalendarDaysBetween(date, now, timeZone);

  if (daysAgo <= 0) {
    return t.today;
  }

  if (daysAgo === 1) {
    return t.yesterday;
  }

  return formatZonedFullDate(date, timeZone, locale);
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

function deliveryLabel(status: MessageDeliveryStatus | null, { t }: Copy) {
  if (!status) {
    return undefined;
  }

  return t.delivery[status as keyof Copy["t"]["delivery"]] ?? t.delivery.QUEUED;
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
  clientIndex?: Map<string, InboxClientLink>,
  locale: Locale = "en"
): InboxConversation {
  const copy: Copy = { locale, t: dictionaries[locale].inbox.view };
  const index = clientIndex ?? buildClientPhoneIndex(clients);
  const linkedClient = index.get(phoneLookupKey(conversation.phoneNumber));
  const sortedMessages = [...conversation.messages].sort(
    (first, second) => first.sentAt.getTime() - second.sentAt.getTime()
  );
  const messages = sortedMessages.map((message) => ({
    id: message.id,
    sender: toMessageSender(message.direction),
    body: message.body,
    timestamp: formatZonedTime(message.sentAt, timeZone, locale),
    dayLabel: formatMessageDayLabel(message.sentAt, now, timeZone, copy),
    deliveryStatus: toInboxDeliveryStatus(message.deliveryStatus),
    deliveryLabel: deliveryLabel(message.deliveryStatus, copy),
  }));
  const lastMessage = sortedMessages[sortedMessages.length - 1];
  const lastActivityAt = lastMessage?.sentAt ?? conversation.updatedAt;
  const isLinkedClient = Boolean(linkedClient);
  const displayName = conversationDisplayName(
    conversation.contactName,
    conversation.phoneNumber,
    linkedClient?.name,
    locale
  );

  return {
    id: conversation.id,
    phone: conversation.phoneNumber,
    clientId: linkedClient?.id,
    clientName: displayName,
    displayName,
    isLinkedClient,
    contactStatusLabel: linkedClient ? copy.t.clientLinked : copy.t.unregistered,
    preview: lastMessage?.body ?? "",
    unreadCount: conversation.unreadCount,
    lastMessageAt: formatConversationTimestamp(lastActivityAt, now, timeZone, copy),
    activeLabel: linkedClient
      ? lastMessage
        ? fmt(copy.t.lastMessage, { time: formatConversationTimestamp(lastActivityAt, now, timeZone, copy) })
        : ""
      : copy.t.replyFirst,
    messages,
    hasFullHistory: conversation.hasFullHistory ?? true,
  };
}

export function buildInboxViewFromWorkspace(args: {
  conversations: InboxConversationRecord[];
  clients: InboxClientLink[];
  // The business-wide unread total (see fetchInboxConversations) — this
  // builder stays a pure passthrough for it rather than summing
  // `conversations` itself, since that array is the same capped page the
  // sum must not match.
  totalUnreadCount: number;
  locale?: Locale;
}): InboxViewModel {
  const now = new Date();
  const timeZone = getAppTimeZone();
  const clientIndex = buildClientPhoneIndex(args.clients);
  const conversations = args.conversations.map((conversation) =>
    buildInboxConversation(conversation, args.clients, now, timeZone, clientIndex, args.locale)
  );

  return {
    conversations,
    initialConversationId: conversations[0]?.id ?? "",
    totalUnreadCount: args.totalUnreadCount,
  };
}
