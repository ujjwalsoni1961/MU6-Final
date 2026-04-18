-- ============================================================================
-- 035 · profiles — per-artist royalty configuration
-- ----------------------------------------------------------------------------
-- Context
--   ERC-1155 DropERC1155 contracts support per-token royalty overrides via
--   setRoyaltyInfoForToken(uint256,address,uint256).  To allow artists to
--   configure their own secondary-sale royalty recipient and bps without
--   requiring admin intervention, this migration adds two fields to profiles:
--
--   royalty_bps              — desired secondary-sale royalty in basis points
--                              (0–1000, i.e. 0–10%). Default 500 (5%).
--   royalty_recipient_wallet — optional override EVM address for royalty
--                              payments.  When NULL, falls back to
--                              profiles.payout_wallet_address, then
--                              profiles.wallet_address.
--
-- Usage
--   When an artist publishes a new ERC-1155 release, the edge function reads
--   these fields and calls setRoyaltyInfoForToken with the artist's configured
--   values.  This is always advisory — on-chain is source of truth.  The edge
--   function action setRoyaltyInfoForToken can also be called at any time to
--   update the on-chain state.
--
-- Validation
--   A BEFORE INSERT / UPDATE trigger validates that royalty_bps is in [0,1000]
--   as a belt-and-suspenders guard complementing the CHECK constraint.
-- ============================================================================

BEGIN;

-- 1. royalty_bps — secondary-sale royalty rate
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS royalty_bps INTEGER NOT NULL DEFAULT 500
    CHECK (royalty_bps >= 0 AND royalty_bps <= 1000);

COMMENT ON COLUMN public.profiles.royalty_bps IS
    'Artist''s desired secondary-sale royalty rate in basis points (0–1000, '
    'i.e. 0–10%). Default 500 (5%). Written to DropERC1155 via '
    'setRoyaltyInfoForToken when a new ERC-1155 release is published. '
    'On-chain value is authoritative; this field is the admin''s intent.';

-- 2. royalty_recipient_wallet — optional EVM address override for royalty receipt
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS royalty_recipient_wallet TEXT;

COMMENT ON COLUMN public.profiles.royalty_recipient_wallet IS
    'Optional EVM address (0x…) to receive secondary-sale royalty payments. '
    'When NULL, the edge function falls back to payout_wallet_address, then '
    'wallet_address. Allows artists to direct royalties to a dedicated cold '
    'wallet independently of their primary-sale payout address.';

-- Basic EVM address format check — 0x + 40 hex chars, or NULL
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_royalty_recipient_wallet_format;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_royalty_recipient_wallet_format
    CHECK (
        royalty_recipient_wallet IS NULL
        OR royalty_recipient_wallet ~* '^0x[0-9a-f]{40}$'
    );

-- 3. Validation trigger: belt-and-suspenders guard for royalty_bps range.
--    The CHECK constraint above already covers this, but the trigger provides
--    a clear error message for application-layer callers.
CREATE OR REPLACE FUNCTION public.profiles_validate_royalty_bps()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.royalty_bps < 0 OR NEW.royalty_bps > 1000 THEN
        RAISE EXCEPTION
            'royalty_bps must be between 0 and 1000 (got %)', NEW.royalty_bps
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_check_royalty_bps ON public.profiles;
CREATE TRIGGER profiles_check_royalty_bps
    BEFORE INSERT OR UPDATE OF royalty_bps ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.profiles_validate_royalty_bps();

COMMIT;
