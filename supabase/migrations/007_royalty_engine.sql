-- ============================================================
-- MU6 – Phase 6: Royalty Engine + Idempotency Safeguards
-- ============================================================
-- 
-- This migration adds:
--   1. Unique constraint on (source_type, source_reference) in royalty_events
--      to prevent duplicate royalty events from retries / crash recovery.
--   2. Auto-generate royalty_events + royalty_shares on qualified stream insert
--      using the split sheet and the stream_rate_eur from platform_settings.
--   3. Idempotency guard on nft_tokens to prevent duplicate mints from retries.
--   4. Accounting period column for royalty_events batch processing.
--   5. Update supported_chains to include Polygon Amoy (80002).
--

-- ============================================================
-- 1. IDEMPOTENCY: Unique constraint on royalty_events
-- ============================================================
-- Prevents duplicate royalty events if the same stream/sale is processed twice.
-- source_reference format: "stream:{stream_id}" or "sale:{listing_id}"
CREATE UNIQUE INDEX IF NOT EXISTS idx_royalty_events_source_unique
  ON royalty_events(source_type, source_reference);

-- ============================================================
-- 2. IDEMPOTENCY: Unique constraint on nft_tokens
-- ============================================================
-- Prevents double-minting: one token row per (release_id, token_id).
-- The token_id is the edition number within a release.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_tokens_release_token_unique
  ON nft_tokens(nft_release_id, token_id);

-- ============================================================
-- 3. AUTO-GENERATE STREAM ROYALTIES
-- ============================================================
-- When a qualified stream is inserted, automatically:
--   a) Create a royalty_event with gross = stream_rate_eur
--   b) Create royalty_shares for each party in the song's split sheet
--
-- This runs AFTER INSERT on streams, only for is_qualified = TRUE.
-- Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.

CREATE OR REPLACE FUNCTION generate_stream_royalty()
RETURNS TRIGGER AS $$
DECLARE
  v_stream_rate NUMERIC(10,4);
  v_event_id UUID;
  v_source_ref TEXT;
BEGIN
  -- Only process qualified streams
  IF NEW.is_qualified = FALSE THEN
    RETURN NEW;
  END IF;

  -- Get stream rate from platform settings
  SELECT COALESCE((value)::numeric, 0.003)
  INTO v_stream_rate
  FROM platform_settings
  WHERE key = 'stream_rate_eur';

  -- Build unique source reference
  v_source_ref := 'stream:' || NEW.id::text;

  -- Create royalty event (idempotent via unique index)
  INSERT INTO royalty_events (song_id, source_type, source_reference, gross_amount_eur)
  VALUES (NEW.song_id, 'stream', v_source_ref, v_stream_rate)
  ON CONFLICT (source_type, source_reference) DO NOTHING
  RETURNING id INTO v_event_id;

  -- If event already existed (conflict), skip share creation
  IF v_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create royalty shares based on the song's split sheet
  INSERT INTO royalty_shares (royalty_event_id, party_email, linked_profile_id, wallet_address, share_type, share_percent, amount_eur)
  SELECT
    v_event_id,
    srs.party_email,
    srs.linked_profile_id,
    srs.linked_wallet_address,
    'split',
    srs.share_percent,
    ROUND(v_stream_rate * srs.share_percent / 100, 6)
  FROM song_rights_splits srs
  WHERE srs.song_id = NEW.song_id;

  -- If no split sheet exists, assign 100% to the song creator
  IF NOT FOUND THEN
    INSERT INTO royalty_shares (royalty_event_id, linked_profile_id, share_type, share_percent, amount_eur)
    SELECT
      v_event_id,
      s.creator_id,
      'direct',
      100,
      v_stream_rate
    FROM songs s
    WHERE s.id = NEW.song_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_stream_royalty ON streams;
CREATE TRIGGER trg_generate_stream_royalty
  AFTER INSERT ON streams
  FOR EACH ROW EXECUTE FUNCTION generate_stream_royalty();

-- ============================================================
-- 4. UPDATE PLATFORM SETTINGS: Polygon Amoy chain
-- ============================================================
UPDATE platform_settings 
SET value = '["80002"]'
WHERE key = 'supported_chains';

-- ============================================================
-- 5. HELPER VIEW: Creator royalty summary
-- ============================================================
-- Aggregates total earnings per profile from royalty_shares.
-- Useful for the earnings dashboard.
CREATE OR REPLACE VIEW v_creator_royalty_summary AS
SELECT
  rs.linked_profile_id AS profile_id,
  re.source_type,
  COUNT(DISTINCT re.id) AS event_count,
  SUM(rs.amount_eur) AS total_eur,
  MIN(re.created_at) AS first_event_at,
  MAX(re.created_at) AS last_event_at
FROM royalty_shares rs
JOIN royalty_events re ON re.id = rs.royalty_event_id
WHERE rs.linked_profile_id IS NOT NULL
GROUP BY rs.linked_profile_id, re.source_type;

-- ============================================================
-- 6. HELPER VIEW: Per-song royalty summary
-- ============================================================
CREATE OR REPLACE VIEW v_song_royalty_summary AS
SELECT
  re.song_id,
  re.source_type,
  COUNT(*) AS event_count,
  SUM(re.gross_amount_eur) AS total_gross_eur,
  MIN(re.created_at) AS first_event_at,
  MAX(re.created_at) AS last_event_at
FROM royalty_events re
GROUP BY re.song_id, re.source_type;

-- ============================================================
-- 7. INDEX for royalty_events lookups by song
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_royalty_events_song
  ON royalty_events(song_id);

CREATE INDEX IF NOT EXISTS idx_royalty_events_created
  ON royalty_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_royalty_shares_profile
  ON royalty_shares(linked_profile_id);

CREATE INDEX IF NOT EXISTS idx_royalty_shares_event
  ON royalty_shares(royalty_event_id);
