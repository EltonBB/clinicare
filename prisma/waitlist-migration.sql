-- Waiting list + slot offers
-- =============================================================================
-- Adds one new enum, one new table, and one new nullable column on the
-- FollowUpDraft table PR 3 added. Fully additive, one ordinary transaction —
-- nothing existing is altered or at risk. Nothing in the running app reads or
-- writes any of this until this PR's code deploys.
CREATE TYPE "WaitlistEntryStatus" AS ENUM ('WAITING', 'OFFERED', 'FILLED', 'REMOVED');

CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "staffMemberId" TEXT,
    "earliestDate" TIMESTAMP(3),
    "preferredDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "preferredFrom" TEXT,
    "preferredTo" TEXT,
    "notes" TEXT,
    "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaitlistEntry_businessId_status_idx" ON "WaitlistEntry"("businessId", "status");
CREATE INDEX "WaitlistEntry_clientId_idx" ON "WaitlistEntry"("clientId");
CREATE INDEX "WaitlistEntry_staffMemberId_idx" ON "WaitlistEntry"("staffMemberId");

ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FollowUpDraft" ADD COLUMN "waitlistEntryId" TEXT;
ALTER TABLE "FollowUpDraft" ADD CONSTRAINT "FollowUpDraft_waitlistEntryId_fkey" FOREIGN KEY ("waitlistEntryId") REFERENCES "WaitlistEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FollowUpDraft_waitlistEntryId_idx" ON "FollowUpDraft"("waitlistEntryId");

-- Row-level security. Rows link patients to the services they are waiting for.
-- Like every other app table, RLS is enabled with NO public policies, so the
-- browser-exposed anon/authenticated Supabase roles cannot read or write it. The
-- app connects as the table owner, which bypasses RLS, so normal server-side
-- access is unaffected. Idempotent; safe to re-run.
ALTER TABLE "WaitlistEntry" ENABLE ROW LEVEL SECURITY;
