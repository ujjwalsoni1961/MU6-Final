-- ============================================================================
-- 033 · Primary-sale payouts: split out thirdweb protocol fee column
-- ----------------------------------------------------------------------------
-- Context
--   Every DropERC721 claim pays TWO fees before the primary-sale recipient:
--     1. thirdweb protocol fee (hardcoded 50 bps to 0x1Af20C6B...; constant
--        in the contract bytecode, no setter exists).
--     2. Configurable platform fee (bps set via setPlatformFeeInfo, recipient
--        set by contract admin). MU6 now uses 500 bps (5%) → server wallet.
--
--   Before this migration the `primary_sale_payouts` ledger tracked only ONE
--   platform fee column (`platform_wei` / `platform_fee_bps`), which
--   conflated the two above. The result was that the edge function was
--   forwarding `gross - mu6Fee` to the artist, while the server wallet only
--   ever received `gross - thirdwebFee - mu6Fee`. Over time this leaks
--   gas float.
--
--   This migration adds a dedicated `thirdweb_fee_wei` column so the edge
--   function can track all three components transparently:
--     gross_wei        = buyer paid
--     thirdweb_fee_wei = gross * 50 / 10000      (protocol, out of our control)
--     platform_wei     = gross * mu6Bps / 10000  (MU6, retained by server)
--     artist_wei       = gross - thirdweb_fee_wei - platform_wei (forwarded)
--
--   `thirdweb_fee_wei` defaults to 0 so existing rows remain valid. New writes
--   will populate it accurately.
--
-- ============================================================================

BEGIN;

ALTER TABLE public.primary_sale_payouts
    ADD COLUMN IF NOT EXISTS thirdweb_fee_wei NUMERIC(78, 0) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.primary_sale_payouts.thirdweb_fee_wei IS
    'Portion of gross_wei consumed by the thirdweb DropERC721 hardcoded '
    '50 bps (0.5%) protocol fee. Not retained by MU6 — sent to '
    '0x1Af20C6B23373350aD464700B5965CE4B0D2aD94 by the claim call itself. '
    'Tracked here so gross_wei = thirdweb_fee_wei + platform_wei + artist_wei.';

-- Refresh the admin view so the new column is surfaced alongside the existing
-- joins. Keeps the same column set as 031 plus thirdweb_fee_wei. We DROP then
-- CREATE because adding a column in the middle of the SELECT list changes the
-- view's column ordering, which CREATE OR REPLACE does not allow.
DROP VIEW IF EXISTS public.primary_sale_payouts_admin_view;

CREATE VIEW public.primary_sale_payouts_admin_view AS
SELECT
    p.id,
    p.created_at,
    p.status,
    p.chain_id,
    p.contract_address,
    p.nft_token_id,
    p.buyer_wallet,
    p.artist_wallet,
    p.gross_wei,
    p.thirdweb_fee_wei,
    p.artist_wei,
    p.platform_wei,
    p.platform_fee_bps,
    p.claim_tx_hash,
    p.forward_tx_hash,
    p.attempt_count,
    p.last_error,
    p.forwarded_at,
    r.tier_name,
    r.rarity,
    s.title  AS song_title,
    prof.display_name AS artist_name
FROM public.primary_sale_payouts p
LEFT JOIN public.nft_releases r ON r.id = p.release_id
LEFT JOIN public.songs s        ON s.id = r.song_id
LEFT JOIN public.profiles prof  ON prof.id = s.creator_id;

COMMENT ON VIEW public.primary_sale_payouts_admin_view IS
    'Flattened view for the admin Primary Sale Payouts screen. Joins release + '
    'song + artist profile, and includes both the MU6 platform fee and the '
    'thirdweb protocol fee so operators can reconcile the full split.';

COMMIT;
