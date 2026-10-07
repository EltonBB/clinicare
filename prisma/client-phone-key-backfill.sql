-- Fill in Client.phoneKey where it is still NULL
-- =============================================================================
-- Run in Supabase's SQL editor. Safe to re-run: it only touches rows whose key
-- is NULL, and computes the same digits-only key the app writes
-- (phoneLookupKey in src/lib/inbox.ts; step 1 of phone-key-migration.sql).
--
-- Every app path that creates a client or changes its phone sets phoneKey, but
-- rows created outside the app (demo-data seed scripts) were left NULL: 64 of
-- 70 clients on 2026-10-07. Until this runs, those clients aren't found by the
-- indexed lookups: a WhatsApp reply from them doesn't link to their record (so
-- a confirm/cancel reply isn't applied), and the dashboard's Messages card
-- can't name the conversation after them (found in the 2026-10-07 QA, Codex
-- #143).
UPDATE "Client"
SET "phoneKey" = NULLIF(regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g'), '')
WHERE "phoneKey" IS NULL;
