import type { Prisma } from "@prisma/client";

/**
 * Row locks that make "this client / staff member is eligible" a fact that holds
 * for the rest of a transaction.
 *
 * Adding someone to the waiting list reads their eligibility and then inserts,
 * in a SERIALIZABLE transaction. The writers that take eligibility away — a
 * client set Inactive or Archived, a staff member set Inactive or deleted — are
 * ordinary READ COMMITTED transactions, and Postgres only detects a
 * serializable conflict between two SERIALIZABLE transactions. So an add that
 * read "eligible" could commit beside a deactivation that had already finished
 * scanning for entries to retire, leaving a WAITING entry nobody can see or
 * match (a pinned one is worse for a delete: the foreign key would clear its
 * staff member and turn it into "any staff"). Verified against a live Postgres.
 *
 * A share lock on the subject row, taken after the eligibility read, closes both
 * orders:
 * - the deactivation's UPDATE (or the delete) comes after the lock: it waits
 *   for the add to commit, and the entry scan that follows its update now sees
 *   the new entry and retires it;
 * - the deactivation committed after the add's snapshot: taking the lock then
 *   fails with a serialization failure, which retryOnWriteConflict re-runs, and
 *   the retry reads the member as ineligible.
 * A deleting transaction takes the exclusive lock BEFORE its scan, so an add
 * either finished first (and is scanned) or is turned away after the delete.
 * Without that, an add that took its share lock after the scan had found nothing
 * would commit an entry the delete never retires; a cancellation could then offer
 * it a slot, and the delete's cascade would remove entry and offer together, so
 * the freed slot is never offered to anyone else (Codex #130).
 *
 * Not the advisory lock acquireSchedulingLock uses: a SERIALIZABLE transaction
 * fixes its snapshot at its first statement, so an advisory lock waited on
 * inside one would still leave it reading the old eligibility afterwards. A row
 * lock fails the transaction instead when the row changed since the snapshot.
 *
 * Everything runs on the caller's transaction and is released when it ends.
 */
export async function lockClientShared(tx: Prisma.TransactionClient, clientId: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM "Client" WHERE "id" = ${clientId} FOR SHARE`;
}

export async function lockStaffMemberShared(tx: Prisma.TransactionClient, staffMemberId: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM "StaffMember" WHERE "id" = ${staffMemberId} FOR SHARE`;
}

export async function lockStaffMemberExclusive(tx: Prisma.TransactionClient, staffMemberId: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM "StaffMember" WHERE "id" = ${staffMemberId} FOR UPDATE`;
}

/**
 * The client counterpart of lockStaffMemberExclusive, for a client delete.
 *
 * FOR NO KEY UPDATE rather than FOR UPDATE: it conflicts with the share lock the
 * waiting-list add holds, and with the UPDATE a status change does, which is all
 * the protocol needs - but not with the KEY SHARE lock a foreign key check takes.
 * So a slot offer, appointment or payment being inserted for this client is not
 * made to wait on this transaction, which would otherwise be a lock cycle with the
 * entry rows this transaction goes on to retire. The DELETE itself still takes the
 * full lock when it runs.
 */
export async function lockClientExclusive(tx: Prisma.TransactionClient, clientId: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM "Client" WHERE "id" = ${clientId} FOR NO KEY UPDATE`;
}
