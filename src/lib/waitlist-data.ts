import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { WaitlistCandidate } from "@/lib/slot-fill-matching";
import { formatZonedShortDate } from "@/lib/time-zone";

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
export async function listWaitingEntries(businessId: string): Promise<WaitlistEntryRow[]> {
  const rows = await prisma.waitlistEntry.findMany({
    where: { businessId, status: { in: ["WAITING", "OFFERED"] } },
    include: {
      client: { select: { name: true } },
      staffMember: { select: { name: true } },
      followUpDrafts: {
        where: { kind: "SLOT_OFFER", status: { in: ["PENDING", "SENT"] } },
        select: { status: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
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
    offer:
      row.status === "OFFERED" ? (row.followUpDrafts[0]?.status === "SENT" ? "sent" : "pending") : null,
    createdAt: row.createdAt,
  }));
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
 * or to an entry that was already offered this same slot and let it go
 * (`freedAppointmentId` — any earlier SLOT_OFFER draft for it, whatever its
 * status).
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
      service: { equals: args.service, mode: "insensitive" },
      clientId: { not: args.excludeClientId },
      // Archived means either flag (see formatStatus in lib/clients.ts).
      client: { isArchived: false, status: { not: "ARCHIVED" } },
      followUpDrafts: { none: { kind: "SLOT_OFFER", appointmentId: args.freedAppointmentId } },
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

  return rows.map(({ client, ...row }) => ({ ...row, clientName: client.name }));
}
