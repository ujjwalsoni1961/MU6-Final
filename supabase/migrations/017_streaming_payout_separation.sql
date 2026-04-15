-- ============================================================
-- MU6 – Migration 017: Streaming Payout Separation
-- ============================================================
-- Phase 5: Ensure artist balance calculations only include
-- streaming revenue (source_type = 'stream'), not NFT sales.
-- NFT sale revenue is now distributed on-chain via Split contracts
-- and MarketplaceV3, not tracked in royalty_events/royalty_shares.
-- ============================================================

-- 1. UPDATE get_artist_balance: Only count streaming royalties
CREATE OR REPLACE FUNCTION get_artist_balance(p_profile_id UUID)
RETURNS TABLE(total_earned NUMERIC, total_paid_out NUMERIC, available_balance NUMERIC)
LANGUAGE SQL STABLE
AS $$
  SELECT
    COALESCE(earned.total, 0) AS total_earned,
    COALESCE(paid.total, 0) AS total_paid_out,
    COALESCE(earned.total, 0) - COALESCE(paid.total, 0) AS available_balance
  FROM
    (SELECT SUM(rs.amount_eur) AS total
     FROM royalty_shares rs
     JOIN royalty_events re ON rs.royalty_event_id = re.id
     WHERE rs.linked_profile_id = p_profile_id
       AND re.source_type = 'stream') earned,
    (SELECT SUM(pr.amount_eur) AS total
     FROM payout_requests pr
     WHERE pr.profile_id = p_profile_id
       AND pr.status IN ('completed', 'pending')) paid
$$;

-- 2. UPDATE v_artist_available_balance: Only include streaming revenue
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
JOIN royalty_events re ON rs.royalty_event_id = re.id
WHERE rs.linked_profile_id IS NOT NULL
  AND re.source_type = 'stream'
GROUP BY rs.linked_profile_id;
