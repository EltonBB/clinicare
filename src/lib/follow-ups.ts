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
