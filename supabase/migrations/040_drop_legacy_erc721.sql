-- Migration 040: Retire the legacy DropERC721 contract entirely.
--
-- CONTEXT
--   The MU6 platform has fully migrated to DropERC1155
--   (0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad on Amoy).
--   The legacy DropERC721 (0xACF1145AdE250D356e1B2869E392e6c748c14C0E) was only
--   ever used for internal test mints. No real users, no mainnet exposure.
--   We are removing it entirely — DB rows, cron jobs, and (in a companion code
--   change) all client/edge branches that routed by nft_standard.
--
-- WHAT THIS MIGRATION DOES
--   1. Unschedule the ERC-721 transfer sync cron job.
--   2. Delete all DB state tied to the legacy contract:
--        - marketplace_listings that reference tokens on the legacy contract
--        - nft_tokens from legacy-contract releases
--        - nft_releases on the legacy contract
--        - nft_token_owners + nft_sales_history rows on the legacy contract
--        - nft_sync_state rows for the legacy contract
--   3. Drop the `nft_standard` column on nft_releases — with only one standard
--      left (ERC-1155), every query that branches on it becomes dead logic.
--   4. Update the default contract_address on nft_releases to the DropERC1155.
--
-- SAFETY
--   This is destructive and testnet-only. Do NOT replay on an environment that
--   holds real user data on the legacy contract.
--   Idempotent: wrapped in guards so re-running is a no-op.

BEGIN;

-- ── 1. Unschedule legacy cron job ────────────────────────────────────────────
DO $$
BEGIN
    -- cron.unschedule errors if the job doesn't exist; guard it.
    IF EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'mu6_sync_transfers_erc721'
    ) THEN
        PERFORM cron.unschedule('mu6_sync_transfers_erc721');
    END IF;
END $$;

-- ── 2. Delete all DB rows for the legacy contract ────────────────────────────
-- Order matters: children before parents to respect FKs.
--
-- Dependency map:
--   nft_tokens is referenced by: marketplace_listings, mint_intents,
--                                 nft_holder_payouts, nft_ownership_log
--   nft_releases is referenced by: mint_intents, nft_tokens,
--                                   primary_sale_payouts, royalty_shares

-- 2a. marketplace_listings → nft_tokens (via nft_token_id) → nft_releases
DELETE FROM public.marketplace_listings ml
 USING public.nft_tokens t, public.nft_releases r
 WHERE ml.nft_token_id = t.id
   AND t.nft_release_id = r.id
   AND LOWER(r.contract_address) = LOWER('0xACF1145AdE250D356e1B2869E392e6c748c14C0E');

-- 2a.i. mint_intents referencing legacy nft_tokens
DO $$
BEGIN
    IF to_regclass('public.mint_intents') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.mint_intents mi
                  USING public.nft_tokens t, public.nft_releases r
                  WHERE mi.nft_token_id = t.id
                    AND t.nft_release_id = r.id
                    AND LOWER(r.contract_address) = LOWER(''0xACF1145AdE250D356e1B2869E392e6c748c14C0E'')';
    END IF;
END $$;

-- 2a.ii. nft_holder_payouts referencing legacy nft_tokens
DO $$
BEGIN
    IF to_regclass('public.nft_holder_payouts') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.nft_holder_payouts p
                  USING public.nft_tokens t, public.nft_releases r
                  WHERE p.nft_token_id = t.id
                    AND t.nft_release_id = r.id
                    AND LOWER(r.contract_address) = LOWER(''0xACF1145AdE250D356e1B2869E392e6c748c14C0E'')';
    END IF;
END $$;

-- 2a.iii. nft_ownership_log referencing legacy nft_tokens
DO $$
BEGIN
    IF to_regclass('public.nft_ownership_log') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.nft_ownership_log l
                  USING public.nft_tokens t, public.nft_releases r
                  WHERE l.nft_token_id = t.id
                    AND t.nft_release_id = r.id
                    AND LOWER(r.contract_address) = LOWER(''0xACF1145AdE250D356e1B2869E392e6c748c14C0E'')';
    END IF;
END $$;

