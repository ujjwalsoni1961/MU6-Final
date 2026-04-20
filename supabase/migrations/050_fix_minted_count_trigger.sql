-- 050_fix_minted_count_trigger.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug: nft_releases.minted_count drifts above the actual on-chain totalSupply.
--
-- Root cause: the `trg_increment_minted` trigger runs on EVERY INSERT into
-- nft_tokens. The original design (migration 001) assumed one nft_tokens row
-- == one mint. That held for ERC-721 single-edition, but post-ERC-1155 the
-- `nft_tokens` table also stores:
--   • resale ownership transfers (when a buyer purchases a secondary listing)
--   • self-heal rows inserted by the listing flow when a wallet holds a copy
--     on-chain but no ledger row yet exists
-- Every one of those insertions wrongly bumped `minted_count`, producing
-- impossible values like "7 of 5 minted".
--
-- Fix: gate the increment on `mint_tx_hash IS NOT NULL`. By convention
-- (enforced since migration 041 with a UNIQUE partial index on mint_tx_hash),
-- only genuine primary-claim inserts carry the mint tx hash. Resale /
-- self-heal rows leave it NULL and therefore no longer bump the counter.
--
-- Data repair: reconcile minted_count for every release from the distinct
-- mint_tx_hash set in nft_tokens. This is a lower bound — if historic rows
-- exist without a tx hash we fall back to COUNT(*) to preserve admin views
-- that relied on legacy values.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Replace the trigger function with a tx-hash-gated version.
CREATE OR REPLACE FUNCTION increment_minted_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Only count genuine primary-claim mints. Resale transfers and self-heal
  -- ownership rows intentionally leave `mint_tx_hash` NULL and must NOT
  -- inflate the per-release minted_count.
  IF NEW.mint_tx_hash IS NOT NULL THEN
    UPDATE nft_releases
       SET minted_count = minted_count + 1
     WHERE id = NEW.nft_release_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Repair drifted counts. Prefer DISTINCT mint_tx_hash when available;
--    fall back to COUNT(*) for legacy releases whose rows predate migration
--    011 (when mint_tx_hash was added) so we don't zero-out historical data.
UPDATE nft_releases r
SET minted_count = sub.computed
FROM (
  SELECT
    nr.id,
    GREATEST(
      -- distinct claim transactions for this release
      (SELECT COUNT(DISTINCT nt.mint_tx_hash)
         FROM nft_tokens nt
        WHERE nt.nft_release_id = nr.id
          AND nt.mint_tx_hash IS NOT NULL
          AND COALESCE(nt.is_voided, false) = false),
      -- legacy rows without a tx hash — count non-voided rows as a floor
      (SELECT COUNT(*)
         FROM nft_tokens nt
        WHERE nt.nft_release_id = nr.id
          AND nt.mint_tx_hash IS NULL
          AND COALESCE(nt.is_voided, false) = false
          AND nt.minted_at IS NOT NULL)
    ) AS computed
  FROM nft_releases nr
) sub
WHERE r.id = sub.id
  AND r.minted_count IS DISTINCT FROM sub.computed;

-- 3. Safety net: clamp to total_supply. The on-chain ERC-1155 enforces the
--    hard cap, so any DB value above it is by definition stale.
UPDATE nft_releases
   SET minted_count = total_supply
 WHERE total_supply IS NOT NULL
   AND minted_count > total_supply;

COMMIT;
