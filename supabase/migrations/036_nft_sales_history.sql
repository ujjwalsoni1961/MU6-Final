-- ============================================================================
-- 036 · nft_sales_history — unified on-chain sale event ledger
-- ----------------------------------------------------------------------------
-- Context
--   Every NFT transfer, primary sale (MU6 marketplace), secondary sale
--   (MU6 MarketplaceV3 or OpenSea), and plain ERC-1155 transfer is recorded
--   here.  Initial inserts from syncTransfers use marketplace='transfer';
--   enrichMu6MarketplaceSales and enrichOpenseaSales upgrade the row in-place
--   once they match the tx_hash to a marketplace event.
--
-- Fee model (Option A — confirmed):
--   Primary  : 2% thirdweb + 5% MU6 + 93% artist
--   Secondary: 5% artist royalty (EIP-2981) + 2% MU6 platform fee + 93% seller
--   OpenSea  : 5% artist royalty only
--
-- is_primary=true  → recorded by the serverClaim/forwardPrimarySalePayout flow
-- is_primary=false → discovered by the transfer / marketplace enrichment pipeline
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.nft_sales_history (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- On-chain coordinates
    chain_id         INTEGER     NOT NULL,
    contract_address TEXT        NOT NULL,
    token_id         NUMERIC     NOT NULL,          -- ERC-1155 token id; for ERC-721 same as minted id

    -- Parties
    seller           TEXT,                           -- NULL for mint-only transfers (from = 0x0)
    buyer            TEXT,                           -- NULL when not yet resolved by enricher

    -- Value
    price_wei        NUMERIC(78, 0),                 -- 0 for plain transfers; set by enrichers
    currency_address TEXT,                           -- native: 0xEeee…EE; ERC-20 address otherwise

    -- Classification (upgradeable by enrichers)
    marketplace      TEXT        NOT NULL DEFAULT 'transfer'
                     CHECK (marketplace IN ('mu6_primary','mu6_secondary','opensea','transfer')),

    -- On-chain provenance
    tx_hash          TEXT        UNIQUE NOT NULL,
    log_index        INTEGER,                        -- log position within the tx
    block_number     BIGINT      NOT NULL,
    block_timestamp  TIMESTAMPTZ,

    -- ERC-1155 quantity (always 1 for ERC-721)
    amount           NUMERIC     NOT NULL DEFAULT 1,

    -- Convenience flag set when synced from primary_sale_payouts
    is_primary       BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Housekeeping
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nft_sales_history IS
    'Unified on-chain sale/transfer event ledger.  Populated by syncTransfers '
    '(initial pass, marketplace=''transfer'') and upgraded by enrichment edge '
    'actions (mu6_secondary, opensea, mu6_primary).';

COMMENT ON COLUMN public.nft_sales_history.marketplace IS
    'transfer     — plain ERC-1155/721 transfer, not yet enriched'
    ' | mu6_primary   — primary sale via MU6 claim flow'
    ' | mu6_secondary — secondary sale via MU6 MarketplaceV3'
    ' | opensea       — secondary sale via OpenSea';

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Range scans for sync / enrichment (contract + token, most-recent first)
CREATE INDEX IF NOT EXISTS nft_sales_history_contract_token_block
    ON public.nft_sales_history (contract_address, token_id, block_number DESC);

-- Buyer history / portfolio
CREATE INDEX IF NOT EXISTS nft_sales_history_buyer
    ON public.nft_sales_history (buyer)
    WHERE buyer IS NOT NULL;

-- Seller history
CREATE INDEX IF NOT EXISTS nft_sales_history_seller
    ON public.nft_sales_history (seller)
    WHERE seller IS NOT NULL;

-- Marketplace analytics
CREATE INDEX IF NOT EXISTS nft_sales_history_marketplace
    ON public.nft_sales_history (marketplace, block_number DESC);

-- chain_id scans
CREATE INDEX IF NOT EXISTS nft_sales_history_chain_id
    ON public.nft_sales_history (chain_id, block_number DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Public read (sale history is public on-chain data).
-- All writes go through the service-role edge function.

ALTER TABLE public.nft_sales_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nft_sales_history_public_read" ON public.nft_sales_history;
CREATE POLICY "nft_sales_history_public_read"
    ON public.nft_sales_history FOR SELECT
    USING (true);

COMMIT;
