import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { WaitlistCandidate } from "@/lib/slot-fill-matching";

export type WaitlistEntryRow = {
  id: string;
  clientId: string;
  clientName: string;
  service: string;
  staffMemberId: string | null;
  staffMemberName: string | null;
  earliestDate: Date | null;
  preferredDays: number[];
  preferredFrom: string | null;
  preferredTo: string | null;
  notes: string | null;
  createdAt: Date;
};

export async function listWaitingEntries(businessId: string): Promise<WaitlistEntryRow[]> {
  const rows = await prisma.waitlistEntry.findMany({
    where: { businessId, status: "WAITING" },
    include: { client: { select: { name: true } }, staffMember: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    service: row.service,
    staffMemberId: row.staffMemberId,
    staffMemberName: row.staffMember?.name ?? null,
    earliestDate: row.earliestDate,
    preferredDays: row.preferredDays,
    preferredFrom: row.preferredFrom,
    preferredTo: row.preferredTo,
    notes: row.notes,
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

const ALREADY_REMOVED_ERROR = "This waiting-list entry was already removed.";

/** Soft-remove via CAS: WAITING/OFFERED -> REMOVED, guarded so a concurrent offer/fill can't be silently discarded by a stale remove. */
export async function removeWaitlistEntry(args: {
  id: string;
  businessId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { count } = await prisma.waitlistEntry.updateMany({
    where: { id: args.id, businessId: args.businessId, status: { in: ["WAITING", "OFFERED"] } },
    data: { status: "REMOVED" },
  });
  return count === 0 ? { ok: false, error: ALREADY_REMOVED_ERROR } : { ok: true };
}

/**
 * Raw WAITING candidates for the matcher, shaped to WaitlistCandidate.
 * Optionally runs inside an existing transaction (`tx`) — cancelAppointmentCore
 * (Task 4) calls this from inside its own $transaction so the match read and
 * the eventual draft write are atomic with the cancellation itself.
 *
 * `tx` is typed as `Prisma.TransactionClient` (not the brief's draft
 * `Pick<PrismaClient, "waitlistEntry">`) to match the existing convention in
 * appointments-shared.ts (`refreshClientLastVisitAt`'s `db: Prisma.TransactionClient
 * = prisma` param) — a plain `PrismaClient` is structurally assignable to
 * `Prisma.TransactionClient` (it's a superset, missing none of TransactionClient's
 * members), so `args.tx ?? prisma` type-checks cleanly with no cast needed.
 */
export async function findMatchingWaitlistCandidates(args: {
  businessId: string;
  service: string;
  tx?: Prisma.TransactionClient;
}): Promise<WaitlistCandidate[]> {
  const client = args.tx ?? prisma;
  const rows = await client.waitlistEntry.findMany({
    where: { businessId: args.businessId, status: "WAITING", service: { equals: args.service, mode: "insensitive" } },
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
    },
  });

  return rows;
}
