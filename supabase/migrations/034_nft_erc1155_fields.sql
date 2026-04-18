-- ============================================================================
-- 034 · nft_releases — ERC-1155 per-song fields
-- ----------------------------------------------------------------------------
-- Context
--   The MU6 platform is migrating from a shared DropERC721 (one NFT per
--   release, auto-incrementing token IDs) to a shared DropERC1155 contract
--   (0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad on Polygon Amoy) where each
--   song gets a dedicated token_id.  This migration adds the fields needed to
--   support both standards on the same table, and backfills legacy rows with
--   their correct values.
--
-- New fields
--   token_id               — on-chain token ID for ERC-1155 releases; NULL
--                            until lazy-minted.  For ERC-721 releases this is
--                            NULL (each token has its own on-chain ID, tracked
--                            in nft_tokens.on_chain_token_id instead).
--   nft_standard           — 'erc721' | 'erc1155'.  Defaults to 'erc1155' for
--                            all newly created releases.  Legacy rows are
--                            backfilled to 'erc721'.
--   max_supply             — maps to DropERC1155 setClaimConditions
--                            maxClaimableSupply.  NUMERIC to handle very large
--                            values (thirdweb uses uint256 internally).
--   price_wei              — on-chain source of truth for the price paid per
--                            token, stored in wei.  NUMERIC(78,0) mirrors the
--                            existing primary_sale_payouts.gross_wei column
--                            precision (fits uint256).
--   currency_address       — EVM address of the claim currency.  The default
--                            is the canonical NATIVE_TOKEN sentinel used by
--                            thirdweb (ETH/POL native value).
--   thirdweb_fee_bps       — thirdweb protocol fee bps for this release.
--                            DropERC1155 contracts deployed from March 2025
--                            onwards use 200 bps (2%).  The old DropERC721
--                            contract was deployed before March 2025 and uses
--                            50 bps.  Backfilled accordingly.
--
-- Backfill rules
--   * All existing rows                → nft_standard = 'erc721'
--   * contract_address IS NULL         → set to legacy DropERC721 address
--   * thirdweb_fee_bps NOT YET SET     → 50 bps (pre-March 2025 deployment)
--
-- Unique constraint
--   (contract_address, chain_id, token_id) where token_id IS NOT NULL and
--   contract_address IS NOT NULL.  Prevents two releases from claiming the
--   same on-chain slot on the same contract+chain.
-- ============================================================================

BEGIN;

-- 1. token_id — nullable BIGINT (ERC-1155 token ID, NULL for ERC-721 releases)
ALTER TABLE public.nft_releases
    ADD COLUMN IF NOT EXISTS token_id BIGINT;

COMMENT ON COLUMN public.nft_releases.token_id IS
    'On-chain ERC-1155 token ID for this release. NULL until lazy-minted, and '
    'NULL for ERC-721 releases (where each minted token has its own ID tracked '
    'in nft_tokens.on_chain_token_id). For ERC-1155, multiple holders own '
    'different balances of this single token_id.';

-- 2. nft_standard — 'erc721' | 'erc1155', default 'erc1155' for new rows
ALTER TABLE public.nft_releases
    ADD COLUMN IF NOT EXISTS nft_standard TEXT NOT NULL DEFAULT 'erc1155'
    CHECK (nft_standard IN ('erc721', 'erc1155'));

COMMENT ON COLUMN public.nft_releases.nft_standard IS
    'Token standard used by this release. ''erc1155'' for the shared '
    'DropERC1155 contract (new default); ''erc721'' for the legacy DropERC721 '
    'contract. Controls which on-chain ABI is used by the edge function claim '
    'and setClaimCondition actions.';

-- 3. max_supply — maps to claim condition maxClaimableSupply
ALTER TABLE public.nft_releases
    ADD COLUMN IF NOT EXISTS max_supply NUMERIC;

