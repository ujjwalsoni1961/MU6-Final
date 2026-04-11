-- ============================================================
-- MU6 – Migration 012: HIGH Severity Business Logic Fixes
-- ============================================================
-- 1. Atomic NFT supply check function (prevents overselling race condition)
-- 2. Fix get_artist_balance to deduct pending payouts (prevents over-withdrawal)
-- 3. Fix v_artist_available_balance view to include pending payouts
-- ============================================================

-- 1. ATOMIC NFT SUPPLY CHECK
-- Returns whether a release can still be minted (minted_count < total_supply).
-- Uses SELECT ... FOR UPDATE to lock the row, preventing concurrent reads
-- from both passing the check before either increments.
CREATE OR REPLACE FUNCTION check_nft_supply(p_release_id UUID)
RETURNS TABLE(can_mint BOOLEAN, current_count INTEGER, max_supply INTEGER)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    (nr.minted_count < nr.total_supply) AS can_mint,
    nr.minted_count AS current_count,
    nr.total_supply AS max_supply
  FROM nft_releases nr
  WHERE nr.id = p_release_id
  FOR UPDATE;  -- Row-level lock prevents concurrent race conditions
END;
$$;

-- 2. FIX ARTIST BALANCE: Include pending payouts in deduction
-- Previously only deducted 'completed' payouts; now also deducts 'pending'
-- so artists cannot submit multiple overlapping withdrawal requests.
CREATE OR REPLACE FUNCTION get_artist_balance(p_profile_id UUID)
RETURNS TABLE(total_earned NUMERIC, total_paid_out NUMERIC, available_balance NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(SUM(rs.amount_eur), 0) AS total_earned,
    COALESCE(
      (SELECT SUM(pr.amount_eur)
       FROM payout_requests pr
       WHERE pr.profile_id = p_profile_id
         AND pr.status IN ('completed', 'pending')),
      0
    ) AS total_paid_out,
    COALESCE(SUM(rs.amount_eur), 0) - COALESCE(
      (SELECT SUM(pr.amount_eur)
       FROM payout_requests pr
       WHERE pr.profile_id = p_profile_id
         AND pr.status IN ('completed', 'pending')),
      0
    ) AS available_balance
  FROM royalty_shares rs
  WHERE rs.linked_profile_id = p_profile_id;
$$;

-- 3. FIX ARTIST BALANCE VIEW: Include pending payouts
CREATE OR REPLACE VIEW v_artist_available_balance AS
SELECT
  rs.linked_profile_id AS profile_id,
  SUM(rs.amount_eur) AS total_earned,
  COALESCE(
    (SELECT SUM(pr.amount_eur)
     FROM payout_requests pr
     WHERE pr.profile_id = rs.linked_profile_id
       AND pr.status IN ('completed', 'pending')),
    0
  ) AS total_paid_out,
  SUM(rs.amount_eur) - COALESCE(
    (SELECT SUM(pr.amount_eur)
     FROM payout_requests pr
     WHERE pr.profile_id = rs.linked_profile_id
       AND pr.status IN ('completed', 'pending')),
    0
  ) AS available_balance
FROM royalty_shares rs
WHERE rs.linked_profile_id IS NOT NULL
GROUP BY rs.linked_profile_id;
