-- Audit log (ROADMAP Step 3 safeguard)
-- =============================================================================
-- One new enum and one new table. Fully additive, one ordinary transaction:
-- nothing existing is altered. Rows hold ids only, never patient content, and
-- clientId has no foreign key so the trail outlives a deleted patient.
CREATE TYPE "AuditActorType" AS ENUM ('OWNER', 'STAFF');

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "clientId" TEXT,
    "recordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");
CREATE INDEX "AuditLog_businessId_clientId_createdAt_idx" ON "AuditLog"("businessId", "clientId", "createdAt");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Like every other app table: RLS on with NO public policies, so the
-- browser-exposed Supabase roles can't read or write it. The app connects as
-- the table owner, which bypasses RLS.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
