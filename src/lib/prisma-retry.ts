import { Prisma } from "@prisma/client";

// Postgres reports a deadlock as SQLSTATE 40P01 ("deadlock detected").
const DEADLOCK_PATTERN = /\b40P01\b|deadlock detected/i;

// A raw query ($executeRaw / $queryRaw) that Postgres aborts reports its SQLSTATE
// in `meta.code` of a P2010 error: 40001 for a serialization failure, 40P01 for
// a deadlock.
const RAW_QUERY_CONFLICT_SQLSTATES = new Set(["40001", "40P01"]);

/**
 * True for a transaction Postgres aborted as a deadlock / write conflict.
 * Prisma names those P2034, but through the pg driver adapter a real deadlock
 * arrives as an unclassified PrismaClientUnknownRequestError with no `code`
 * — the SQLSTATE and text are only in its message (verified against a live
 * database) — and the same conflict raised by a raw query (the row locks in
 * lib/row-locks.ts) arrives as P2010 with the SQLSTATE in `meta.code`, not as
 * P2034 (also verified against a live database). Any other error is not a
 * conflict and is never retried.
 */
function isWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") {
      return true;
    }

    const sqlState = (error.meta as { code?: unknown } | undefined)?.code;

    return error.code === "P2010" && typeof sqlState === "string" && RAW_QUERY_CONFLICT_SQLSTATES.has(sqlState);
  }

  return error instanceof Prisma.PrismaClientUnknownRequestError && DEADLOCK_PATTERN.test(error.message);
}

/**
 * Runs a transaction, retrying it once if Postgres aborted it as a deadlock
 * or a serialization write conflict (see isWriteConflict). Two requests
 * racing the same guarded write can collide; the retry sees the winner's
 * committed state and its own guard turns into a clean no-op (or, for a
 * SERIALIZABLE transaction, re-reads state the other side just committed).
 * Shared by slot-offers.ts (offer/withdraw/expiry transactions) and
 * waitlist-data.ts (the waiting-list capacity check) — moved out of
 * slot-offers.ts so waitlist-data.ts, which slot-offers.ts itself imports
 * from, doesn't need to import it back.
 */
export async function retryOnWriteConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isWriteConflict(error)) {
      return run();
    }
    throw error;
  }
}
