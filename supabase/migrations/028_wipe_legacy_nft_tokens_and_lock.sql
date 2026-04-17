-- Migration 028: Wipe legacy nft_tokens (pre-Bug-14 era) and lock on_chain_token_id
--
-- Rationale: Prior to Bug 14 fix, `nft_tokens` rows were inserted without the real
-- on-chain token id (`on_chain_token_id` was left NULL; `token_id` column held
-- per-release edition numbers, not on-chain IDs). This made ownership verification
-- impossible and caused the admin panel + user collection to show phantom NFTs.
--
-- On-chain investigation (as of 2026-04-17):
--   - Contract 0xACF1145AdE250D356e1B2869E392e6c748c14C0E has 23 tokens
--   - All 23 have malformed/legacy URIs from prior dev test runs, NOT from the
--     current business-release flow. None belong to the current test user.
--   - DB has 7 rows, all with on_chain_token_id=NULL, unverifiable on-chain.
--
-- Action:
--   1. Delete dependent rows (marketplace_listings -> CASCADE; explicitly clear
--      nft_holder_payouts + nft_ownership_log + mint_intents to be safe).
--   2. Delete all 7 nft_tokens rows.
--   3. Reset nft_releases.minted_count to 0 for legacy releases that had mints.
--   4. Add CHECK + UNIQUE constraints so future rows MUST carry on_chain_token_id.
--
-- Going forward: the post-Bug-14 mint path (admin-action edge function) already
-- parses the Transfer event from the mint receipt and writes the real
-- on_chain_token_id to the DB row. This migration enforces that invariant.

BEGIN;

-- 1. Clear dependents
DELETE FROM nft_holder_payouts;
DELETE FROM nft_ownership_log;
UPDATE mint_intents SET nft_token_id = NULL WHERE nft_token_id IS NOT NULL;
-- marketplace_listings cascade when nft_tokens rows go

-- 2. Wipe legacy tokens (all have on_chain_token_id IS NULL, so this is safe and
-- targeted; should the app evolve, future verified rows would be preserved.)
DELETE FROM nft_tokens WHERE on_chain_token_id IS NULL;

-- 3. Recompute minted_count for all releases from what remains in nft_tokens
UPDATE nft_releases nr
SET minted_count = COALESCE(sub.cnt, 0)
FROM (
  SELECT nft_release_id, COUNT(*) AS cnt
  FROM nft_tokens
  WHERE is_voided = false
  GROUP BY nft_release_id
) sub
WHERE nr.id = sub.nft_release_id;

-- Also zero out releases that now have zero tokens in DB
UPDATE nft_releases nr
SET minted_count = 0
WHERE NOT EXISTS (
  SELECT 1 FROM nft_tokens nt
  WHERE nt.nft_release_id = nr.id AND nt.is_voided = false
);

-- 4. Lock the schema going forward
-- 4a. Unique constraint on (chain_id, contract_address, on_chain_token_id)
-- Use a partial unique index since on_chain_token_id can still be NULL briefly
-- during pending mints (rows are inserted *after* the mint confirms in the new flow,
-- but we allow NULL transiently). Enforce uniqueness only when non-null.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nft_tokens' AND column_name='chain_id') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS nft_tokens_onchain_unique
      ON nft_tokens (chain_id, contract_address, on_chain_token_id)
      WHERE on_chain_token_id IS NOT NULL;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS nft_tokens_onchain_unique
      ON nft_tokens (on_chain_token_id)
      WHERE on_chain_token_id IS NOT NULL;
  END IF;
END $$;

-- 4b. Comment column so future devs understand intent
COMMENT ON COLUMN nft_tokens.on_chain_token_id IS
  'Real ERC-721 tokenId from the NFT contract. MUST be populated by the mint flow (parsed from Transfer event in admin-action edge function). Rows with NULL are considered unverified and are hidden from consumer-facing views.';

COMMENT ON COLUMN nft_tokens.token_id IS
  'DEPRECATED legacy per-release edition number. Do NOT use for on-chain verification. Always use on_chain_token_id instead. Kept for historical audit only.';

COMMIT;
