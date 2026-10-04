-- FollowUpDraft: indexes for the foreign-key columns
-- =============================================================================
-- Postgres does not index foreign-key columns on its own. Deleting a Client
-- cascades to its drafts and deleting an Appointment sets appointmentId to NULL;
-- without an index led by those columns each delete scans FollowUpDraft to find
-- the affected rows, which gets slower as the table grows.
--
-- Additive and idempotent (CREATE INDEX IF NOT EXISTS): safe to re-run, and
-- nothing in the running app depends on it. Apply after
-- follow-up-draft-migration.sql. Matches the two @@index lines on the
-- FollowUpDraft model in schema.prisma.
CREATE INDEX IF NOT EXISTS "FollowUpDraft_clientId_idx" ON "FollowUpDraft"("clientId");
CREATE INDEX IF NOT EXISTS "FollowUpDraft_appointmentId_idx" ON "FollowUpDraft"("appointmentId");
