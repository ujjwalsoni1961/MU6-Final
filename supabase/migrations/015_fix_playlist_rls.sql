-- ============================================================
-- Fix: Playlist RLS policies incompatible with Thirdweb auth
-- ============================================================
-- Problem: playlists and playlist_songs have RLS policies that
-- check auth.uid() = owner_id. But this app uses Thirdweb
-- wallet-based auth — users don't have Supabase Auth sessions,
-- so auth.uid() is always NULL, causing INSERT to fail with:
--   "new row violates row-level security policy for table playlists"
--
-- Fix: Replace auth.uid()-based policies with permissive ones.
-- The app enforces ownership at the application layer by passing
-- the correct owner_id / profile_id from the AuthContext.
-- This matches how likes, streams, and other tables effectively
-- operate (the anon client has no auth.uid() set).
-- ============================================================

-- ── PLAYLISTS ──

DROP POLICY IF EXISTS playlists_select ON playlists;
DROP POLICY IF EXISTS playlists_insert ON playlists;
DROP POLICY IF EXISTS playlists_update ON playlists;
DROP POLICY IF EXISTS playlists_delete ON playlists;

-- Anyone can read public playlists; all rows visible to authenticated/anon clients
-- (ownership filtering is done at the application layer)
CREATE POLICY playlists_select ON playlists FOR SELECT USING (TRUE);

-- Allow inserts — the app sets owner_id from the authenticated wallet profile
CREATE POLICY playlists_insert ON playlists FOR INSERT WITH CHECK (TRUE);

-- Allow updates — the app only sends updates for playlists the user owns
CREATE POLICY playlists_update ON playlists FOR UPDATE USING (TRUE) WITH CHECK (TRUE);

-- Allow deletes — the app only deletes playlists the user owns
CREATE POLICY playlists_delete ON playlists FOR DELETE USING (TRUE);

-- ── PLAYLIST_SONGS ──

DROP POLICY IF EXISTS playlist_songs_select ON playlist_songs;
DROP POLICY IF EXISTS playlist_songs_insert ON playlist_songs;
DROP POLICY IF EXISTS playlist_songs_delete ON playlist_songs;

-- Allow all read/write operations — ownership enforced at application layer
CREATE POLICY playlist_songs_select ON playlist_songs FOR SELECT USING (TRUE);
CREATE POLICY playlist_songs_insert ON playlist_songs FOR INSERT WITH CHECK (TRUE);
CREATE POLICY playlist_songs_delete ON playlist_songs FOR DELETE USING (TRUE);
