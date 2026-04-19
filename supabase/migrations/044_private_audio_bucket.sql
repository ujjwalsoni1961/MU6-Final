-- ============================================================
-- 044 — Lock down audio bucket (SEC-05 / STR-01)
-- ============================================================
-- Audit findings SEC-05 and STR-01: every authenticated user could read
-- every song from the 'audio' storage bucket (and worse — the bucket
-- was actually marked public during debugging and clients fetched via
-- getPublicUrl). This migration:
--   1. Forces the 'audio' bucket private.
--   2. Drops the open "Authenticated users read audio" SELECT policy.
--   3. No direct SELECT policy is added — reads go through the
--      get-audio-url edge function which uses the service_role key
--      to create short-lived (60s) signed URLs.
--
-- Creator upload/update policies stay as-is so the upload flow still
-- works. Service-role (edge functions) bypasses RLS entirely.
-- ============================================================

-- 1. Ensure the bucket exists and is private.
UPDATE storage.buckets
SET public = false
WHERE id = 'audio';

-- 2. Drop the over-broad read policy if it exists.
DROP POLICY IF EXISTS "Authenticated users read audio" ON storage.objects;

-- 3. Defensive: if anyone created a public-read counterpart, nuke it too.
DROP POLICY IF EXISTS "Public read audio" ON storage.objects;

-- 4. Leave upload/update policies on creators intact. A full audit pass
--    that switches creators to edge-function-mediated uploads can come later.
