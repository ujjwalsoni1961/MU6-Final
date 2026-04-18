-- ============================================================================
-- 037 · nft_token_owners + nft_sync_state — ownership ledger & sync bookmarks
-- ----------------------------------------------------------------------------
-- Context
--   nft_token_owners mirrors on-chain ERC-1155 balances as derived from
--   TransferSingle / TransferBatch events.  It is an eventually-consistent
--   view: the syncTransfers edge action keeps it current by reading events
--   from last_synced_block onwards.
--
--   nft_sync_state stores a per-(contract × sync_type) high-water mark so
--   each invocation of a sync/enrichment action knows exactly where to resume
--   without gaps or double-processing.
-- ============================================================================

BEGIN;

-- ── nft_token_owners ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nft_token_owners (
    chain_id         INTEGER     NOT NULL,
    contract_address TEXT        NOT NULL,
    token_id         NUMERIC     NOT NULL,
    owner            TEXT        NOT NULL,

    balance          NUMERIC     NOT NULL DEFAULT 0   CHECK (balance >= 0),
    last_block       BIGINT      NOT NULL DEFAULT 0,  -- last block where this row was updated
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (chain_id, contract_address, token_id, owner)
);

COMMENT ON TABLE  public.nft_token_owners IS
    'Derived on-chain ERC-1155 balance table.  Kept in sync by the '
    'syncTransfers edge action via TransferSingle/TransferBatch events.  '
    'balance = 0 rows are kept (soft tombstones) so the enricher can detect '
    'a previous owner who transferred out.';

COMMENT ON COLUMN public.nft_token_owners.balance IS
    'Current on-chain ERC-1155 balance of `owner` for (contract, token_id).  '
    'Zero = formerly owned, transferred out.  Never negative (CHECK).';

-- Queries for "who owns token X" (most common read)
CREATE INDEX IF NOT EXISTS nft_token_owners_contract_token
    ON public.nft_token_owners (contract_address, token_id);

-- Queries for "all tokens owned by address Y"
CREATE INDEX IF NOT EXISTS nft_token_owners_owner
    ON public.nft_token_owners (owner);

-- Updated-at for stale-data detection
CREATE INDEX IF NOT EXISTS nft_token_owners_updated_at
    ON public.nft_token_owners (updated_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.nft_token_owners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nft_token_owners_public_read" ON public.nft_token_owners;
CREATE POLICY "nft_token_owners_public_read"
    ON public.nft_token_owners FOR SELECT
    USING (true);

-- ── nft_sync_state ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nft_sync_state (
    chain_id           INTEGER     NOT NULL,
    contract_address   TEXT        NOT NULL,
    sync_type          TEXT        NOT NULL
                       CHECK (sync_type IN ('transfers', 'marketplace_events', 'opensea')),

    last_synced_block  BIGINT      NOT NULL DEFAULT 0,
    last_synced_at     TIMESTAMPTZ,
    error_count        INTEGER     NOT NULL DEFAULT 0,
    last_error         TEXT,                          -- most recent error message, if any

    PRIMARY KEY (chain_id, contract_address, sync_type)
);

COMMENT ON TABLE  public.nft_sync_state IS
    'Per-(contract × sync_type) high-water mark for the sync / enrichment '
    'edge actions.  Each action reads last_synced_block on start and commits '
    'it only after a successful batch so restarts are always safe.';

COMMENT ON COLUMN public.nft_sync_state.sync_type IS
    'transfers          — TransferSingle/TransferBatch events (syncTransfers)'
    ' | marketplace_events — MarketplaceV3 NewSale events (enrichMu6MarketplaceSales)'
    ' | opensea             — OpenSea sale API (enrichOpenseaSales)';

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.nft_sync_state ENABLE ROW LEVEL SECURITY;

-- Sync state is internal — only service-role can write; admins can read.
DROP POLICY IF EXISTS "nft_sync_state_public_read" ON public.nft_sync_state;
CREATE POLICY "nft_sync_state_public_read"
    ON public.nft_sync_state FOR SELECT
    USING (true);

-- ── Materialized view: mv_nft_collection_stats ───────────────────────────────
-- Provides pre-aggregated per-collection analytics refreshed by the
-- refreshCollectionStats edge action (CONCURRENTLY every 15 min via pg_cron).

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_nft_collection_stats AS
SELECT
    contract_address,
    chain_id,
    COALESCE(SUM(price_wei), 0)                                              AS total_volume_wei,
    COUNT(*)                                                                  AS total_sales,
    COALESCE(SUM(price_wei) FILTER (WHERE marketplace = 'mu6_primary'),   0) AS mu6_primary_volume,
    COALESCE(SUM(price_wei) FILTER (WHERE marketplace = 'mu6_secondary'), 0) AS mu6_secondary_volume,
    COALESCE(SUM(price_wei) FILTER (WHERE marketplace = 'opensea'),       0) AS opensea_volume,
    COUNT(DISTINCT buyer)                                                     AS unique_buyers,
    COUNT(DISTINCT seller)                                                    AS unique_sellers,
    MAX(block_timestamp)                                                      AS last_sale_at
FROM  public.nft_sales_history
WHERE price_wei IS NOT NULL
  AND price_wei > 0
GROUP BY contract_address, chain_id
WITH DATA;

COMMENT ON MATERIALIZED VIEW public.mv_nft_collection_stats IS
    'Pre-aggregated per-collection NFT sales analytics.  Refreshed '
    'CONCURRENTLY every 15 minutes by the refreshCollectionStats edge action.';

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS mv_nft_collection_stats_pk
    ON public.mv_nft_collection_stats (contract_address, chain_id);

COMMIT;
