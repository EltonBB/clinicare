-- WhatsApp: resend on request + one worker instance at a time
-- =============================================================================
-- Apply BEFORE merging the PR that uses it: the new worker waits for the lease
-- table before it connects anything. Additive and safe to re-run: every step
-- checks first, and nothing existing is changed or dropped.
--
-- 1. "WhatsAppSentMessage"
--    A copy of each message the worker sent, kept for a week. When the
--    recipient's phone can't decrypt a message it asks the sender to send it
--    again; the worker had nothing to send, so the patient saw "Waiting for this
--    message" for good. A row holds the encoded WhatsApp message - the same
--    minimum-necessary text the app keeps on "Message" - and is deleted by the
--    worker once it expires.
CREATE TABLE IF NOT EXISTS "WhatsAppSentMessage" (
  "businessId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppSentMessage_pkey" PRIMARY KEY ("businessId", "messageId")
);
CREATE INDEX IF NOT EXISTS "WhatsAppSentMessage_expiresAt_idx" ON "WhatsAppSentMessage"("expiresAt");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppSentMessage_businessId_fkey') THEN
    ALTER TABLE "WhatsAppSentMessage" ADD CONSTRAINT "WhatsAppSentMessage_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
-- Same as every app table: RLS on, no public policies, so the browser-exposed
-- API can't read or write it (the worker connects as the database owner).
ALTER TABLE "WhatsAppSentMessage" ENABLE ROW LEVEL SECURITY;

-- 2. "WhatsAppWorkerLease"
--    One row naming the worker instance allowed to hold WhatsApp connections.
--    A deploy starts the new instance while the old one still runs; both
--    connected to the same account, knocked each other off and moved its
--    encryption keys on, so phones couldn't decrypt what was sent. The new
--    instance now waits until the old one releases this row. Non-PHI.
CREATE TABLE IF NOT EXISTS "WhatsAppWorkerLease" (
  "id" TEXT NOT NULL,
  "holder" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppWorkerLease_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "WhatsAppWorkerLease" ENABLE ROW LEVEL SECURITY;
