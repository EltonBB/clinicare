import { Prisma } from "@prisma/client";

import { ELIGIBLE_CLIENT_WHERE } from "@/lib/client-eligibility";
import { prisma } from "@/lib/prisma";
import { retryOnWriteConflict } from "@/lib/prisma-retry";
import { lockClientShared, lockStaffMemberShared } from "@/lib/row-locks";
import { isSameService, type WaitlistCandidate } from "@/lib/slot-fill-matching";
import { APPOINTMENT_STAFF_AVAILABLE_WHERE, AVAILABLE_STAFF_WHERE } from "@/lib/staff-eligibility";
import { formatZonedShortDate } from "@/lib/time-zone";
import {
  MAX_ACTIVE_WAITLIST_ENTRIES,
  WAITLIST_CLIENT_ERROR,
  WAITLIST_FULL_ERROR,
  WAITLIST_STAFF_ERROR,
} from "@/lib/waitlist";

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

// An entry counts toward the 500-entry cap and appears on the panel only
// while its client is still eligible — matching liveSlotOfferWhere and the
// matcher. A client marked Inactive/Archived after joining the list used to
// keep charging their (permanently unmatchable, per findMatchingWaitlistCandidates)
// entry against the cap and cluttering the panel forever, since nothing else
// ever changes a WAITING entry's status (Codex #130).
function activeWaitlistEntryWhere(businessId: string): Prisma.WaitlistEntryWhereInput {
  return { businessId, status: { in: ["WAITING", "OFFERED"] }, client: ELIGIBLE_CLIENT_WHERE };
}

/**
 * Everyone still on the waiting list — waiting, or holding an offer that
 * hasn't been booked, declined, or expired yet — oldest first.
 */
export async function listWaitingEntries(businessId: string, now: Date = new Date()): Promise<WaitlistEntryRow[]> {
  const rows = await prisma.waitlistEntry.findMany({
    where: activeWaitlistEntryWhere(businessId),
    include: {
      client: { select: { name: true } },
      staffMember: { select: { name: true } },
      followUpDrafts: {
        where: {
          kind: "SLOT_OFFER",
          status: { in: ["PENDING", "SENT"] },
          // The same liveness the Follow-ups list applies (liveSlotOfferWhere in
          // slot-offers.ts, which this module can't import without a cycle): once
          // the freed slot has passed, or its assigned staff has gone inactive,
          // the offer is over, so the panel shows the entry as waiting again at
          // once instead of continuing to show "Offer pending"/"Offer sent"
          // until the hourly sweep releases it (Codex #130).
          appointment: {
            status: "CANCELLED",
            startAt: { gt: now },
            ...APPOINTMENT_STAFF_AVAILABLE_WHERE,
          },
        },
        select: { status: true, sentAt: true },
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
      // "Sent" once the message actually left: an offer still on its way reads
      // as pending, as the Follow-ups list treats it (DELIVERED_WHERE).
      offer: draft ? (draft.status === "SENT" && draft.sentAt ? ("sent" as const) : ("pending" as const)) : null,
      createdAt: row.createdAt,
    };
  });
}

/**
 * The count and the insert run inside one SERIALIZABLE transaction: two staff
 * adding an entry at once, both reading the count just under the cap, would
 * otherwise both pass the check and both insert, overshooting
 * MAX_ACTIVE_WAITLIST_ENTRIES — a cap the follow-up list's own 650-row bound
 * (follow-ups-data.ts) assumes holds. SERIALIZABLE makes Postgres abort one
 * of the two as a write conflict instead of letting both see the stale count;
 * retryOnWriteConflict re-runs it once, and the retry's count already
 * includes the winner's row (Codex #130).
 *
 * The client's (and a pinned staff member's) eligibility is re-read in the
 * same transaction. The action checks it too, but before this transaction
 * starts: a client marked Inactive or Archived in the gap would keep a valid
 * foreign key, so the row would insert — and then be hidden by
 * activeWaitlistEntryWhere and never matched, an invisible orphan. Reading the
 * rows under SERIALIZABLE means a concurrent status change conflicts with this
 * insert instead of slipping between the check and the write (Codex #130).
 *
 * SERIALIZABLE alone does not do that, though: Postgres only detects a conflict
 * between two SERIALIZABLE transactions, and the writers that make a client or
 * staff member ineligible (a status change, a delete) are READ COMMITTED. A
 * deactivation could finish its scan for entries to retire, find none, and
 * commit while this insert was still pending, and both would commit — a hidden,
 * unmatchable WAITING row. So the client (and a pinned staff member) is also
 * share-locked once read, which makes the deactivation wait for this insert, or
 * this transaction fail and re-read (see lib/row-locks.ts) (Codex #130).
 */
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
  return retryOnWriteConflict(() =>
    prisma.$transaction(
      async (tx) => {
        const client = await tx.client.findFirst({
          where: { id: args.clientId, businessId: args.businessId, ...ELIGIBLE_CLIENT_WHERE },
          select: { id: true },
        });

        if (!client) {
          return { ok: false, error: WAITLIST_CLIENT_ERROR };
        }

        if (args.staffMemberId) {
          const staff = await tx.staffMember.findFirst({
            where: { id: args.staffMemberId, businessId: args.businessId, ...AVAILABLE_STAFF_WHERE },
            select: { id: true },
          });

          if (!staff) {
            return { ok: false, error: WAITLIST_STAFF_ERROR };
          }
        }

        await lockClientShared(tx, args.clientId);

        if (args.staffMemberId) {
          await lockStaffMemberShared(tx, args.staffMemberId);
        }

        const active = await tx.waitlistEntry.count({
          where: activeWaitlistEntryWhere(args.businessId),
        });

        if (active >= MAX_ACTIVE_WAITLIST_ENTRIES) {
          return { ok: false, error: WAITLIST_FULL_ERROR };
        }

        await tx.waitlistEntry.create({ data: { ...args, status: "WAITING" } });
        return { ok: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
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
        // Archived or inactive clients are left out, matching liveSlotOfferWhere:
        // an offer to one is stale the moment it is drafted, so matching them
        // would burn the slot on a draft nobody can see and the sweep would then
        // re-offer it to the same entry in a loop (Codex #130).
        ...ELIGIBLE_CLIENT_WHERE,
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
