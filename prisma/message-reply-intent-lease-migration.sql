-- Message: keep the reply-intent claim's lease apart from its "handled" mark
-- =============================================================================
-- applyInboundReplyIntent used to keep both in "replyIntentHandledAt": a future
-- time while a check ran, the time it finished once done. A check whose
-- instance died mid-run left the future time behind, and once that time was
-- close enough it read as "handled" for good - the patient's confirm/cancel was
-- never applied (Codex #130). The lease now has its own column; a lease that
-- has run out with no "handled" mark is reclaimed by a late worker retry or the
-- hourly recovery sweep (recoverAbandonedReplyIntents, run by the reminders
-- cron), which the index below serves.
--
-- Additive and idempotent (IF NOT EXISTS): safe to re-run. Existing rows keep
-- their "replyIntentHandledAt" value, which the new code reads as handled - the
-- same answer the old code gave every finished check. Apply BEFORE deploying
-- the code that uses the column.
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "replyIntentLeaseUntil" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Message_replyIntentLeaseUntil_idx" ON "Message"("replyIntentLeaseUntil");
