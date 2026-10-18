import { formatZonedShortDate, formatZonedTime, getAppTimeZone } from "@/lib/time-zone";

export type FollowUpDraftKind = "SLOT_OFFER" | "REBOOK" | "PAYMENT" | "THANK_YOU";
export type FollowUpDraftStatus = "PENDING" | "SENT" | "DISMISSED" | "EXPIRED";

export type FollowUpDraftItem = {
  id: string;
  clientId: string;
  clientName: string;
  kind: FollowUpDraftKind;
  kindLabel: string;
  body: string;
  reasonLabel: string;
  createdLabel: string;
  // A SENT slot offer whose waitlist entry is still OFFERED (see
  // listPendingFollowUpDrafts) can be booked directly from this row — the
  // client was already told about the opening, so send/skip no longer apply.
  canBook: boolean;
  // False for a still-pending slot offer in a workspace that is no longer on
  // Pro: the list keeps showing it so staff can Skip it, but Send would only
  // fail (markFollowUpDraftSent refuses it), so the row leaves Send out.
  canSend: boolean;
};

const KIND_LABELS: Record<FollowUpDraftKind, string> = {
  SLOT_OFFER: "Slot offer",
  REBOOK: "Rebooking nudge",
  PAYMENT: "Payment reminder",
  THANK_YOU: "Thank-you message",
};

export type FollowUpDraftRecord = {
  id: string;
  clientId: string;
  client: { name: string };
  kind: FollowUpDraftKind;
  status: FollowUpDraftStatus;
  body: string;
  appointment: { startAt: Date; title: string } | null;
  createdAt: Date;
};

/**
 * A row's identity on the Follow-ups page. A slot offer that staff just sent
 * comes back from the server as a new, bookable row (Book / Declined), so it
 * must not stay hidden under the key of the pending row that was handled.
 */
export function followUpRowKey(item: Pick<FollowUpDraftItem, "id" | "canBook">) {
  return `${item.id}:${item.canBook}`;
}

/**
 * The order kinds are worked in on the Follow-ups page: slot offers first
 * (the opening goes to someone else if it waits), then money, then the
 * nudges that can wait a day.
 */
export const followUpKindOrder: FollowUpDraftKind[] = ["SLOT_OFFER", "PAYMENT", "REBOOK", "THANK_YOU"];

/** Plural labels for the page's filter chips. */
export const followUpKindGroupLabels: Record<FollowUpDraftKind, string> = {
  SLOT_OFFER: "Slot offers",
  PAYMENT: "Payment reminders",
  REBOOK: "Rebooking nudges",
  THANK_YOU: "Thank-yous",
};

/**
 * Rows in working order: a sent slot offer that can be booked now comes
 * first, then kinds in followUpKindOrder. The server's order is kept within
 * each group (the sort is stable).
 */
export function orderFollowUps(items: FollowUpDraftItem[]) {
  const rank = (item: FollowUpDraftItem) => (item.canBook ? -1 : followUpKindOrder.indexOf(item.kind));
  return [...items].sort((left, right) => rank(left) - rank(right));
}

/** How many rows of each kind there are, for the filter chips' counts. */
export function countFollowUpsByKind(items: FollowUpDraftItem[]) {
  const counts = Object.fromEntries(followUpKindOrder.map((kind) => [kind, 0])) as Record<FollowUpDraftKind, number>;
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

/** The server's rows minus the ones handled on this page since it loaded. */
export function visibleFollowUps(items: FollowUpDraftItem[], handledKeys: string[]) {
  return items.filter((item) => !handledKeys.includes(followUpRowKey(item)));
}

/**
 * Every kind gets an honest, generic reason label; when a linked appointment
 * exists (set by a future generator — PR 4/5), the reason names it instead.
 * See this plan's Deviation 4 for why the reason isn't a stored field.
 */
export function buildFollowUpsViewFromRecords(args: {
  drafts: FollowUpDraftRecord[];
  timeZone?: string;
  // Sending a slot offer is Pro; the other kinds send on every plan.
  canSendSlotOffers?: boolean;
}): { items: FollowUpDraftItem[] } {
  const { drafts, timeZone = getAppTimeZone(), canSendSlotOffers = true } = args;

  const items = drafts.map((draft) => ({
    id: draft.id,
    clientId: draft.clientId,
    clientName: draft.client.name,
    kind: draft.kind,
    kindLabel: KIND_LABELS[draft.kind],
    body: draft.body,
    reasonLabel: draft.appointment
      ? `${draft.appointment.title} · ${formatZonedShortDate(draft.appointment.startAt, timeZone)} ${formatZonedTime(draft.appointment.startAt, timeZone)}`
      : KIND_LABELS[draft.kind],
    createdLabel: formatZonedShortDate(draft.createdAt, timeZone),
    canBook: draft.kind === "SLOT_OFFER" && draft.status === "SENT",
    canSend: draft.kind !== "SLOT_OFFER" || canSendSlotOffers,
  }));

  return { items };
}
