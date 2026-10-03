import { Prisma } from "@prisma/client";

// A fixed namespace key for pg_advisory_xact_lock's two-int form, distinct
// from other advisory-lock domains in this codebase (e.g. scheduling-conflicts.ts's
// single-int hashtext(staffMemberId) form) so a currency change and a
// scheduling save can never collide on the same lock by coincidence.
const FINANCIAL_LOCK_NAMESPACE = 726342;

/**
 * Acquires a transaction-scoped Postgres advisory lock keyed on the
 * business, so a currency change and a payment being recorded for the same
 * workspace serialize on this call instead of racing each other's
 * check-then-write gap. Both sides must acquire this lock (and hold it for
 * the rest of their transaction) for it to actually close the race — see
 * acquireSchedulingLock's own comment in scheduling-conflicts.ts for why a
 * one-sided check-then-write is never enough under READ COMMITTED. Released
 * automatically when the transaction ends, commit or rollback either way.
 */
export async function acquireBusinessFinancialLock(
  tx: Prisma.TransactionClient,
  businessId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${FINANCIAL_LOCK_NAMESPACE}, hashtext(${businessId}))`;
}
