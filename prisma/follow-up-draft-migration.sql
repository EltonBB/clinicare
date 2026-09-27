-- Follow-up drafts (slot offers, rebooking nudges, payment reminders, thank-yous)
-- =============================================================================
-- Adds two new enum types and one new table. Fully additive: nothing existing
-- is altered, and — unlike the NO_SHOW status migration — this is a normal
-- CREATE-only change, safe inside one transaction. Nothing in the running app
-- reads or writes this table until the Follow-ups page code deploys; the
-- confirm-by-reply workflow does not depend on this table at all.
CREATE TYPE "FollowUpDraftKind" AS ENUM ('SLOT_OFFER', 'REBOOK', 'PAYMENT', 'THANK_YOU');
CREATE TYPE "FollowUpDraftStatus" AS ENUM ('PENDING', 'SENT', 'DISMISSED', 'EXPIRED');

CREATE TABLE "FollowUpDraft" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "FollowUpDraftKind" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "FollowUpDraftStatus" NOT NULL DEFAULT 'PENDING',
    "appointmentId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FollowUpDraft_businessId_dedupeKey_key" ON "FollowUpDraft"("businessId", "dedupeKey");
CREATE INDEX "FollowUpDraft_businessId_status_createdAt_idx" ON "FollowUpDraft"("businessId", "status", "createdAt");

ALTER TABLE "FollowUpDraft" ADD CONSTRAINT "FollowUpDraft_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpDraft" ADD CONSTRAINT "FollowUpDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpDraft" ADD CONSTRAINT "FollowUpDraft_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security. The drafted message text carries patient names. Like every
-- other app table, RLS is enabled with NO public policies, so the browser-exposed
-- anon/authenticated Supabase roles cannot read or write it. The app connects as
-- the table owner, which bypasses RLS, so normal server-side access is
-- unaffected. Idempotent; safe to re-run.
ALTER TABLE "FollowUpDraft" ENABLE ROW LEVEL SECURITY;

-- The two foreign-key indexes are in follow-up-draft-indexes-migration.sql (a
-- separate, idempotent file, because this one is already applied to the shared
-- database). Apply that one too on any database this file created.
