-- Message.source: who produced an OUTBOUND message
-- =============================================================================
-- Reports' follow-up coverage counts a patient message as answered only when a
-- staff member replied. Reminders, automatic confirm/cancel acknowledgements
-- and follow-up drafts were stored exactly like replies, so a reminder sent
-- after an unanswered message counted as an answer (Codex, PR #148).
--
-- Additive and idempotent: safe to re-run. Existing rows read NULL (inbound
-- rows, and outbound rows from before this column), which Reports treats as a
-- reply, matching the old behaviour for history. Run BEFORE deploying the code
-- that writes and reads this column.
DO $$ BEGIN
  CREATE TYPE "MessageSource" AS ENUM ('INBOX_REPLY', 'REMINDER', 'REPLY_ACK', 'FOLLOW_UP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "source" "MessageSource";
