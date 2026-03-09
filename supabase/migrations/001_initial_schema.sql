-- ============================================================
-- MU6 – Initial Schema Migration
-- Web3 Music Streaming Platform with NFTs & Royalty Sharing
-- ============================================================
-- Execution order matters: types → tables → triggers → RLS → indexes → storage

-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ============================================================
-- 1. CUSTOM ENUM TYPES
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('listener', 'creator', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE creator_type AS ENUM ('artist', 'producer', 'composer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE split_role AS ENUM ('artist', 'producer', 'composer', 'label', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE royalty_source_type AS ENUM ('stream', 'primary_sale', 'secondary_sale');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM ('completed', 'pending', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE nft_rarity AS ENUM ('common', 'rare', 'legendary');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. TABLES
-- ============================================================

-- ----- 2.1 PROFILES -----
-- Linked to auth.users; one row per user.
-- wallet_address comes from Thirdweb after auth.
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address  TEXT UNIQUE,
  email           TEXT,
  display_name    TEXT,
  bio             TEXT,
  creator_type    creator_type,          -- NULL for listeners
  role            user_role NOT NULL DEFAULT 'listener',
  avatar_path     TEXT,                  -- storage path in 'avatars' bucket
  country         TEXT,
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- 2.2 SONGS -----
CREATE TABLE IF NOT EXISTS songs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title                  TEXT NOT NULL,
  album                  TEXT,
  genre                  TEXT,
  description            TEXT,
  duration_seconds       INTEGER,
  audio_path             TEXT,          -- path in 'audio' bucket
  cover_path             TEXT,          -- path in 'covers' bucket
  first_release_anywhere BOOLEAN DEFAULT TRUE,
  release_date           DATE,
  is_published           BOOLEAN NOT NULL DEFAULT FALSE,
  plays_count            BIGINT NOT NULL DEFAULT 0,
  likes_count            BIGINT NOT NULL DEFAULT 0,
  -- Track type & ownership metadata (from upload form)
  track_type             TEXT,          -- 'original', 'cover', 'remix', 'other'
  master_ownership       TEXT,          -- 'i_own_100', 'label_owns_100', 'shared'
  master_ownership_pct   NUMERIC(5,2),
  composition_ownership  TEXT,          -- 'i_own_100', 'someone_else_owns_100', 'shared'
  composition_owner_name TEXT,
  composition_ownership_pct NUMERIC(5,2),
  -- Previous release info
  previous_platform      TEXT,
  previous_release_date  DATE,
  exclusive_rights_granted BOOLEAN,
  exclusive_platform     TEXT,
  exclusive_until_date   DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- 2.3 SONG RIGHTS SPLITS -----
-- Defines who owns what % of off-chain royalty pool.
-- Invariant: SUM(share_percent) = 100 per song (enforced by trigger).
CREATE TABLE IF NOT EXISTS song_rights_splits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id               UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  party_email           TEXT NOT NULL,
  party_name            TEXT NOT NULL,
  role                  split_role NOT NULL DEFAULT 'artist',
  share_percent         NUMERIC(5,2) NOT NULL CHECK (share_percent > 0 AND share_percent <= 100),
  linked_profile_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  linked_wallet_address TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- 2.4 NFT RELEASES -----
-- Each row is a "tier" for a song's NFT drop.
-- Invariant: SUM(allocated_royalty_percent) <= 50 per song (enforced by trigger).
CREATE TABLE IF NOT EXISTS nft_releases (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id                  UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  chain_id                 TEXT NOT NULL DEFAULT '84532',  -- Base Sepolia
  contract_address         TEXT,
  tier_name                TEXT NOT NULL,          -- e.g. 'Gold', 'Silver'
  rarity                   nft_rarity NOT NULL DEFAULT 'common',
  total_supply             INTEGER NOT NULL CHECK (total_supply > 0 AND total_supply <= 100),
  allocated_royalty_percent NUMERIC(5,2) NOT NULL CHECK (allocated_royalty_percent >= 0 AND allocated_royalty_percent <= 50),
  price_eth                NUMERIC(18,8),          -- mint price
  minted_count             INTEGER NOT NULL DEFAULT 0,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- 2.5 NFT TOKENS -----
-- One row per minted token; mirrors on-chain ownership.
CREATE TABLE IF NOT EXISTS nft_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_release_id        UUID NOT NULL REFERENCES nft_releases(id) ON DELETE CASCADE,
  token_id              TEXT NOT NULL,               -- on-chain token ID
  owner_wallet_address  TEXT NOT NULL,
  minted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_transferred_at   TIMESTAMPTZ,
  last_sale_price_eth   NUMERIC(18,8),
  last_sale_tx_hash     TEXT,
  UNIQUE(nft_release_id, token_id)
);

-- ----- 2.6 STREAMS -----
-- One row per play event. is_qualified = true if >= 15s.
CREATE TABLE IF NOT EXISTS streams (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id              UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  listener_profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds     INTEGER NOT NULL DEFAULT 0,
  is_qualified         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- 2.7 ROYALTY EVENTS -----
-- Aggregated revenue events (per accounting window, or per sale).
CREATE TABLE IF NOT EXISTS royalty_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id           UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  source_type       royalty_source_type NOT NULL,
  source_reference  TEXT,            -- stream batch id, tx hash, etc.
  gross_amount_eur  NUMERIC(14,4) NOT NULL CHECK (gross_amount_eur >= 0),
  accounting_period TEXT,            -- e.g. '2026-03' for monthly
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- 2.8 ROYALTY SHARES -----
-- Per-party payout line items linked to a royalty_event.
CREATE TABLE IF NOT EXISTS royalty_shares (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  royalty_event_id  UUID NOT NULL REFERENCES royalty_events(id) ON DELETE CASCADE,
  party_email       TEXT,
  linked_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  wallet_address    TEXT,
  share_type        TEXT NOT NULL DEFAULT 'direct',  -- 'direct' or 'nft_holder'
  nft_release_id    UUID REFERENCES nft_releases(id) ON DELETE SET NULL,
  nft_token_id      TEXT,            -- if share_type = 'nft_holder'
  share_percent     NUMERIC(5,2),
  amount_eur        NUMERIC(14,4) NOT NULL CHECK (amount_eur >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- 2.9 MARKETPLACE LISTINGS -----
-- Mirrors on-chain marketplace listings for fast queries.
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_token_id      UUID NOT NULL REFERENCES nft_tokens(id) ON DELETE CASCADE,
  seller_wallet     TEXT NOT NULL,
  price_eth         NUMERIC(18,8) NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  chain_listing_id  TEXT,            -- on-chain listing ID
  listed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  sold_at           TIMESTAMPTZ,
  buyer_wallet      TEXT
);

-- ----- 2.10 LIKES -----
-- Track which users liked which songs (for library/recommendations).
CREATE TABLE IF NOT EXISTS likes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  song_id     UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, song_id)
);

-- ----- 2.11 FOLLOWS -----
-- Users following creators.
CREATE TABLE IF NOT EXISTS follows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- ----- 2.12 PAYOUT REQUESTS -----
-- Creators requesting withdrawal of accumulated royalties.
CREATE TABLE IF NOT EXISTS payout_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_eur      NUMERIC(14,4) NOT NULL CHECK (amount_eur > 0),
  payment_method  TEXT NOT NULL,     -- 'bank_transfer', 'wise', 'crypto_wallet'
  payment_details JSONB,             -- {iban, account_holder, tax_id, ...}
  status          transaction_status NOT NULL DEFAULT 'pending',
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ
);

-- ----- 2.13 ADMIN AUDIT LOG -----
-- Track admin actions for accountability.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,         -- e.g. 'suspend_user', 'remove_song', 'update_config'
  target_type TEXT,                  -- 'profile', 'song', 'nft_release', etc.
  target_id   UUID,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- 2.14 PLATFORM SETTINGS -----
-- Key-value config (stream rate, royalty caps, etc.).
CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- ============================================================
-- 3. TRIGGER FUNCTIONS
-- ============================================================

-- 3.1 Auto-update updated_at on profiles and songs
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_songs_updated_at ON songs;
CREATE TRIGGER trg_songs_updated_at
  BEFORE UPDATE ON songs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3.2 Validate split sheet sums to 100% per song
-- This runs AFTER INSERT/UPDATE/DELETE on song_rights_splits.
-- We use a constraint trigger deferred to end of transaction so bulk inserts work.
CREATE OR REPLACE FUNCTION validate_split_sheet_sum()
RETURNS TRIGGER AS $$
DECLARE
  total NUMERIC;
  target_song_id UUID;
BEGIN
  -- Determine which song to validate
  IF TG_OP = 'DELETE' THEN
    target_song_id := OLD.song_id;
  ELSE
    target_song_id := NEW.song_id;
  END IF;

  SELECT COALESCE(SUM(share_percent), 0) INTO total
  FROM song_rights_splits
  WHERE song_id = target_song_id;

  -- Allow 0 (no splits yet, e.g. during initial setup) but if > 0, must equal 100
  IF total > 0 AND total != 100 THEN
    RAISE EXCEPTION 'Split sheet for song % must sum to exactly 100%%, currently %', target_song_id, total;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_split_sheet ON song_rights_splits;
CREATE CONSTRAINT TRIGGER trg_validate_split_sheet
  AFTER INSERT OR UPDATE OR DELETE ON song_rights_splits
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_split_sheet_sum();

-- 3.3 Validate NFT allocated royalty percent <= 50% per song
CREATE OR REPLACE FUNCTION validate_nft_royalty_cap()
RETURNS TRIGGER AS $$
DECLARE
  total NUMERIC;
  target_song_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_song_id := OLD.song_id;
  ELSE
    target_song_id := NEW.song_id;
  END IF;

  SELECT COALESCE(SUM(allocated_royalty_percent), 0) INTO total
  FROM nft_releases
  WHERE song_id = target_song_id;

  IF total > 50 THEN
    RAISE EXCEPTION 'Total NFT royalty allocation for song % exceeds 50%% cap (currently %)', target_song_id, total;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_nft_royalty_cap ON nft_releases;
CREATE CONSTRAINT TRIGGER trg_validate_nft_royalty_cap
  AFTER INSERT OR UPDATE ON nft_releases
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_nft_royalty_cap();

-- 3.4 Auto-increment plays_count on qualified stream
CREATE OR REPLACE FUNCTION increment_plays_on_stream()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_qualified = TRUE THEN
    UPDATE songs SET plays_count = plays_count + 1 WHERE id = NEW.song_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_plays ON streams;
CREATE TRIGGER trg_increment_plays
  AFTER INSERT ON streams
  FOR EACH ROW EXECUTE FUNCTION increment_plays_on_stream();

-- 3.5 Auto-update likes_count
CREATE OR REPLACE FUNCTION update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE songs SET likes_count = likes_count + 1 WHERE id = NEW.song_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE songs SET likes_count = likes_count - 1 WHERE id = OLD.song_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_likes_count ON likes;
CREATE TRIGGER trg_update_likes_count
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION update_likes_count();

-- 3.6 Auto-increment minted_count on nft_releases when token is minted
CREATE OR REPLACE FUNCTION increment_minted_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE nft_releases SET minted_count = minted_count + 1 WHERE id = NEW.nft_release_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_minted ON nft_tokens;
CREATE TRIGGER trg_increment_minted
  AFTER INSERT ON nft_tokens
  FOR EACH ROW EXECUTE FUNCTION increment_minted_count();

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_rights_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE nft_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE nft_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ----- PROFILES -----
-- Everyone can read creator profiles + their own
CREATE POLICY profiles_select ON profiles FOR SELECT USING (
  id = auth.uid()                             -- own profile
  OR role = 'creator'                         -- all creators are public
  OR is_admin()                               -- admins see all
);
-- Users update only their own profile
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (
  id = auth.uid()
) WITH CHECK (
  id = auth.uid()
);
-- Insert handled by service role (during auth flow)
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (
  id = auth.uid()
);

-- ----- SONGS -----
-- Anyone reads published songs; creator reads own drafts; admin reads all
CREATE POLICY songs_select ON songs FOR SELECT USING (
  is_published = TRUE
  OR creator_id = auth.uid()
  OR is_admin()
);
-- Creator inserts own songs
CREATE POLICY songs_insert ON songs FOR INSERT WITH CHECK (
  creator_id = auth.uid()
);
-- Creator updates own songs; admin updates any
CREATE POLICY songs_update ON songs FOR UPDATE USING (
  creator_id = auth.uid() OR is_admin()
) WITH CHECK (
  creator_id = auth.uid() OR is_admin()
);

-- ----- SONG RIGHTS SPLITS -----
-- Creator of the song + admin can see/manage splits
CREATE POLICY splits_select ON song_rights_splits FOR SELECT USING (
  EXISTS (SELECT 1 FROM songs WHERE songs.id = song_id AND songs.creator_id = auth.uid())
  OR linked_profile_id = auth.uid()
  OR is_admin()
);
CREATE POLICY splits_insert ON song_rights_splits FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM songs WHERE songs.id = song_id AND songs.creator_id = auth.uid())
  OR is_admin()
);
CREATE POLICY splits_update ON song_rights_splits FOR UPDATE USING (
  EXISTS (SELECT 1 FROM songs WHERE songs.id = song_id AND songs.creator_id = auth.uid())
  OR is_admin()
);
CREATE POLICY splits_delete ON song_rights_splits FOR DELETE USING (
  EXISTS (SELECT 1 FROM songs WHERE songs.id = song_id AND songs.creator_id = auth.uid())
  OR is_admin()
);

