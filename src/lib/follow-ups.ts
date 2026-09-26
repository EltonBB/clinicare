import { formatZonedShortDate, formatZonedTime, getAppTimeZone } from "@/lib/time-zone";

export type FollowUpDraftKind = "SLOT_OFFER" | "REBOOK" | "PAYMENT" | "THANK_YOU";

export type FollowUpDraftItem = {
  id: string;
  clientId: string;
  clientName: string;
  kind: FollowUpDraftKind;
  kindLabel: string;
  body: string;
  reasonLabel: string;
  createdLabel: string;
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
  body: string;
  appointment: { startAt: Date; title: string } | null;
  createdAt: Date;
};

/**
 * Every kind gets an honest, generic reason label; when a linked appointment
 * exists (set by a future generator — PR 4/5), the reason names it instead.
 * See this plan's Deviation 4 for why the reason isn't a stored field.
 */
export function buildFollowUpsViewFromRecords(args: {
  drafts: FollowUpDraftRecord[];
  now?: Date;
  timeZone?: string;
}): { items: FollowUpDraftItem[]; pendingCount: number } {
  const { drafts, timeZone = getAppTimeZone() } = args;

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
  }));

  return { items, pendingCount: items.length };
}
