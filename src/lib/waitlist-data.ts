import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isSameService, type WaitlistCandidate } from "@/lib/slot-fill-matching";
import { formatZonedShortDate } from "@/lib/time-zone";
import { MAX_ACTIVE_WAITLIST_ENTRIES, WAITLIST_FULL_ERROR } from "@/lib/waitlist";

export type WaitlistEntryRow = {
  id: string;
  clientId: string;
  clientName: string;
  service: string;
  staffMemberId: string | null;
  staffMemberName: string | null;
  /** The earliest date, already formatted in the clinic's zone (the browser's zone would shift it). */
  earliestDateLabel: string | null;
  preferredDays: number[];
  preferredFrom: string | null;
  preferredTo: string | null;
  notes: string | null;
  /** Set while a slot has been offered to this entry: the offer is drafted ("pending") or already sent ("sent"). */
  offer: "pending" | "sent" | null;
  createdAt: Date;
};

/**
 * Everyone still on the waiting list — waiting, or holding an offer that
 * hasn't been booked, declined, or expired yet — oldest first.
 */
export async function listWaitingEntries(businessId: string, now: Date = new Date()): Promise<WaitlistEntryRow[]> {
  const rows = await prisma.waitlistEntry.findMany({
    where: { businessId, status: { in: ["WAITING", "OFFERED"] } },
    include: {
      client: { select: { name: true } },
      staffMember: { select: { name: true } },
      followUpDrafts: {
        where: {
          kind: "SLOT_OFFER",
          status: { in: ["PENDING", "SENT"] },
          // The same liveness the Follow-ups list applies (liveSlotOfferWhere in
          // slot-offers.ts, which this module can't import without a cycle): once
          // the freed slot has passed the offer is over, so the panel shows the
          // entry as waiting again at once, not only after the hourly sweep
          // releases it.
          appointment: { status: "CANCELLED", startAt: { gt: now } },
        },
        select: { status: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => {
    // The offer comes from the live draft alone: an entry the sweep hasn't
    // released yet (its slot passed) has no live draft and reads as waiting.
    const draft = row.status === "OFFERED" ? row.followUpDrafts[0] : undefined;

    return {
      id: row.id,
      clientId: row.clientId,
      clientName: row.client.name,
      service: row.service,
      staffMemberId: row.staffMemberId,
      staffMemberName: row.staffMember?.name ?? null,
      earliestDateLabel: row.earliestDate ? formatZonedShortDate(row.earliestDate) : null,
      preferredDays: row.preferredDays,
      preferredFrom: row.preferredFrom,
      preferredTo: row.preferredTo,
      notes: row.notes,
      offer: draft ? (draft.status === "SENT" ? ("sent" as const) : ("pending" as const)) : null,
      createdAt: row.createdAt,
    };
  });
}

export async function createWaitlistEntry(args: {
  businessId: string;
  clientId: string;
  service: string;
  staffMemberId: string | null;
  earliestDate: Date | null;
  preferredDays: number[];
  preferredFrom: string | null;
  preferredTo: string | null;
  notes: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const active = await prisma.waitlistEntry.count({
    where: { businessId: args.businessId, status: { in: ["WAITING", "OFFERED"] } },
  });

  if (active >= MAX_ACTIVE_WAITLIST_ENTRIES) {
    return { ok: false, error: WAITLIST_FULL_ERROR };
  }

  await prisma.waitlistEntry.create({ data: { ...args, status: "WAITING" } });
  return { ok: true };
}

// Removing an entry lives in lib/slot-offers.ts (removeWaitlistEntry): an
// entry holding an offer re-offers its slot on the way out.

/**
 * Puts an entry whose offer fell through (skipped, declined, expired) back on
 * the waiting list: OFFERED -> WAITING, guarded so an entry that was booked
 * or removed meanwhile is left alone. True when it actually moved.
 */
export async function releaseWaitlistEntry(
  args: { id: string; businessId: string },
  db: Prisma.TransactionClient = prisma
): Promise<boolean> {
  const { count } = await db.waitlistEntry.updateMany({
    where: { id: args.id, businessId: args.businessId, status: "OFFERED" },
    data: { status: "WAITING" },
  });
  return count > 0;
}

export type WaitlistMatchCandidate = WaitlistCandidate & { clientName: string };

/**
 * Raw WAITING candidates for the matcher, shaped to WaitlistCandidate. Runs
 * inside the caller's transaction (`tx`) so the match read and the eventual
 * draft write are atomic with the cancellation itself.
 *
 * Never offers a slot to the client who just gave it up
 * (`excludeClientId`), to an archived client (Book would silently drop them),
 * or to a client who already has an offer for this same slot that is open
 * (PENDING/SENT) or was let go (DISMISSED — skipped or declined). The check is
 * on the client, not the entry, so a patient with two waiting entries for one
 * service is asked about a slot once. An EXPIRED offer doesn't count: it was
 * withdrawn (the appointment was un-cancelled) and must not block offering
 * the slot again if it is cancelled again.
 *
 * The service is compared in memory, ignoring case and stray whitespace (see
 * isSameService) — a SQL equality can't trim the stored value.
 */
export async function findMatchingWaitlistCandidates(args: {
  businessId: string;
  service: string;
  excludeClientId: string;
  freedAppointmentId: string;
  tx?: Prisma.TransactionClient;
}): Promise<WaitlistMatchCandidate[]> {
  const db = args.tx ?? prisma;
  const rows = await db.waitlistEntry.findMany({
    where: {
      businessId: args.businessId,
      status: "WAITING",
      clientId: { not: args.excludeClientId },
      client: {
        // Archived means either flag (see formatStatus in lib/clients.ts). An
        // inactive client is left out too, matching liveSlotOfferWhere: an offer
        // to one is stale the moment it is drafted, so matching them would burn
        // the slot on a draft nobody can see and the sweep would then re-offer it
        // to the same entry in a loop (Codex #130).
        isArchived: false,
        status: { notIn: ["INACTIVE", "ARCHIVED"] },
        followUpDrafts: {
          none: {
            kind: "SLOT_OFFER",
            appointmentId: args.freedAppointmentId,
            status: { in: ["PENDING", "SENT", "DISMISSED"] },
          },
        },
      },
    },
    select: {
      id: true,
      clientId: true,
      service: true,
      staffMemberId: true,
      earliestDate: true,
      preferredDays: true,
      preferredFrom: true,
      preferredTo: true,
      createdAt: true,
      client: { select: { name: true } },
    },
  });

  return rows
    .filter((row) => isSameService(row.service, args.service))
    .map(({ client, ...row }) => ({ ...row, clientName: client.name }));
}