-- ----- NFT RELEASES -----
-- Public read (marketplace needs this)
CREATE POLICY nft_releases_select ON nft_releases FOR SELECT USING (TRUE);
-- Creator of the song can create releases
CREATE POLICY nft_releases_insert ON nft_releases FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM songs WHERE songs.id = song_id AND songs.creator_id = auth.uid())
  OR is_admin()
);
CREATE POLICY nft_releases_update ON nft_releases FOR UPDATE USING (
  EXISTS (SELECT 1 FROM songs WHERE songs.id = song_id AND songs.creator_id = auth.uid())
  OR is_admin()
);

-- ----- NFT TOKENS -----
-- Public read (marketplace, profiles, ownership verification)
CREATE POLICY nft_tokens_select ON nft_tokens FOR SELECT USING (TRUE);
-- Insert/update by service role or admin (mirrors on-chain state)
CREATE POLICY nft_tokens_insert ON nft_tokens FOR INSERT WITH CHECK (is_admin());
CREATE POLICY nft_tokens_update ON nft_tokens FOR UPDATE USING (is_admin());

-- ----- STREAMS -----
-- Insert: any authenticated user can log a stream
CREATE POLICY streams_insert ON streams FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);
-- Select: creator sees streams for their songs; listener sees own history
CREATE POLICY streams_select ON streams FOR SELECT USING (
  listener_profile_id = auth.uid()
  OR EXISTS (SELECT 1 FROM songs WHERE songs.id = song_id AND songs.creator_id = auth.uid())
  OR is_admin()
);

