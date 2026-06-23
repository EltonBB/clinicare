-- Canonical phone-key migration
-- =============================================================================
-- Adds a digit-only "phoneKey" to Client and Conversation and re-keys the
-- Conversation uniqueness on it, so the inbound webhook, reminder sender, inbox
-- reply, and convert-to-client paths all resolve the SAME client / conversation
-- by an indexed lookup. Before this, conversations were keyed on the raw
-- phoneNumber, so the same patient could split into two rows when one writer
-- stored "+38344..." (Twilio E.164) and another stored "38344..." — and the
-- client phone-match scanned the whole client table per inbound message.
--
-- The canonical key mirrors phoneLookupKey() in src/lib/inbox.ts: strip every
-- non-digit (this also removes a leading "+", spaces, punctuation, and any
-- "whatsapp:"/"tel:" scheme, which carry no digits). regexp_replace(..,'[^0-9]')
-- is the SQL equivalent for realistic phone strings.
--
-- Matches the end state of prisma/schema.prisma:
--   Client.phoneKey        + @@index([businessId, phoneKey])
--   Conversation.phoneKey  + @@unique([businessId, phoneKey])
-- The OLD @@unique([businessId, phoneNumber]) is KEPT (both uniques coexist) so
-- this migration is BACKWARD-COMPATIBLE with the currently-deployed code, which
-- still upserts conversations on phoneNumber. That makes it safe to apply to
-- live prod before the new phoneKey-based code ships — no coordinated swap, no
-- outage. Dropping the phoneNumber unique is an optional later cleanup, once the
-- new code is deployed everywhere (see the commented statement at the end).
--
-- Safe to re-run: every step is guarded (IF [NOT] EXISTS) and the backfill /
-- merge are idempotent. As of writing, prod has 0 colliding groups, so the
-- merge block is a no-op there; it exists so the migration is correct on any
-- data (e.g. the test clinic, or rows a still-deployed old build creates with a
-- NULL phoneKey before the new code lands — re-running this backfills them).

BEGIN;

-- 1. Client.phoneKey -----------------------------------------------------------
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "phoneKey" TEXT;

UPDATE "Client"
   SET "phoneKey" = NULLIF(regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g'), '');

CREATE INDEX IF NOT EXISTS "Client_businessId_phoneKey_idx"
  ON "Client" ("businessId", "phoneKey");

-- 2. Conversation.phoneKey -----------------------------------------------------
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "phoneKey" TEXT;

UPDATE "Conversation"
   SET "phoneKey" = NULLIF(regexp_replace(COALESCE("phoneNumber", ''), '[^0-9]', '', 'g'), '');

-- 3. Merge any conversations that now collide on (businessId, phoneKey) ---------
--    Survivor = lexicographically smallest id in each group.
--    a) re-point the duplicates' messages onto the survivor
WITH dupes AS (
  SELECT id,
         MIN(id) OVER (PARTITION BY "businessId", "phoneKey") AS keep_id
  FROM "Conversation"
  WHERE "phoneKey" IS NOT NULL
)
UPDATE "Message" m
   SET "conversationId" = d.keep_id
  FROM dupes d
 WHERE m."conversationId" = d.id
   AND d.id <> d.keep_id;

--    b) fold the duplicates' unread counts into the survivor
WITH sums AS (
  SELECT "businessId", "phoneKey",
         MIN(id) AS keep_id,
         SUM("unreadCount") AS total_unread
  FROM "Conversation"
  WHERE "phoneKey" IS NOT NULL
  GROUP BY "businessId", "phoneKey"
  HAVING COUNT(*) > 1
)
UPDATE "Conversation" c
   SET "unreadCount" = s.total_unread
  FROM sums s
 WHERE c.id = s.keep_id;

--    c) delete the now-merged duplicates
WITH dupes AS (
  SELECT id,
         MIN(id) OVER (PARTITION BY "businessId", "phoneKey") AS keep_id
  FROM "Conversation"
  WHERE "phoneKey" IS NOT NULL
)
DELETE FROM "Conversation" c
 USING dupes d
 WHERE c.id = d.id
   AND d.id <> d.keep_id;

-- 4. Add the canonical phoneKey uniqueness (keep phoneNumber's for now) --------
--    (Prisma manages @@unique as a UNIQUE INDEX, so mirror that exactly.)
--    Both uniques coexist; the currently-deployed code keeps working on
--    phoneNumber while the new code uses phoneKey.
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_businessId_phoneKey_key"
  ON "Conversation" ("businessId", "phoneKey");

COMMIT;

-- OPTIONAL CLEANUP (run only AFTER the phoneKey-based code is deployed to prod):
-- once nothing upserts on phoneNumber anymore, drop its now-redundant unique.
-- DROP INDEX IF EXISTS "Conversation_businessId_phoneNumber_key";
