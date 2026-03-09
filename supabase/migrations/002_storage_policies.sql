-- ============================================================
-- MU6 – Storage Bucket Policies
-- ============================================================
-- Bucket design:
--   audio   (private)  – song audio files; signed URLs for playback
--   covers  (public)   – cover art; publicly readable
--   avatars (public)   – profile pictures; publicly readable

-- ----- AUDIO BUCKET -----
-- Creators can upload audio to their own folder: audio/{user_id}/{filename}
CREATE POLICY "Creators upload audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'creator')
  );

-- Creators can update/replace their own audio files
CREATE POLICY "Creators update own audio"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can read audio (for playback)
-- In production, consider signed URLs with TTL instead
CREATE POLICY "Authenticated users read audio"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'audio');

-- ----- COVERS BUCKET (public) -----
-- Creators can upload covers: covers/{user_id}/{filename}
CREATE POLICY "Creators upload covers"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'creator')
  );

-- Creators can update their own covers
CREATE POLICY "Creators update own covers"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read for covers (bucket is public, but policy still needed)
CREATE POLICY "Public read covers"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'covers');

-- ----- AVATARS BUCKET (public) -----
-- Any authenticated user can upload their own avatar: avatars/{user_id}/{filename}
CREATE POLICY "Users upload avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own avatar
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read for avatars
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');