-- ----- ROYALTY EVENTS -----
CREATE POLICY royalty_events_select ON royalty_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM songs WHERE songs.id = song_id AND songs.creator_id = auth.uid())
  OR is_admin()
);
-- Insert by service role / admin only
CREATE POLICY royalty_events_insert ON royalty_events FOR INSERT WITH CHECK (is_admin());

-- ----- ROYALTY SHARES -----
CREATE POLICY royalty_shares_select ON royalty_shares FOR SELECT USING (
  linked_profile_id = auth.uid()
  OR is_admin()
  OR EXISTS (
    SELECT 1 FROM royalty_events re
    JOIN songs s ON s.id = re.song_id
    WHERE re.id = royalty_event_id AND s.creator_id = auth.uid()
  )
);
CREATE POLICY royalty_shares_insert ON royalty_shares FOR INSERT WITH CHECK (is_admin());

-- ----- MARKETPLACE LISTINGS -----
CREATE POLICY listings_select ON marketplace_listings FOR SELECT USING (TRUE);
CREATE POLICY listings_insert ON marketplace_listings FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);
CREATE POLICY listings_update ON marketplace_listings FOR UPDATE USING (
  seller_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  OR is_admin()
);

-- ----- LIKES -----
CREATE POLICY likes_select ON likes FOR SELECT USING (
  profile_id = auth.uid() OR is_admin()
);
CREATE POLICY likes_insert ON likes FOR INSERT WITH CHECK (
  profile_id = auth.uid()
);
CREATE POLICY likes_delete ON likes FOR DELETE USING (
  profile_id = auth.uid()
);

