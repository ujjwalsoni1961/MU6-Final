-- Migration 042: Record the original on-chain minter per nft_tokens row.
--
-- Problem this fixes:
--   nft_tokens.owner_wallet_address mutates on every resale, so once an NFT
--   changes hands the "mints" tab on the original minter's wallet goes empty
--   and the buyer's "mints" tab incorrectly shows tokens they purchased rather
--   than minted.
--
-- Fix:
--   Add a STABLE column `minter_wallet_address` that is written once at mint
--   time and never mutated afterwards. Source of truth = the `to` address of
--   the `TransferSingle` event where `from = 0x0` in the mint tx receipt.
--
-- Backfill strategy:
--   Before this migration runs we know every token either (a) was never resold
--   (last_sale_tx_hash IS NULL) in which case the current owner IS the minter,
--   or (b) was resold via MarketplaceV3 from a known seller wallet.
--
--   For case (a) we can fill minter_wallet_address = owner_wallet_address
--   safely (owner hasn't changed since mint).
--
--   For case (b) the authoritative source is the marketplace_listings row —
--   the SELLER of the listing is the previous owner (and for tokens only ever
--   sold once, the seller is the minter). We resolve that here.
--
--   Edge case: if a token has been resold more than once, we need the chain
--   of seller addresses; the earliest seller (by listed_at) is the minter.
--
--   Rows we cannot confidently infer are left NULL; getUserActivity() has a
--   fallback path that handles that (requires last_sale_tx_hash IS NULL).
--
-- Idempotency: guarded by IF NOT EXISTS / safe updates only.

BEGIN;

-- 1. Column
ALTER TABLE nft_tokens
    ADD COLUMN IF NOT EXISTS minter_wallet_address TEXT;

-- 2. Case (a): token never resold → minter is current owner.
UPDATE nft_tokens
SET minter_wallet_address = LOWER(owner_wallet_address)
WHERE minter_wallet_address IS NULL
  AND last_sale_tx_hash IS NULL
  AND owner_wallet_address IS NOT NULL;

-- 3. Case (b): token has been resold. The ORIGINAL minter is the seller in the
--    earliest marketplace_listings row for that token.
--    (If a token has been resold N times there will be N listings; the first
--    seller in chronological order is the minter.)
WITH first_seller AS (
    SELECT DISTINCT ON (ml.nft_token_id)
        ml.nft_token_id,
        LOWER(ml.seller_wallet) AS minter
    FROM marketplace_listings ml
    WHERE ml.seller_wallet IS NOT NULL
    ORDER BY ml.nft_token_id, ml.listed_at ASC
)
UPDATE nft_tokens nt
SET minter_wallet_address = fs.minter
FROM first_seller fs
WHERE nt.id = fs.nft_token_id
  AND nt.minter_wallet_address IS NULL;

-- 4. Normalise all minter_wallet_address values to lowercase for consistent
--    indexed lookups (EVM addresses are case-insensitive but text equality isn't).
UPDATE nft_tokens
SET minter_wallet_address = LOWER(minter_wallet_address)
WHERE minter_wallet_address IS NOT NULL
  AND minter_wallet_address <> LOWER(minter_wallet_address);

-- 5. Index for fast "mints by this wallet" queries.
CREATE INDEX IF NOT EXISTS idx_nft_tokens_minter_wallet_address
    ON nft_tokens (minter_wallet_address)
    WHERE minter_wallet_address IS NOT NULL;

COMMIT;
