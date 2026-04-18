-- Migration 030: Ghost-token ignore list + one-off listing reconcile
--
-- Context:
--   The DropERC721 at 0xACF1145A... has 25 on-chain tokens (ids 0..24). Tokens
--   0..22 are legacy from pre-prod dev runs (wrong URIs, no matching DB rows,
--   batch-minted to 0xDdF40a97... test wallet). Tokens 23 and 24 are the real
--   Bairan tokens minted after the Bug-14 atomicity rewrite.
--
--   The on-chain-first collection view (commit 2460969) correctly enumerates
--   every token the wallet owns on-chain. Without a server-side ignore list
--   it also surfaces tokens 0..22 as placeholder "Unknown (off-chain metadata
--   missing)" cards, which is noise.
--
--   Also: a resale buy of token #23 confirmed on-chain yesterday, but the
--   marketplace_listings row stayed is_active=true because that buy ran on an
--   older client before the post-buy guard landed. The new owner now sees
--   their own token showing a "Cancel Listing" button that fails against the
--   marketplace contract ("invalid listing"). We reconcile that row here.
--
-- What this migration does:
--   1. Creates nft_ghost_tokens — an allow-list of on-chain token ids that
--      the consumer + admin UI must hide. Hidden from enumeration, hidden
--      from listing flows, hidden from admin aggregates.
--   2. Seeds it with tokens 0..22 on the live drop contract.
--   3. Marks the stale marketplace_listings row for token #23 as sold +
--      stamps the current on-chain owner as buyer_wallet, so the collection
--      page stops showing the bogus "Manage Listing" CTA.
--
-- This is idempotent: re-running is safe (INSERT ... ON CONFLICT DO NOTHING,
-- UPDATE filtered by the exact stale state).

BEGIN;

-- ============================================================================
-- 1. Ghost tokens ignore-list
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nft_ghost_tokens (
    on_chain_token_id TEXT PRIMARY KEY,
    contract_address  TEXT NOT NULL,
    chain_id          INTEGER NOT NULL DEFAULT 80002,
    reason            TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by        TEXT
);

COMMENT ON TABLE public.nft_ghost_tokens IS
    'Allow-list of on-chain token ids that the UI must hide. Populated for '
    'pre-production batch mints and any other on-chain junk that predates the '
    'atomic mint flow (Bug 14). Enumeration hooks and admin views filter '
    'against this table.';

CREATE INDEX IF NOT EXISTS idx_nft_ghost_tokens_contract_chain
    ON public.nft_ghost_tokens (contract_address, chain_id);

-- RLS: readable by everyone (it is public knowledge), writable only by service
-- role. The admin UI writes via the admin-action edge function.
ALTER TABLE public.nft_ghost_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nft_ghost_tokens_read ON public.nft_ghost_tokens;
CREATE POLICY nft_ghost_tokens_read
    ON public.nft_ghost_tokens
    FOR SELECT
    USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated or anon roles. Service
-- role bypasses RLS and is the only writer.

-- ============================================================================
-- 2. Seed the ghost list with tokens 0..22
-- ============================================================================

INSERT INTO public.nft_ghost_tokens
    (on_chain_token_id, contract_address, chain_id, reason, created_by)
SELECT
    gs::TEXT,
    LOWER('0xACF1145AdE250D356e1B2869E392e6c748c14C0E'),
    80002,
    CASE
        WHEN gs BETWEEN 0  AND 13 THEN 'Pre-prod batch mint (IPFS QmWYNy... folder, no real metadata)'
        WHEN gs BETWEEN 14 AND 22 THEN 'Legacy Bairan v1 test mints (malformed URI suffix - pre-Bug-14)'
    END,
    'migration_030'
FROM generate_series(0, 22) AS gs
ON CONFLICT (on_chain_token_id) DO NOTHING;

-- ============================================================================
-- 3. Reconcile the stale marketplace_listings row for token #23
-- ============================================================================
--
-- We target by chain_listing_id=10 AND nft_token_id joining to an nft_tokens
-- row whose on_chain_token_id='23' AND whose current owner != the seller
-- (meaning the token has clearly moved away from the seller on-chain).

UPDATE public.marketplace_listings AS ml
SET
    is_active    = false,
    sold_at      = COALESCE(ml.sold_at, NOW()),
    buyer_wallet = COALESCE(ml.buyer_wallet, nt.owner_wallet_address)
FROM public.nft_tokens AS nt
WHERE ml.nft_token_id = nt.id
  AND nt.on_chain_token_id = '23'
  AND ml.is_active = true
  AND LOWER(nt.owner_wallet_address) <> LOWER(ml.seller_wallet);

COMMIT;
