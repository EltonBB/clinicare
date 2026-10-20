import type { AutomationKind, MessageDeliveryStatus, Prisma } from "@prisma/client";

import { AUTOMATIONS, automationDefinition } from "@/lib/automations";
import { prisma } from "@/lib/prisma";
import { formatZonedShortDate, formatZonedTime } from "@/lib/time-zone";

export const ACTIVITY_PAGE_SIZE = 50;
const ACTIVITY_WINDOW_DAYS = 30;

export type ActivityStatus = "Sent" | "Delivered" | "Read" | "Failed";

export type ActivityRow = {
  id: string;
  kind: AutomationKind;
  label: string;
  clientId: string | null;
  clientName: string;
  sentLabel: string;
  status: ActivityStatus;
};

export type AutomationActivity = {
  rows: ActivityRow[];
  /** Sends per automation in the window; only automations that sent anything. */
  counts: Partial<Record<AutomationKind, number>>;
  total: number;
  page: number;
  hasMore: boolean;
};

const STATUS_LABEL: Record<MessageDeliveryStatus, ActivityStatus> = {
  QUEUED: "Sent",
  SENT: "Sent",
  DELIVERED: "Delivered",
  READ: "Read",
  FAILED: "Failed",
};

/** Highest page a URL may ask for: 30 days of sends never come near it. */
const MAX_ACTIVITY_PAGE = 1_000;

/** Parses `?page=`: a whole number from 1 to MAX_ACTIVITY_PAGE, else page 1 (Codex). */
export function parseActivityPage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isSafeInteger(page) && page >= 1 ? Math.min(page, MAX_ACTIVITY_PAGE) : 1;
}

/** Parses `?kind=` from the URL: only a real automation kind filters. */
export function parseActivityKind(raw: string | undefined): AutomationKind | undefined {
  return AUTOMATIONS.some((automation) => automation.kind === raw) ? (raw as AutomationKind) : undefined;
}

/**
 * What the automations sent in the last 30 days, newest first, for
 * Automations › Activity: the automation, the patient, when, and whether it
 * arrived. Read from the outbound messages each automated send records
 * (`Message.automationKind`), scoped to the workspace through the conversation.
 * Server-side paging; the counts feed the filter chips.
 */
export async function listAutomationActivity(args: {
  businessId: string;
  kind?: AutomationKind;
  page?: number;
  now?: Date;
}): Promise<AutomationActivity> {
  const { businessId, kind, now = new Date() } = args;
  const page = parseActivityPage(String(args.page ?? 1));

  const base: Prisma.MessageWhereInput = {
    direction: "OUTBOUND",
    automationKind: { not: null },
    sentAt: { gte: new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 24 * 3_600_000) },
    conversation: { is: { businessId } },
  };
  const where: Prisma.MessageWhereInput = kind ? { ...base, automationKind: kind } : base;

  const [messages, grouped] = await Promise.all([
    prisma.message.findMany({
      where,
      select: {
        id: true,
        automationKind: true,
        clientId: true,
        sentAt: true,
        deliveryStatus: true,
        client: { select: { name: true } },
        conversation: { select: { contactName: true } },
      },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * ACTIVITY_PAGE_SIZE,
      take: ACTIVITY_PAGE_SIZE + 1,
    }),
    prisma.message.groupBy({ by: ["automationKind"], where: base, _count: { _all: true } }),
  ]);

  const counts: AutomationActivity["counts"] = {};
  for (const group of grouped) {
    if (group.automationKind) counts[group.automationKind] = group._count._all;
  }

  const rows = messages.slice(0, ACTIVITY_PAGE_SIZE).map((message): ActivityRow => {
    const automationKind = message.automationKind as AutomationKind;
    return {
      id: message.id,
      kind: automationKind,
      label: automationDefinition(automationKind).label,
      clientId: message.clientId,
      clientName: message.client?.name ?? message.conversation?.contactName ?? "",
      sentLabel: `${formatZonedShortDate(message.sentAt)}, ${formatZonedTime(message.sentAt)}`,
      status: STATUS_LABEL[message.deliveryStatus ?? "SENT"],
    };
  });

  return {
    rows,
    counts,
    total: kind ? (counts[kind] ?? 0) : Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0),
    page,
    hasMore: messages.length > ACTIVITY_PAGE_SIZE,
  };
}
