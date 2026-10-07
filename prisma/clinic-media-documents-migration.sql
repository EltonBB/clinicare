-- Client documents: let the private media bucket accept PDFs up to 10 MB
-- =============================================================================
-- Run in Supabase's SQL editor. Safe to re-run; it only sets the bucket's own
-- upload limits and touches no files and no access policies.
--
-- The client Documents tab accepts a PDF or an image of up to 10 MB
-- (src/components/clients/client-details-page.tsx, uploadWorkspaceDocument in
-- src/lib/media-storage-client.ts), but the "clinic-media" bucket was created
-- to take only JPG/PNG/WebP/GIF of up to 5 MB, so storage refused every PDF
-- (and any file over 5 MB) and the upload failed with a generic message. Found
-- in the 2026-10-06 full QA: no client document had ever been stored.
--
-- 10 MB = 10485760 bytes, at or above every limit the app checks before it
-- uploads (documents 10,000,000; logos 750,000). Access is unchanged: the
-- bucket stays private, and each signed-in user can still only reach files
-- under their own folder.
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
  file_size_limit = 10485760
WHERE id = 'clinic-media';