COMMENT ON COLUMN public.nft_releases.max_supply IS
    'Maximum number of tokens claimable under the active claim condition '
    '(DropERC1155 setClaimConditions.maxClaimableSupply). NULL = unlimited. '
    'Stored as NUMERIC to accommodate the full uint256 range used on-chain.';

-- 4. price_wei — on-chain price in native token wei (uint256-safe precision)
ALTER TABLE public.nft_releases
    ADD COLUMN IF NOT EXISTS price_wei NUMERIC(78, 0);

COMMENT ON COLUMN public.nft_releases.price_wei IS
    'On-chain claim price per token in wei. This is the authoritative source '
    'of truth for pricing — the edge function reads the active claim condition '
    'from the chain and uses this field to compare / validate client-supplied '
    'prices. NUMERIC(78,0) matches the uint256 range. Mirrors price_eth but '
    'without floating-point loss.';

-- 5. currency_address — ERC-20 address or native-token sentinel
ALTER TABLE public.nft_releases
    ADD COLUMN IF NOT EXISTS currency_address TEXT
    DEFAULT '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

COMMENT ON COLUMN public.nft_releases.currency_address IS
    'EVM address of the ERC-20 token used for payment, or the thirdweb '
    'native-token sentinel 0xEeee...EEeE for native POL/ETH claims. '
    'Must match the currency field in the on-chain claim condition.';

-- 6. thirdweb_fee_bps — per-release thirdweb protocol fee in basis points
ALTER TABLE public.nft_releases
    ADD COLUMN IF NOT EXISTS thirdweb_fee_bps INTEGER NOT NULL DEFAULT 200;

COMMENT ON COLUMN public.nft_releases.thirdweb_fee_bps IS
    'Thirdweb hardcoded protocol fee for this release, in basis points. '
    'DropERC1155 contracts deployed from March 2025 use 200 bps (2%). '
    'The legacy DropERC721 was deployed before that cut-off and uses 50 bps. '
    'This value is used by splitPrimarySale() in the edge function to compute '
    'the correct three-way split: gross → thirdweb_fee + mu6_platform + artist.';

-- ── Backfill ──────────────────────────────────────────────────────────────────

-- All existing rows were created on the ERC-721 drop contract.
UPDATE public.nft_releases
   SET nft_standard = 'erc721'
 WHERE nft_standard = 'erc1155';  -- only rows that just got the DEFAULT applied

-- Set legacy contract address where it is missing.
-- The DropERC721 on Polygon Amoy (chain 80002) is the only contract that
-- existed before this migration.
UPDATE public.nft_releases
   SET contract_address = '0xACF1145AdE250D356e1B2869E392e6c748c14C0E'
 WHERE contract_address IS NULL;

-- Legacy DropERC721 was deployed pre-March 2025 → 50 bps thirdweb fee.
-- All pre-existing rows now have nft_standard='erc721'; set their fee.
UPDATE public.nft_releases
   SET thirdweb_fee_bps = 50
 WHERE nft_standard = 'erc721';

COMMIT;

-- ── Unique index ──────────────────────────────────────────────────────────────
-- Created outside the transaction block so Postgres can build the index after
-- the trigger-event queue is flushed (avoids "pending trigger events" error
-- when modifying rows with triggers inside the same transaction).

-- Prevent two releases claiming the same on-chain slot on the same contract.
-- Partial: only enforced when both contract_address and token_id are known.
CREATE UNIQUE INDEX IF NOT EXISTS nft_releases_contract_chain_token_uniq
    ON public.nft_releases (contract_address, chain_id, token_id)
    WHERE token_id IS NOT NULL AND contract_address IS NOT NULL;

COMMENT ON INDEX public.nft_releases_contract_chain_token_uniq IS
    'Prevents two nft_releases rows from mapping to the same on-chain token. '
    'Partial: only active when both contract_address and token_id are non-NULL, '
    'so unset/lazy-pending rows do not conflict with each other.';
