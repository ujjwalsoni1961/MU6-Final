-- ============================================================
-- MU6 — Migration 023: NFT Listing Limits & Tier Restrictions
-- ============================================================
-- PDF Fix #9:
--   1. Initial Cap: newly registered artists limited to 5 NFT listings overall.
--      (i.e. max 5 rows in nft_releases owned by that artist, across all songs,
--       counting only is_active=true releases).
--   2. Tier Restrictions: initial artists may only create 'common' rarity NFTs.
--      Admin must grant access to higher tiers ('rare', 'legendary').
--   3. Request System: artists can submit "Request Higher Limit" requests
--      for increased cap or additional tier access.
--   4. Admin Control: admins can edit per-artist limits and tier eligibility.
--
-- Design:
--   * Per-artist overrides live on the profiles table (simple, indexed).
--   * A separate nft_limit_requests table tracks petitions.
--   * An INSERT trigger on nft_releases enforces both limits server-side so
--     the frontend cannot bypass them.
-- ============================================================

BEGIN;

-- 1. Add per-artist override columns on profiles.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nft_listing_limit INTEGER NOT NULL DEFAULT 5
    CHECK (nft_listing_limit >= 0);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allowed_nft_rarities nft_rarity[] NOT NULL
    DEFAULT ARRAY['common']::nft_rarity[];

-- 2. Table for "Request Higher Limit" petitions.
CREATE TABLE IF NOT EXISTS nft_limit_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_listing_limit  INTEGER,                 -- NULL = no change requested
  requested_rarities    nft_rarity[],               -- NULL = no change requested
  reason                TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes           TEXT,
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at          TIMESTAMPTZ,
  processed_by          UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_nft_limit_requests_profile
  ON nft_limit_requests(profile_id);
CREATE INDEX IF NOT EXISTS idx_nft_limit_requests_status
  ON nft_limit_requests(status);

-- Only one pending limit-increase request per artist at a time (same pattern as payouts).
CREATE UNIQUE INDEX IF NOT EXISTS nft_limit_requests_one_pending_per_profile
  ON nft_limit_requests (profile_id) WHERE status = 'pending';

-- 3. RLS for nft_limit_requests.
ALTER TABLE nft_limit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nft_limit_requests_select ON nft_limit_requests;
-- Thirdweb auth does not set a matching Supabase auth.uid(), so we relax the
-- SELECT policy and rely on the app to scope queries by profile_id.
-- (Consistent with the existing payouts RLS pattern introduced in 006_relax_payout_rls.sql.)
CREATE POLICY nft_limit_requests_select ON nft_limit_requests
  FOR SELECT USING (true);

DROP POLICY IF EXISTS nft_limit_requests_insert ON nft_limit_requests;
CREATE POLICY nft_limit_requests_insert ON nft_limit_requests
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS nft_limit_requests_update ON nft_limit_requests;
CREATE POLICY nft_limit_requests_update ON nft_limit_requests
  FOR UPDATE USING (is_admin());

-- 4. Trigger: enforce listing limit + tier restriction on new NFT releases.
CREATE OR REPLACE FUNCTION enforce_nft_listing_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
DECLARE
  v_creator_id UUID;
  v_current_count INTEGER;
  v_limit INTEGER;
  v_allowed_rarities nft_rarity[];
BEGIN
  -- Resolve creator of this song.
  SELECT creator_id INTO v_creator_id
  FROM songs WHERE id = NEW.song_id;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine song creator for NFT release';
  END IF;

  -- Fetch per-artist limit + allowed rarities.
  SELECT nft_listing_limit, allowed_nft_rarities
    INTO v_limit, v_allowed_rarities
  FROM profiles WHERE id = v_creator_id;

  -- Check rarity eligibility.
  IF NOT (NEW.rarity = ANY(v_allowed_rarities)) THEN
    RAISE EXCEPTION
      'NFT rarity % is not permitted for this artist. Allowed rarities: %. Contact admin to unlock higher tiers.',
      NEW.rarity, v_allowed_rarities
      USING ERRCODE = 'check_violation';
  END IF;

  -- Count existing ACTIVE releases for this artist across all their songs.
  SELECT COUNT(*) INTO v_current_count
  FROM nft_releases nr
  JOIN songs s ON s.id = nr.song_id
  WHERE s.creator_id = v_creator_id
    AND nr.is_active = TRUE;

  IF v_current_count >= v_limit THEN
    RAISE EXCEPTION
      'NFT listing limit reached (% of %). Submit a "Request Higher Limit" petition to your admin to increase this cap.',
      v_current_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_enforce_nft_listing_limits ON nft_releases;
CREATE TRIGGER trg_enforce_nft_listing_limits
  BEFORE INSERT ON nft_releases
  FOR EACH ROW EXECUTE FUNCTION enforce_nft_listing_limits();

COMMIT;
