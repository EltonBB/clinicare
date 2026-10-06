import { Prisma } from "@prisma/client";

/**
 * Acquires a transaction-scoped Postgres advisory lock keyed on the staff
 * member, so two concurrent saves targeting the same staff member's schedule
 * serialize on this call instead of both racing hasSchedulingConflict's
 * check-then-write gap underneath them. Must be called (and awaited) BEFORE
 * hasSchedulingConflict, inside the same transaction — the lock only
 * protects work that happens after it's acquired. Released automatically
 * when the transaction ends, commit or rollback either way; no manual
 * unlock needed. A no-op when no staff member is assigned — an unassigned
 * booking has no per-staff schedule to serialize (the schedule-block half of
 * hasSchedulingConflict still applies to everyone regardless).
 *
 * This is the actual race-closing mechanism — without it, hasSchedulingConflict
 * alone only narrows the window (fewer statements between the check and the
 * write), it doesn't close it: Postgres's default READ COMMITTED isolation
 * lets two concurrent transactions each read "no conflict" from their own
 * pre-write snapshot before either commits. A DB-level exclusion constraint
 * would close it at the schema level instead; this closes it at the
 * application level without a migration.
 *
 * Lock order. The transactions that reach this lock do not all take their
 * other locks in the same order: a booking or an edit takes this advisory
 * lock first and the appointment / client / offer rows after, while cancelling
 * and the Skip / Declined / Remove paths hold row locks already when they get
 * here (offerFreedSlot calls it). The staff member this lock is keyed on is
 * only known after a read, so one global order can't be imposed cheaply;
 * instead every transaction that can reach this lock is wrapped in
 * retryOnWriteConflict (lib/prisma-retry.ts), which re-runs it once when
 * Postgres aborts it as a deadlock. A new transaction that calls
 * acquireSchedulingLock, offerFreedSlot or withdrawSlotOffers must be wrapped
 * the same way.
 */
export async function acquireSchedulingLock(
  tx: Prisma.TransactionClient,
  staffMemberId: string | null
): Promise<void> {
  if (!staffMemberId) {
    return;
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${staffMemberId}))`;
}

export type SchedulingConflictCheck = {
  businessId: string;
  staffMemberId: string | null;
  startAt: Date;
  endAt: Date;
  /** Exclude this appointment's own row — pass when editing, omit when creating. */
  excludeAppointmentId?: string;
};

/**
 * True if the given window can't be booked as given: another active
 * appointment for the same staff member overlaps it, or it falls inside a
 * business-wide blocked-off period (ScheduleBlock has no staffMemberId, so
 * that half applies regardless of staff assignment). Callers must hold
 * acquireSchedulingLock first for this to actually be race-safe against a
 * concurrent caller checking the same staff member's schedule — see that
 * function's comment.
 */
export async function hasSchedulingConflict(
  tx: Prisma.TransactionClient,
  { businessId, staffMemberId, startAt, endAt, excludeAppointmentId }: SchedulingConflictCheck
): Promise<boolean> {
  if (staffMemberId) {
    const overlappingAppointment = await tx.appointment.findFirst({
      where: {
        businessId,
        staffMemberId,
        status: { not: "CANCELLED" },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });

    if (overlappingAppointment) {
      return true;
    }
  }

  const overlappingBlock = await tx.scheduleBlock.findFirst({
    where: {
      businessId,
      startsAt: { lt: endAt },
      endsAt: { gt: startAt },
    },
    select: { id: true },
  });

  return Boolean(overlappingBlock);
}
