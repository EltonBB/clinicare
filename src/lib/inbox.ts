import { differenceInCalendarDays, format, isToday, isYesterday } from "date-fns";
import type {
  Client,
  Conversation,
  MessageChannel,
  Message,
  MessageDeliveryStatus,
} from "@prisma/client";

export type InboxMessage = {
  id: string;
  sender: "client" | "business" | "system";
  body: string;
  timestamp: string;
  deliveryStatus?: "queued" | "sent" | "delivered" | "read" | "failed";
  deliveryLabel?: string;
};

export type InboxConversation = {
  id: string;
  channel: MessageChannel;
  channelLabel: string;
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
};

type InboxConversationRecord = Pick<
  Conversation,
  "id" | "channel" | "phoneNumber" | "contactName" | "unreadCount" | "updatedAt"
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

function linkedClientForConversation(
  conversation: Pick<Conversation, "phoneNumber">,
  clients: InboxClientLink[]
) {
  const normalizedPhone = normalizePhone(conversation.phoneNumber);

  return clients.find((client) => phoneLookupKey(client.phone) === phoneLookupKey(normalizedPhone));
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
    deliveryStatus: toInboxDeliveryStatus(message.deliveryStatus),
    deliveryLabel: deliveryLabel(message.deliveryStatus),
  }));
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const lastActivityAt = lastMessage?.sentAt ?? conversation.updatedAt;
  const isLinkedClient = Boolean(linkedClient);
  const fallbackDisplayName =
    conversation.contactName.trim().length > 0 &&
    phoneLookupKey(conversation.contactName) !== phoneLookupKey(conversation.phoneNumber)
      ? conversation.contactName
      : "Unregistered contact";

  return {
    id: conversation.id,
    channel: conversation.channel,
    channelLabel: conversation.channel === "SMS" ? "SMS" : "WhatsApp",
    phone: conversation.phoneNumber,
    clientId: linkedClient?.id,
    clientName: linkedClient?.name ?? fallbackDisplayName,
    displayName: linkedClient?.name ?? fallbackDisplayName,
    isLinkedClient,
    contactStatusLabel: linkedClient ? "Client linked" : "Unregistered contact",
    preview: lastMessage?.body ?? "No messages yet.",
    unreadCount: conversation.unreadCount,
    lastMessageAt: formatConversationTimestamp(lastActivityAt),
    activeLabel: linkedClient
      ? conversation.unreadCount > 0
        ? "Active now"
        : "Last reply recently"
      : "Reply first, then convert to client",
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