-- ----- FOLLOWS -----
CREATE POLICY follows_select ON follows FOR SELECT USING (TRUE);
CREATE POLICY follows_insert ON follows FOR INSERT WITH CHECK (
  follower_id = auth.uid()
);
CREATE POLICY follows_delete ON follows FOR DELETE USING (
  follower_id = auth.uid()
);

-- ----- PAYOUT REQUESTS -----
CREATE POLICY payouts_select ON payout_requests FOR SELECT USING (
  profile_id = auth.uid() OR is_admin()
);
CREATE POLICY payouts_insert ON payout_requests FOR INSERT WITH CHECK (
  profile_id = auth.uid()
);
CREATE POLICY payouts_update ON payout_requests FOR UPDATE USING (is_admin());

-- ----- ADMIN AUDIT LOG -----
CREATE POLICY audit_select ON admin_audit_log FOR SELECT USING (is_admin());
CREATE POLICY audit_insert ON admin_audit_log FOR INSERT WITH CHECK (is_admin());

-- ----- PLATFORM SETTINGS -----
CREATE POLICY settings_select ON platform_settings FOR SELECT USING (TRUE);
CREATE POLICY settings_update ON platform_settings FOR UPDATE USING (is_admin());
CREATE POLICY settings_insert ON platform_settings FOR INSERT WITH CHECK (is_admin());

