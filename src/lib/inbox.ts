import { differenceInCalendarDays, format, isToday, isYesterday } from "date-fns";
import type { Client, Conversation, Message } from "@prisma/client";

export type InboxMessage = {
  id: string;
  sender: "client" | "business" | "system";
  body: string;
  timestamp: string;
};

export type InboxConversation = {
  id: string;
  phone: string;
  clientId?: string;
  clientName: string;
  preview: string;
  unreadCount: number;
  lastMessageAt: string;
  activeLabel: string;
  messages: InboxMessage[];
};

export type InboxViewModel = {
  conversations: InboxConversation[];
  initialConversationId: string;
};

type InboxConversationRecord = Pick<
  Conversation,
  "id" | "phoneNumber" | "contactName" | "unreadCount" | "updatedAt"
> & {
  messages: Array<Pick<Message, "id" | "direction" | "body" | "sentAt">>;
};

type InboxClientLink = Pick<Client, "id" | "name" | "phone">;

export function normalizePhone(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/[\s().-]/g, "");

  if (normalized.startsWith("+")) {
    return `+${normalized.slice(1).replace(/[^\d]/g, "")}`;
  }

  return normalized.replace(/[^\d]/g, "");
}

function formatConversationTimestamp(date: Date) {
  if (isToday(date)) {
    return format(date, "h:mm a");
  }

  if (isYesterday(date)) {
    return "Yesterday";
  }

  if (differenceInCalendarDays(new Date(), date) < 7) {
    return format(date, "EEE");
  }

  return format(date, "MMM d");
}

function formatMessageTimestamp(date: Date) {
  return format(date, "h:mm a");
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

function linkedClientForConversation(
  conversation: Pick<Conversation, "phoneNumber">,
  clients: InboxClientLink[]
) {
  const normalizedPhone = normalizePhone(conversation.phoneNumber);

  return clients.find((client) => normalizePhone(client.phone) === normalizedPhone);
}

export function buildInboxConversation(
  conversation: InboxConversationRecord,
  clients: InboxClientLink[]
): InboxConversation {
  const linkedClient = linkedClientForConversation(conversation, clients);
  const messages = conversation.messages.map((message) => ({
    id: message.id,
    sender: toMessageSender(message.direction),
    body: message.body,
    timestamp: formatMessageTimestamp(message.sentAt),
  }));
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const lastActivityAt = lastMessage?.sentAt ?? conversation.updatedAt;

  return {
    id: conversation.id,
    phone: conversation.phoneNumber,
    clientId: linkedClient?.id,
    clientName: linkedClient?.name ?? conversation.contactName,
    preview: lastMessage?.body ?? "No messages yet.",
    unreadCount: conversation.unreadCount,
    lastMessageAt: formatConversationTimestamp(lastActivityAt),
    activeLabel: linkedClient
      ? conversation.unreadCount > 0
        ? "Active now"
        : "Last reply recently"
      : "Needs client link",
    messages,
  };
}

export function buildInboxViewFromWorkspace(args: {
  conversations: InboxConversationRecord[];
  clients: InboxClientLink[];
}): InboxViewModel {
  const conversations = args.conversations.map((conversation) =>
    buildInboxConversation(conversation, args.clients)
  );

  return {
    conversations,
    initialConversationId: conversations[0]?.id ?? "",
  };
}
