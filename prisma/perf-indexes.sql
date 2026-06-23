-- Performance index changes (also encoded in schema.prisma — applied automatically
-- by `npm run db:push`). Provided here so they can be applied directly via the
-- Supabase SQL editor without a local db push (prod enforces strict TLS).
--
-- All statements are idempotent and non-destructive. Tables are small today, so
-- CREATE INDEX runs instantly; at scale, consider CREATE INDEX CONCURRENTLY
-- (cannot run inside a transaction block).
--
-- Source: Supabase performance advisor (unindexed_foreign_keys + unused_index)
-- + static audit (hot sort/filter paths).

-- 1) Covering indexes for clientId foreign keys (advisor: unindexed_foreign_keys).
--    Speeds client-detail sub-record loads (WHERE clientId = ...) and cascade
--    deletes; the existing (businessId, clientId, ...) composites are businessId-
--    first and do NOT serve clientId-alone lookups.
CREATE INDEX IF NOT EXISTS "ClientMedication_clientId_idx" ON "ClientMedication" ("clientId");
CREATE INDEX IF NOT EXISTS "ClientDocument_clientId_idx" ON "ClientDocument" ("clientId");
CREATE INDEX IF NOT EXISTS "ClientPayment_clientId_idx" ON "ClientPayment" ("clientId");
CREATE INDEX IF NOT EXISTS "ClientHealthItem_clientId_idx" ON "ClientHealthItem" ("clientId");
CREATE INDEX IF NOT EXISTS "ClientCareNote_clientId_idx" ON "ClientCareNote" ("clientId");
CREATE INDEX IF NOT EXISTS "ClientTreatmentPlanItem_clientId_idx" ON "ClientTreatmentPlanItem" ("clientId");
CREATE INDEX IF NOT EXISTS "ClientFollowUpReminder_clientId_idx" ON "ClientFollowUpReminder" ("clientId");
CREATE INDEX IF NOT EXISTS "ClientGalleryItem_clientId_idx" ON "ClientGalleryItem" ("clientId");
CREATE INDEX IF NOT EXISTS "Message_clientId_idx" ON "Message" ("clientId");

-- 2) Supporting indexes for hot sort/filter paths.
--    Conversation list + dashboard order by updatedAt; dashboard month-to-date
--    payments filter on the (paidAt IS NULL -> createdAt) branch.
CREATE INDEX IF NOT EXISTS "Conversation_businessId_updatedAt_idx" ON "Conversation" ("businessId", "updatedAt");
CREATE INDEX IF NOT EXISTS "ClientPayment_businessId_createdAt_idx" ON "ClientPayment" ("businessId", "createdAt");

-- 3) Drop indexes that exactly duplicate a UNIQUE constraint's index
--    (advisor: unused_index — they shadow the *_key index for the same columns).
DROP INDEX IF EXISTS "Client_businessId_phone_idx";
DROP INDEX IF EXISTS "Conversation_businessId_phoneNumber_idx";