-- 2b. nft_tokens from legacy releases
DELETE FROM public.nft_tokens t
 USING public.nft_releases r
 WHERE t.nft_release_id = r.id
   AND LOWER(r.contract_address) = LOWER('0xACF1145AdE250D356e1B2869E392e6c748c14C0E');

-- 2c. nft_token_owners on the legacy contract (table may or may not exist
--     depending on whether migration 037 ran in this environment)
DO $$
BEGIN
    IF to_regclass('public.nft_token_owners') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.nft_token_owners
                  WHERE LOWER(contract_address) = LOWER(''0xACF1145AdE250D356e1B2869E392e6c748c14C0E'')';
    END IF;
END $$;

-- 2d. nft_sales_history entries that reference the legacy contract
DO $$
BEGIN
    IF to_regclass('public.nft_sales_history') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.nft_sales_history
                  WHERE LOWER(contract_address) = LOWER(''0xACF1145AdE250D356e1B2869E392e6c748c14C0E'')';
    END IF;
END $$;

-- 2e. nft_sync_state
DO $$
BEGIN
    IF to_regclass('public.nft_sync_state') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.nft_sync_state
                  WHERE LOWER(contract_address) = LOWER(''0xACF1145AdE250D356e1B2869E392e6c748c14C0E'')';
    END IF;
END $$;

-- 2f. mint_intents referencing legacy releases (not already deleted via nft_token_id)
DO $$
BEGIN
    IF to_regclass('public.mint_intents') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.mint_intents mi
                  USING public.nft_releases r
                  WHERE mi.nft_release_id = r.id
                    AND LOWER(r.contract_address) = LOWER(''0xACF1145AdE250D356e1B2869E392e6c748c14C0E'')';
    END IF;
END $$;

-- 2g. primary_sale_payouts referencing legacy releases
DO $$
BEGIN
    IF to_regclass('public.primary_sale_payouts') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.primary_sale_payouts p
                  USING public.nft_releases r
                  WHERE p.release_id = r.id
                    AND LOWER(r.contract_address) = LOWER(''0xACF1145AdE250D356e1B2869E392e6c748c14C0E'')';
    END IF;
END $$;

-- 2h. royalty_shares referencing legacy releases
DO $$
BEGIN
    IF to_regclass('public.royalty_shares') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.royalty_shares rs
                  USING public.nft_releases r
                  WHERE rs.nft_release_id = r.id
                    AND LOWER(r.contract_address) = LOWER(''0xACF1145AdE250D356e1B2869E392e6c748c14C0E'')';
    END IF;
END $$;

-- 2i. nft_releases on the legacy contract
DELETE FROM public.nft_releases
 WHERE LOWER(contract_address) = LOWER('0xACF1145AdE250D356e1B2869E392e6c748c14C0E');

-- ── 3. Drop nft_standard column ──────────────────────────────────────────────
-- Only one standard remains — every branch on this column is dead.
-- Drop the associated index first if it exists.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'nft_releases'
          AND column_name  = 'nft_standard'
    ) THEN
        ALTER TABLE public.nft_releases DROP COLUMN nft_standard;
    END IF;
END $$;

-- ── 4. Flip default contract_address to DropERC1155 ──────────────────────────
-- Any new row inserted without an explicit contract_address now lands on the
-- correct contract. (The app always passes contract_address explicitly, but a
-- sensible DEFAULT protects against future drift.)
ALTER TABLE public.nft_releases
    ALTER COLUMN contract_address
    SET DEFAULT '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad';

-- ── 5. Sanity check: zero legacy rows remain ─────────────────────────────────
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
      FROM public.nft_releases
     WHERE LOWER(contract_address) = LOWER('0xACF1145AdE250D356e1B2869E392e6c748c14C0E');
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Migration 040: % legacy nft_releases rows still present', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.nft_tokens t
      JOIN public.nft_releases r ON r.id = t.nft_release_id
     WHERE LOWER(r.contract_address) = LOWER('0xACF1145AdE250D356e1B2869E392e6c748c14C0E');
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Migration 040: % legacy nft_tokens rows still present', v_count;
    END IF;
END $$;

COMMIT;
