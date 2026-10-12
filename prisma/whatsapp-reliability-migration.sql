-- WhatsApp reliability: reply-intent lease + the worker's keyed-send record
-- =============================================================================
-- Apply BEFORE deploying the app and the worker that use it, and run it ONCE
-- MORE after the new app is live (see step 1). Additive and safe to re-run:
-- every step checks first, and nothing existing is dropped.
--
-- 1. Message."replyIntentLeaseUntil"
--    applyInboundReplyIntent used to keep both its lease and its "handled" mark
--    in "replyIntentHandledAt": a time two minutes ahead while a check ran, the
--    time the check started once it finished. A check whose instance died
--    mid-run left that future time behind, and later deliveries read it as
--    handled for good - the patient's confirm/cancel was never applied
--    (Codex #130). The lease now has its own column; an expired lease with no
--    "handled" mark can be reclaimed by a late worker retry, and the hourly
--    sweep (handOffAbandonedReplyIntents, run by the reminders cron) hands the
--    rest to staff by marking the conversation unread (Codex #133).
--
--    Leases the old code left behind are moved into the new column (Codex
--    #133). They are recognisable by their distance from the message's own
--    "sentAt" (set when it was recorded): a check starts within about a minute
--    of that (the worker's retries end by then), and the old code marked a
--    finished check with the time it STARTED, so its finished marks lie 0-60s
--    after "sentAt", while an old lease (its start + 120s) lies 120-180s after
--    it. Rows 100-200s after with no "replyIntentLeaseUntil" are converted; the
--    sweep then hands them to staff.
--    The old app keeps serving between this migration and the deploy, and can
--    leave such a lease behind in that window - so run this file once more
--    after the new app is live. That rerun can't touch the new code's own
--    work: every row the new code claims keeps a "replyIntentLeaseUntil",
--    finished or not (only a released claim clears it, and that leaves no
--    handled mark), so "no lease" means the old code wrote it (Codex #133).
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "replyIntentLeaseUntil" TIMESTAMP(3);
UPDATE "Message"
SET "replyIntentLeaseUntil" = "replyIntentHandledAt", "replyIntentHandledAt" = NULL
WHERE "direction" = 'INBOUND'
  AND "replyIntentLeaseUntil" IS NULL
  AND "replyIntentHandledAt" - "sentAt" BETWEEN INTERVAL '100 seconds' AND INTERVAL '200 seconds';
CREATE INDEX IF NOT EXISTS "Message_replyIntentLeaseUntil_idx" ON "Message"("replyIntentLeaseUntil");

-- 2. Appointment."reminderGeneration"
--    Goes up by one whenever a booking's reminders are reset, and is part of
--    each reminder's send idempotency key, so a reminder owed again after a
--    reset (a changed client, staff member, service, length or status, or a
--    cancel) is a new message rather than a repeat of the old one (Codex #133).
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "reminderGeneration" INTEGER NOT NULL DEFAULT 0;

-- 3. "WhatsAppSendKey"
--    The worker's record of each keyed send (POST /send idempotencyKey), so a
--    repeat of a key is answered from the record - replayed if it was sent,
--    "outcome unknown" if it may have been - and never sent twice, even after a
--    worker restart (Codex #133). A row holds a keyed HMAC fingerprint of the
--    recipient and text and the provider's message id - no text, no phone
--    number. Rows expire after a week and are deleted by the worker.
CREATE TABLE IF NOT EXISTS "WhatsAppSendKey" (
  "businessId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppSendKey_pkey" PRIMARY KEY ("businessId", "key")
);
CREATE INDEX IF NOT EXISTS "WhatsAppSendKey_expiresAt_idx" ON "WhatsAppSendKey"("expiresAt");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppSendKey_businessId_fkey') THEN
    ALTER TABLE "WhatsAppSendKey" ADD CONSTRAINT "WhatsAppSendKey_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
-- Same as every app table: RLS on, no public policies, so the browser-exposed
-- API can't read or write it (the worker connects as the database owner).
ALTER TABLE "WhatsAppSendKey" ENABLE ROW LEVEL SECURITY;
