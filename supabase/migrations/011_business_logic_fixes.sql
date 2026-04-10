-- ============================================================
-- MU6 – Phase 2: Business Logic Fixes
-- ============================================================
-- 1. Add tx_hash columns to royalty_events, payout_requests, nft_tokens
-- 2. Create artist available balance view + function
-- 3. Add stream deduplication index
-- ============================================================

-- 1. TX HASH COLUMNS
ALTER TABLE royalty_events ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS mint_tx_hash TEXT;
ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS price_paid_eth NUMERIC(18,8);

-- 2. STREAM DEDUP INDEX
CREATE INDEX IF NOT EXISTS idx_streams_dedup
  ON streams(song_id, listener_profile_id, started_at DESC);

-- 3. ARTIST AVAILABLE BALANCE VIEW
CREATE OR REPLACE VIEW v_artist_available_balance AS
SELECT
  rs.linked_profile_id AS profile_id,
  SUM(rs.amount_eur) AS total_earned,
  COALESCE(
    (SELECT SUM(pr.amount_eur)
     FROM payout_requests pr
     WHERE pr.profile_id = rs.linked_profile_id
       AND pr.status = 'completed'),
    0
  ) AS total_paid_out,
  SUM(rs.amount_eur) - COALESCE(
    (SELECT SUM(pr.amount_eur)
     FROM payout_requests pr
     WHERE pr.profile_id = rs.linked_profile_id
       AND pr.status = 'completed'),
    0
  ) AS available_balance
FROM royalty_shares rs
WHERE rs.linked_profile_id IS NOT NULL
GROUP BY rs.linked_profile_id;

-- 4. ARTIST BALANCE FUNCTION (callable via supabase.rpc)
CREATE OR REPLACE FUNCTION get_artist_balance(p_profile_id UUID)
RETURNS TABLE(total_earned NUMERIC, total_paid_out NUMERIC, available_balance NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(SUM(rs.amount_eur), 0) AS total_earned,
    COALESCE(
      (SELECT SUM(pr.amount_eur)
       FROM payout_requests pr
       WHERE pr.profile_id = p_profile_id
         AND pr.status = 'completed'),
      0
    ) AS total_paid_out,
    COALESCE(SUM(rs.amount_eur), 0) - COALESCE(
      (SELECT SUM(pr.amount_eur)
       FROM payout_requests pr
       WHERE pr.profile_id = p_profile_id
         AND pr.status = 'completed'),
      0
    ) AS available_balance
  FROM royalty_shares rs
  WHERE rs.linked_profile_id = p_profile_id;
$$;
