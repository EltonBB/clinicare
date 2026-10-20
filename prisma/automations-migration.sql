-- Automations page (2026-10-19/20). Additive and idempotent: safe to run on a
-- database that already has some or all of it (production got these through
-- `prisma db push` as each PR landed). Run it before deploying code that
-- reads these columns.

-- PR #177: per-workspace automation settings, draft mode snapshot and delay,
-- the high-risk reminder type, and which automation sent a message.
DO $$ BEGIN
  CREATE TYPE "AutomationKind" AS ENUM (
    'BOOKING_CONFIRMATION', 'NEW_PATIENT_WELCOME', 'FIRST_REMINDER', 'SECOND_REMINDER',
    'HIGH_RISK_REMINDER', 'VISIT_CHANGED', 'THANK_YOU', 'MISSED_VISIT', 'PAYMENT_REMINDER',
    'CHECKUP_DUE', 'REBOOK', 'WAITLIST_OFFER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AutomationMode" AS ENUM ('AUTOMATIC', 'REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AutomationSetting" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "kind" "AutomationKind" NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "mode" "AutomationMode" NOT NULL,
  "timing" INTEGER,
  "template" TEXT,
  "template2" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationSetting_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationSetting_businessId_kind_key" ON "AutomationSetting"("businessId", "kind");
ALTER TABLE "AutomationSetting" ENABLE ROW LEVEL SECURITY;

ALTER TYPE "FollowUpDraftKind" ADD VALUE IF NOT EXISTS 'BOOKING_CONFIRMATION';
ALTER TYPE "FollowUpDraftKind" ADD VALUE IF NOT EXISTS 'NEW_PATIENT_WELCOME';
ALTER TYPE "FollowUpDraftKind" ADD VALUE IF NOT EXISTS 'VISIT_CHANGED';
ALTER TYPE "FollowUpDraftKind" ADD VALUE IF NOT EXISTS 'MISSED_VISIT';
ALTER TYPE "FollowUpDraftKind" ADD VALUE IF NOT EXISTS 'CHECKUP_DUE';

ALTER TABLE "FollowUpDraft" ADD COLUMN IF NOT EXISTS "autoSend" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FollowUpDraft" ADD COLUMN IF NOT EXISTS "sendAfter" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "FollowUpDraft_businessId_autoSend_status_idx" ON "FollowUpDraft"("businessId", "autoSend", "status");

ALTER TYPE "AppointmentReminderType" ADD VALUE IF NOT EXISTS 'HIGH_RISK';

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "automationKind" "AutomationKind";

-- PR #180: a check-up draft remembers the follow-up reminder it came from.
ALTER TABLE "FollowUpDraft" ADD COLUMN IF NOT EXISTS "followUpReminderId" TEXT;
DO $$ BEGIN
  ALTER TABLE "FollowUpDraft" ADD CONSTRAINT "FollowUpDraft_followUpReminderId_fkey"
    FOREIGN KEY ("followUpReminderId") REFERENCES "ClientFollowUpReminder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "FollowUpDraft_followUpReminderId_idx" ON "FollowUpDraft"("followUpReminderId");

-- PR #180: a visit draft remembers which version of the visit it was written for.
ALTER TABLE "FollowUpDraft" ADD COLUMN IF NOT EXISTS "appointmentGeneration" INTEGER;

-- PR #181: every automation can wait for review, the reminders included.
ALTER TYPE "FollowUpDraftKind" ADD VALUE IF NOT EXISTS 'FIRST_REMINDER';
ALTER TYPE "FollowUpDraftKind" ADD VALUE IF NOT EXISTS 'SECOND_REMINDER';
ALTER TYPE "FollowUpDraftKind" ADD VALUE IF NOT EXISTS 'HIGH_RISK_REMINDER';
