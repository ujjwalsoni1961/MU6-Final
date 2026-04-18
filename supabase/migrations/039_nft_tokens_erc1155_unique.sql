-- 039_nft_tokens_erc1155_unique.sql
--
-- Relax the nft_tokens uniqueness constraint to support ERC-1155 where a single
-- token_id is fungible across many owners.
--
-- Why:
--   nft_tokens was originally designed for ERC-721 where (release_id, token_id)
--   is globally unique — each tokenId has exactly one owner. For ERC-1155,
--   multiple buyers can each own copies of the same tokenId within the same
--   release. Each purchase must produce a distinct ledger row so we can track
--   per-holder purchase price, mint tx, and timestamps.
--
-- Approach:
--   Drop the 2-column UNIQUE(nft_release_id, token_id).
--   Add 3-column UNIQUE(nft_release_id, token_id, owner_wallet_address).
--
--   This preserves ERC-721 semantics: an ERC-721 tokenId only has one owner at
--   a time, so adding owner to the key does not weaken uniqueness for those
--   rows. It allows ERC-1155 rows where the same (release, tokenId) pair
--   appears once per distinct holder.
--
-- Idempotent: safe to re-run.

BEGIN;

-- Drop old constraint if present
ALTER TABLE nft_tokens
    DROP CONSTRAINT IF EXISTS nft_tokens_nft_release_id_token_id_key;

-- Add 3-column unique constraint
-- Use DO block to make idempotent (CREATE CONSTRAINT IF NOT EXISTS isn't supported)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'nft_tokens_release_token_owner_key'
          AND conrelid = 'nft_tokens'::regclass
    ) THEN
        ALTER TABLE nft_tokens
            ADD CONSTRAINT nft_tokens_release_token_owner_key
            UNIQUE (nft_release_id, token_id, owner_wallet_address);
    END IF;
END $$;

-- Helpful index for collection queries by owner (already exists in some envs, IF NOT EXISTS guards)
CREATE INDEX IF NOT EXISTS idx_nft_tokens_owner_wallet
    ON nft_tokens (owner_wallet_address)
    WHERE is_voided = false;

-- Index for release-scoped lookups (used by ERC-1155 collection enumeration)
CREATE INDEX IF NOT EXISTS idx_nft_tokens_release_owner
    ON nft_tokens (nft_release_id, owner_wallet_address)
    WHERE is_voided = false;

COMMIT;
