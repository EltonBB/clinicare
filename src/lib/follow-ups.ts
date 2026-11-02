export type FollowUpDraftKind =
  | "SLOT_OFFER"
  | "REBOOK"
  | "PAYMENT"
  | "THANK_YOU"
  | "BOOKING_CONFIRMATION"
  | "NEW_PATIENT_WELCOME"
  | "VISIT_CHANGED"
  | "MISSED_VISIT"
  | "CHECKUP_DUE"
  | "FIRST_REMINDER"
  | "SECOND_REMINDER"
  | "HIGH_RISK_REMINDER";
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
export const followUpKindOrder: FollowUpDraftKind[] = [
  "SLOT_OFFER",
  // A reminder waiting for review is due now: it goes first after slot offers.
  "SECOND_REMINDER",
  "HIGH_RISK_REMINDER",
  "FIRST_REMINDER",
  "PAYMENT",
  "MISSED_VISIT",
  "CHECKUP_DUE",
  "REBOOK",
  "THANK_YOU",
  "BOOKING_CONFIRMATION",
  "NEW_PATIENT_WELCOME",
  "VISIT_CHANGED",
];

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
