-- Appointment: an immutable cancellation timestamp, and the schedule it froze
-- =============================================================================
-- The no-show risk scorer's late-cancellation signal needs to know exactly when
-- a visit was cancelled, and what its startAt actually was at that moment.
-- Prisma's auto-managed `updatedAt` is NOT a substitute for the first: it moves
-- on every field edit. `startAt` itself is NOT a substitute for the second: a
-- still-cancelled booking's time can be edited afterward (a supported flow),
-- which would silently change the gap a later read computes. Both columns are
-- set exactly once, on the cancel, and cleared on un-cancel — application code,
-- not the database, keeps them correct; this migration only adds the columns.
--
-- Additive and idempotent (IF NOT EXISTS): safe to re-run, nothing existing is
-- altered, and every historical CANCELLED row simply reads NULL on both (no
-- late-cancel signal from it) instead of a wrong one.
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "cancelledScheduledStartAt" TIMESTAMP(3);