-- ============================================================
-- 5. INDEXES
-- ============================================================
-- Performance-critical lookups
CREATE INDEX IF NOT EXISTS idx_profiles_wallet ON profiles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_songs_creator ON songs(creator_id);
CREATE INDEX IF NOT EXISTS idx_songs_published ON songs(is_published) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);
CREATE INDEX IF NOT EXISTS idx_songs_plays ON songs(plays_count DESC);
CREATE INDEX IF NOT EXISTS idx_splits_song ON song_rights_splits(song_id);
CREATE INDEX IF NOT EXISTS idx_splits_linked_profile ON song_rights_splits(linked_profile_id);
CREATE INDEX IF NOT EXISTS idx_nft_releases_song ON nft_releases(song_id);
CREATE INDEX IF NOT EXISTS idx_nft_tokens_release ON nft_tokens(nft_release_id);
CREATE INDEX IF NOT EXISTS idx_nft_tokens_owner ON nft_tokens(owner_wallet_address);
CREATE INDEX IF NOT EXISTS idx_streams_song ON streams(song_id);
CREATE INDEX IF NOT EXISTS idx_streams_listener ON streams(listener_profile_id);
CREATE INDEX IF NOT EXISTS idx_streams_qualified ON streams(song_id, is_qualified) WHERE is_qualified = TRUE;
CREATE INDEX IF NOT EXISTS idx_royalty_events_song ON royalty_events(song_id);
CREATE INDEX IF NOT EXISTS idx_royalty_shares_event ON royalty_shares(royalty_event_id);
CREATE INDEX IF NOT EXISTS idx_royalty_shares_profile ON royalty_shares(linked_profile_id);
CREATE INDEX IF NOT EXISTS idx_listings_active ON marketplace_listings(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_likes_profile ON likes(profile_id);
CREATE INDEX IF NOT EXISTS idx_likes_song ON likes(song_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- ============================================================
-- 6. SEED PLATFORM SETTINGS
-- ============================================================
INSERT INTO platform_settings (key, value) VALUES
  ('stream_rate_eur', '"0.003"'),
  ('nft_royalty_cap_percent', '"50"'),
  ('secondary_sale_royalty_percent', '"5"'),
  ('min_stream_seconds', '"15"'),
  ('platform_fee_percent', '"5"')
ON CONFLICT (key) DO NOTHING;
