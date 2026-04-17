-- ============================================================================
-- Migration 026 — NFT Integrity & Admin↔Mobile Sync
-- ============================================================================
--
-- Addresses PDF bugs 11–17:
--   • Bug 11: Soft-delete songs (admin delete must hide from mobile instantly)
--   • Bug 14: NFT primary-sale atomicity — new `mint_intents` table tracks
--     every purchase attempt (pending → minting → confirmed / failed) so a
--     reconciler can retry or refund stuck mints.
--   • Bug 17: Store real on-chain token ID on `nft_tokens` (distinct from the
--     DB-ordered `token_id` fallback). This is the authoritative reference
--     for on-chain reads (ownerOf, tokenURI, marketplace listings).
--   • Bug 13: `is_blocked` already exists (migration 010) — add an index for
--     fast auth-time lookup.
--
-- All additions are BACKWARDS COMPATIBLE — existing queries continue to work.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. SOFT-DELETE SONGS  (Bug 11)
-- ───────────────────────────────────────────────────────────────────────────
-- Adds a `deleted_at` timestamp. Mobile queries will filter
-- `deleted_at IS NULL` so admin deletions propagate instantly without
-- cascading writes across related tables (NFTs, plays, royalties, etc.).
ALTER TABLE public.songs
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_songs_deleted_at
    ON public.songs (deleted_at)
    WHERE deleted_at IS NULL;  -- partial index — only live songs are queried

COMMENT ON COLUMN public.songs.deleted_at IS
    'Soft-delete marker. When set, song is hidden from mobile queries. NULL = live.';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. MINT INTENTS  (Bug 14 — primary-sale atomicity)
-- ───────────────────────────────────────────────────────────────────────────
-- Every purchase attempt creates a row in `mint_intents` BEFORE payment.
--
-- Lifecycle:
--   pending   → created at checkout, payment not yet sent
--   paid      → buyer's payment tx confirmed on-chain
--   minting   → serverClaim dispatched, awaiting on-chain mint tx
--   confirmed → on-chain mint receipt received, nft_tokens row created
--   failed    → payment OR mint failed; reconciler should refund / retry
--
-- A reconciliation cron (outside this migration) scans rows stuck in
-- `paid` or `minting` > 10 minutes and retries or refunds.
CREATE TABLE IF NOT EXISTS public.mint_intents (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nft_release_id     UUID NOT NULL REFERENCES public.nft_releases(id) ON DELETE CASCADE,
    buyer_profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    buyer_wallet       TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','paid','minting','confirmed','failed','refunded')),
    price_wei          TEXT NOT NULL,
    price_pol          NUMERIC(20, 8),
    payment_tx_hash    TEXT,
    mint_tx_hash       TEXT,
    on_chain_token_id  TEXT,                    -- real token ID from Transfer log
    nft_token_id       UUID REFERENCES public.nft_tokens(id) ON DELETE SET NULL,
    error_message      TEXT,
    retry_count        INT NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at       TIMESTAMPTZ,
    failed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mint_intents_status_created
    ON public.mint_intents (status, created_at);
CREATE INDEX IF NOT EXISTS idx_mint_intents_buyer_wallet
    ON public.mint_intents (LOWER(buyer_wallet));
CREATE INDEX IF NOT EXISTS idx_mint_intents_release
    ON public.mint_intents (nft_release_id);
CREATE INDEX IF NOT EXISTS idx_mint_intents_payment_tx
    ON public.mint_intents (payment_tx_hash) WHERE payment_tx_hash IS NOT NULL;

-- Keep `updated_at` fresh
CREATE OR REPLACE FUNCTION public.touch_mint_intents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mint_intents_touch ON public.mint_intents;
CREATE TRIGGER trg_mint_intents_touch
    BEFORE UPDATE ON public.mint_intents
    FOR EACH ROW EXECUTE FUNCTION public.touch_mint_intents_updated_at();

-- RLS: buyers can read their own intents; admin edge functions use service role
ALTER TABLE public.mint_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mint_intents_buyer_read" ON public.mint_intents;
CREATE POLICY "mint_intents_buyer_read"
    ON public.mint_intents
    FOR SELECT
    TO authenticated
    USING (buyer_profile_id = auth.uid());

-- Service role / edge functions bypass RLS — no insert/update policies needed

COMMENT ON TABLE public.mint_intents IS
    'Tracks primary-sale mint attempts end-to-end for atomicity & reconciliation.';


-- ───────────────────────────────────────────────────────────────────────────
-- 3. REAL ON-CHAIN TOKEN ID  (Bug 17)
-- ───────────────────────────────────────────────────────────────────────────
-- `nft_tokens.token_id` has historically been a DB-ordered string
-- (release.minted_count at insert time). This is a race condition and may
-- drift from on-chain reality. We add `on_chain_token_id` — the actual
-- uint256 parsed from the on-chain Transfer event.
--
-- The DB `token_id` column stays for backwards compatibility; new code
-- should read `on_chain_token_id` when present.
ALTER TABLE public.nft_tokens
    ADD COLUMN IF NOT EXISTS on_chain_token_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_nft_tokens_on_chain_id
    ON public.nft_tokens (on_chain_token_id)
    WHERE on_chain_token_id IS NOT NULL;

COMMENT ON COLUMN public.nft_tokens.on_chain_token_id IS
    'Authoritative uint256 token ID from the on-chain Transfer event. Preferred over DB token_id.';


-- ───────────────────────────────────────────────────────────────────────────
-- 4. BLOCK-USER FAST LOOKUP  (Bug 13)
-- ───────────────────────────────────────────────────────────────────────────
-- `is_blocked` exists (migration 010). Add an index so auth-time checks
-- (every login / session resume) are O(1).
CREATE INDEX IF NOT EXISTS idx_profiles_is_blocked
    ON public.profiles (id)
    WHERE is_blocked = TRUE;


COMMIT;
