-- 046_primary_sale_payouts_thirdweb_fee.sql
--
-- Fix: the primary_sale_payouts_splits_sum CHECK constraint insisted that
--   artist_wei + platform_wei = gross_wei
-- but in reality the split is a THREE-way cut:
--   gross = thirdweb_protocol_fee + platform (MU6) + artist
-- The protocol fee is collected by the NFT drop contract itself during
-- `claim(...)`, so the server-side forwarder only sees (gross - thirdweb_fee)
-- in its balance and never forwards the protocol fee. That difference caused
-- every payout insert to fail with:
--   "new row for relation \"primary_sale_payouts\" violates check constraint
--    \"primary_sale_payouts_splits_sum\""
--
-- Fix:
--   1. Add a `thirdweb_fee_wei` column (nullable for backfill safety, default 0).
--   2. Add `thirdweb_fee_bps` column for audit clarity.
--   3. Replace the 2-way sum constraint with a 3-way sum constraint:
--        artist_wei + platform_wei + thirdweb_fee_wei = gross_wei
--      Accepts existing rows where thirdweb_fee_wei=0 and the old invariant
--      held. New rows written by serverClaim will include the protocol fee.
--
-- Safe to run multiple times (IF NOT EXISTS / DROP IF EXISTS guards).

BEGIN;

-- 1. Add the protocol-fee columns
ALTER TABLE public.primary_sale_payouts
    ADD COLUMN IF NOT EXISTS thirdweb_fee_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS thirdweb_fee_bps INTEGER NOT NULL DEFAULT 0;

-- 2. Drop the stale 2-way sum constraint
ALTER TABLE public.primary_sale_payouts
    DROP CONSTRAINT IF EXISTS primary_sale_payouts_splits_sum;

-- 3. Add 3-way sum constraint. Any row with thirdweb_fee_wei=0 (pre-fix rows
--    backfilled with the default) continues to satisfy the old invariant;
--    rows written after this migration populate the full split.
ALTER TABLE public.primary_sale_payouts
    ADD CONSTRAINT primary_sale_payouts_splits_sum
    CHECK (artist_wei + platform_wei + thirdweb_fee_wei = gross_wei);

-- 4. Extend the non-negative constraint to the new column
ALTER TABLE public.primary_sale_payouts
    DROP CONSTRAINT IF EXISTS primary_sale_payouts_splits_nonneg;
ALTER TABLE public.primary_sale_payouts
    ADD CONSTRAINT primary_sale_payouts_splits_nonneg
    CHECK (
        gross_wei >= 0
        AND artist_wei >= 0
        AND platform_wei >= 0
        AND thirdweb_fee_wei >= 0
    );

COMMENT ON COLUMN public.primary_sale_payouts.thirdweb_fee_wei IS
    'Protocol fee retained by the DropERC1155 contract during claim(). Never leaves the drop contract; recorded for audit.';
COMMENT ON COLUMN public.primary_sale_payouts.thirdweb_fee_bps IS
    'Snapshot of thirdweb_fee_bps from the nft_releases row at claim time.';

COMMIT;
