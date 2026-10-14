-- Workflow settings (rebooking nudges, payment reminders, thank-yous)
-- =============================================================================
-- One new table, fully additive. Nothing existing is altered. Reads a
-- WorkflowSettings row that doesn't exist yet (most businesses, until they
-- save this new Settings section) already fall back to code-level defaults —
-- see src/lib/workflow-generators.ts — so this migration alone changes
-- nothing observable until this PR's code deploys.
CREATE TABLE "WorkflowSettings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "rebookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rebookAfterMonths" INTEGER NOT NULL DEFAULT 6,
    "paymentReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "paymentReminderAfterDays" INTEGER NOT NULL DEFAULT 3,
    "thankYouEnabled" BOOLEAN NOT NULL DEFAULT true,
    "thankYouDelayHours" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowSettings_businessId_key" ON "WorkflowSettings"("businessId");

ALTER TABLE "WorkflowSettings" ADD CONSTRAINT "WorkflowSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security. Like every other app table, RLS is enabled with NO public
-- policies, so the browser-exposed anon/authenticated Supabase roles cannot read
-- or write it. The app connects as the table owner, which bypasses RLS, so
-- normal server-side access is unaffected. Idempotent; safe to re-run.
ALTER TABLE "WorkflowSettings" ENABLE ROW LEVEL SECURITY;
