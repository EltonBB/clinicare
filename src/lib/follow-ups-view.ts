import type { Locale } from "@/i18n/config";
import { messages } from "@/i18n/messages";
import type { FollowUpDraftItem, FollowUpDraftRecord } from "@/lib/follow-ups";
import { formatZonedShortDate, formatZonedTime, getAppTimeZone } from "@/lib/time-zone";

// Server-side: it reads the dictionaries, which the client-side helpers in
// lib/follow-ups.ts must not pull into the browser bundle.

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
  locale?: Locale;
}): { items: FollowUpDraftItem[] } {
  const { drafts, timeZone = getAppTimeZone(), canSendSlotOffers = true, locale = "en" } = args;
  const kindLabels = messages[locale].automations.review.kinds;

  const items = drafts.map((draft) => ({
    id: draft.id,
    clientId: draft.clientId,
    clientName: draft.client.name,
    kind: draft.kind,
    kindLabel: kindLabels[draft.kind],
    body: draft.body,
    reasonLabel: draft.appointment
      ? `${draft.appointment.title} · ${formatZonedShortDate(draft.appointment.startAt, timeZone, locale)} ${formatZonedTime(draft.appointment.startAt, timeZone, locale)}`
      : kindLabels[draft.kind],
    createdLabel: formatZonedShortDate(draft.createdAt, timeZone, locale),
    canBook: draft.kind === "SLOT_OFFER" && draft.status === "SENT",
    canSend: draft.kind !== "SLOT_OFFER" || canSendSlotOffers,
  }));

  return { items };
}
