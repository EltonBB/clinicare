import { Prisma } from "@prisma/client";

// Postgres reports a deadlock as SQLSTATE 40P01 ("deadlock detected").
const DEADLOCK_PATTERN = /\b40P01\b|deadlock detected/i;

/**
 * True for a transaction Postgres aborted as a deadlock / write conflict.
 * Prisma names those P2034, but through the pg driver adapter a real deadlock
 * arrives as an unclassified PrismaClientUnknownRequestError with no `code`
 * — the SQLSTATE and text are only in its message (verified against a live
 * database). Any other unknown error is not a conflict and is never retried.
 */
function isWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034";
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
