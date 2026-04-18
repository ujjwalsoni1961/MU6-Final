-- Migration 041: Make nft_tokens ERC-1155-friendly (ledger semantics).
--
-- CONTEXT
--   Under ERC-721 each token was globally unique and had a single owner, so
--   older migrations added UNIQUE constraints that treated (release, token_id)
--   and on_chain_token_id as one-to-one with a holder row.
--
--   Under ERC-1155 the DropERC1155 contract has a fixed tokenId per release
--   (lazy-minted once), and the supply is accumulated via repeated claim()
--   calls — one call per copy. `nft_tokens` is now a LEDGER: one row per
--   holder per claim. Multiple holders share the same (release_id, token_id),
--   and the same holder may even own multiple copies (multiple ledger rows).
--
--   The leftover ERC-721-era indexes cause silent INSERT failures in the
--   serverClaim self-healing path, producing the symptom: on-chain claim
--   succeeds, wallet holds the NFT, but DB has no nft_tokens row and the
--   app's "X of Y minted" counter doesn't advance.
--
-- WHAT THIS MIGRATION DOES
--   1. Drop UNIQUE (nft_release_id, token_id).
--   2. Drop UNIQUE (on_chain_token_id) partial index.
--   3. Drop UNIQUE (nft_release_id, token_id, owner_wallet_address) —
--      a holder can own multiple copies across separate claim txs; each
--      claim is its own ledger entry.
--   4. Replace with a UNIQUE (mint_tx_hash) partial index: every claim tx
--      writes AT MOST ONE ledger row, so the mint tx hash is the correct
--      idempotency key. This is what makes the self-healing insert safe
--      to retry — duplicate inserts for the same claim tx are rejected
--      instead of creating phantom rows.
--
-- SAFETY
--   Idempotent: each DROP is guarded; the CREATE is IF NOT EXISTS.

BEGIN;

-- 1. Drop (release_id, token_id) unique index
DROP INDEX IF EXISTS public.idx_nft_tokens_release_token_unique;

-- 2. Drop on_chain_token_id unique partial index
DROP INDEX IF EXISTS public.nft_tokens_onchain_unique;

-- 3. Drop (release_id, token_id, owner_wallet_address) unique constraint
ALTER TABLE public.nft_tokens
    DROP CONSTRAINT IF EXISTS nft_tokens_release_token_owner_key;

-- 4. Add mint_tx_hash idempotency index.
--    One claim tx = one ledger row. Null allowed for legacy/manual rows.
CREATE UNIQUE INDEX IF NOT EXISTS nft_tokens_mint_tx_hash_unique
    ON public.nft_tokens (mint_tx_hash)
    WHERE mint_tx_hash IS NOT NULL;

COMMIT;
