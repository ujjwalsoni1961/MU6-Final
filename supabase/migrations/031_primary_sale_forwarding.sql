-- ============================================================================
-- 031_primary_sale_forwarding.sql
--
-- Option B — Server Wallet Primary Sale Forwarding
--
-- Architecture:
--   * DropERC721.primarySaleRecipient is set on-chain to the server wallet
--     (0x76BCCe5D...). The contract therefore pays the server wallet for every
--     `claim()` call.
--   * Immediately after a confirmed mint, the edge function forwards the
--     artist's share (currently 100% — platform fee = 0bps) from the server
--     wallet to `nft_releases.primary_sale_recipient`, which is a per-release
--     snapshot of the artist's payout wallet.
--   * Each forward is persisted in `primary_sale_payouts` with full audit trail
--     (claim tx hash, forward tx hash, gross/artist/platform splits, status).
--
-- Design principles:
--   * `primary_sale_recipient` is snapshotted on the release row at the moment
--     the release is created, so changing a profile's payout wallet later does
--     not silently redirect future sales on existing releases.
--   * `profiles.payout_wallet_address` is a NULLABLE override. When null the
--     artist's login `wallet_address` is used. This lets the artist point
--     payouts to a cold wallet without losing their login identity.
--   * Payout statuses: pending_retry → forwarded → settled; or failed (manual).
--   * NFT delivery is independent of forward success. If the forward fails
--     (network, insufficient gas float, etc.), the buyer still gets the NFT and
--     a `pending_retry` payout row is created. A retry sweep can settle it.
-- ============================================================================

-- 1. profiles.payout_wallet_address — nullable override
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS payout_wallet_address TEXT;

COMMENT ON COLUMN public.profiles.payout_wallet_address IS
    'Optional EVM address (0x…) the artist wants primary-sale payouts sent to. '
    'When NULL, falls back to profiles.wallet_address. Snapshotted into '
    'nft_releases.primary_sale_recipient at release-creation time.';

-- Basic format check — 0x + 40 hex chars, or NULL
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_payout_wallet_address_format;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_payout_wallet_address_format
    CHECK (
        payout_wallet_address IS NULL
        OR payout_wallet_address ~* '^0x[0-9a-f]{40}$'
    );

-- 2. nft_releases.primary_sale_recipient — per-release snapshot
ALTER TABLE public.nft_releases
    ADD COLUMN IF NOT EXISTS primary_sale_recipient TEXT;

COMMENT ON COLUMN public.nft_releases.primary_sale_recipient IS
    'EVM address that receives the primary-sale payout when a token from this '
    'release is minted. Snapshotted at release-creation time from '
    'profiles.payout_wallet_address (fallback: profiles.wallet_address) of the '
    'song creator. NULL allowed for legacy rows — backfilled by the migration.';

ALTER TABLE public.nft_releases
    DROP CONSTRAINT IF EXISTS nft_releases_primary_sale_recipient_format;
ALTER TABLE public.nft_releases
    ADD CONSTRAINT nft_releases_primary_sale_recipient_format
    CHECK (
        primary_sale_recipient IS NULL
        OR primary_sale_recipient ~* '^0x[0-9a-f]{40}$'
    );

-- 3. Backfill existing nft_releases rows from the creator's profile.
--    Pick payout_wallet_address when set, otherwise the creator's login wallet.
--    IMPORTANT: only backfill when the source wallet passes the format check,
--    because legacy seed rows (e.g. '0xluna0003…') have non-EVM placeholders.
--    Rows whose creator's wallet is garbage simply stay NULL — the edge
--    function refuses to forward when recipient is NULL and marks the payout
--    status=failed so an operator can fix the creator profile and retry.
UPDATE public.nft_releases r
   SET primary_sale_recipient = COALESCE(p.payout_wallet_address, p.wallet_address)
  FROM public.songs s
  JOIN public.profiles p ON p.id = s.creator_id
 WHERE r.song_id = s.id
   AND r.primary_sale_recipient IS NULL
   AND COALESCE(p.payout_wallet_address, p.wallet_address) ~* '^0x[0-9a-f]{40}$';

-- 4. primary_sale_payouts — ledger
CREATE TABLE IF NOT EXISTS public.primary_sale_payouts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id           UUID REFERENCES public.nft_releases(id) ON DELETE SET NULL,
    nft_token_id         TEXT,                            -- on-chain uint256 as decimal string
    contract_address     TEXT NOT NULL,
    chain_id             TEXT NOT NULL,

    buyer_wallet         TEXT NOT NULL,
    artist_wallet        TEXT NOT NULL,                    -- recipient of forward
    server_wallet        TEXT NOT NULL,                    -- the forwarder (sender)

    gross_wei            NUMERIC(78, 0) NOT NULL,          -- price paid by buyer
    artist_wei           NUMERIC(78, 0) NOT NULL,          -- forwarded to artist
    platform_wei         NUMERIC(78, 0) NOT NULL DEFAULT 0,-- retained by server
    platform_fee_bps     INTEGER NOT NULL DEFAULT 0,

    claim_tx_hash        TEXT NOT NULL,                    -- the mint tx
    forward_tx_hash      TEXT,                             -- the payout tx (nullable on retry)

    status               TEXT NOT NULL DEFAULT 'pending_retry',
    -- status values:
    --   pending_retry — forward not yet sent OR last attempt failed
    --   forwarding    — forward submitted, awaiting confirmation
    --   forwarded     — forward tx confirmed on-chain
    --   failed        — non-transient failure, needs manual intervention

    attempt_count        INTEGER NOT NULL DEFAULT 0,
    last_error           TEXT,
    last_attempt_at      TIMESTAMPTZ,
    forwarded_at         TIMESTAMPTZ,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT primary_sale_payouts_status_valid
        CHECK (status IN ('pending_retry','forwarding','forwarded','failed')),
    CONSTRAINT primary_sale_payouts_buyer_format
        CHECK (buyer_wallet ~* '^0x[0-9a-f]{40}$'),
    CONSTRAINT primary_sale_payouts_artist_format
        CHECK (artist_wallet ~* '^0x[0-9a-f]{40}$'),
    CONSTRAINT primary_sale_payouts_server_format
        CHECK (server_wallet ~* '^0x[0-9a-f]{40}$'),
    CONSTRAINT primary_sale_payouts_claim_hash_format
        CHECK (claim_tx_hash ~* '^0x[0-9a-f]{64}$'),
    CONSTRAINT primary_sale_payouts_forward_hash_format
        CHECK (forward_tx_hash IS NULL OR forward_tx_hash ~* '^0x[0-9a-f]{64}$'),
    CONSTRAINT primary_sale_payouts_splits_nonneg
        CHECK (gross_wei >= 0 AND artist_wei >= 0 AND platform_wei >= 0),
    CONSTRAINT primary_sale_payouts_splits_sum
        CHECK (artist_wei + platform_wei = gross_wei)
);

COMMENT ON TABLE public.primary_sale_payouts IS
    'Audit ledger for primary-sale payout forwards from the server wallet to '
    'the release''s artist. One row per confirmed mint. See '
    '031_primary_sale_forwarding.sql for architecture.';

-- Claim hash is globally unique (one payout per mint tx)
CREATE UNIQUE INDEX IF NOT EXISTS primary_sale_payouts_claim_tx_hash_uniq
    ON public.primary_sale_payouts (claim_tx_hash);

-- Retry sweep needs to find pending rows quickly
CREATE INDEX IF NOT EXISTS primary_sale_payouts_status_attempts_idx
    ON public.primary_sale_payouts (status, attempt_count, last_attempt_at);

CREATE INDEX IF NOT EXISTS primary_sale_payouts_artist_idx
    ON public.primary_sale_payouts (artist_wallet, created_at DESC);

CREATE INDEX IF NOT EXISTS primary_sale_payouts_release_idx
    ON public.primary_sale_payouts (release_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.primary_sale_payouts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS primary_sale_payouts_touch ON public.primary_sale_payouts;
CREATE TRIGGER primary_sale_payouts_touch
    BEFORE UPDATE ON public.primary_sale_payouts
    FOR EACH ROW
    EXECUTE FUNCTION public.primary_sale_payouts_set_updated_at();

-- 5. RLS: read = artist sees their own rows + admins see all; write = service only
ALTER TABLE public.primary_sale_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS primary_sale_payouts_artist_read ON public.primary_sale_payouts;
CREATE POLICY primary_sale_payouts_artist_read
    ON public.primary_sale_payouts
    FOR SELECT
    USING (
        -- The artist whose wallet received the forward can see the row.
        -- Comparison via lower() because wallets are stored mixed-case.
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND (
                  lower(p.wallet_address)           = lower(primary_sale_payouts.artist_wallet)
               OR lower(p.payout_wallet_address)    = lower(primary_sale_payouts.artist_wallet)
              )
        )
    );

DROP POLICY IF EXISTS primary_sale_payouts_admin_read ON public.primary_sale_payouts;
CREATE POLICY primary_sale_payouts_admin_read
    ON public.primary_sale_payouts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'admin'::user_role
        )
    );

-- No user-facing INSERT/UPDATE/DELETE policies — only the edge function
-- (service-role) writes to this table. RLS with no write policy denies writes
-- for all non-service-role users, which is what we want.

-- 6. Helper VIEW for the admin ledger page
CREATE OR REPLACE VIEW public.primary_sale_payouts_admin_view AS
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
    'song + artist profile so the UI does not need to fan-out separate queries.';

-- 7. BEFORE INSERT trigger on nft_releases: auto-fill primary_sale_recipient
--    from the song creator's profile at release-creation time. This guarantees
--    every new release carries a recipient without forcing every caller to
--    remember to set it. Skips auto-fill when:
--      * NEW.primary_sale_recipient is already set (explicit override), OR
--      * the creator's wallet isn't a valid EVM address (legacy seed rows).
CREATE OR REPLACE FUNCTION public.nft_releases_autofill_primary_sale_recipient()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet TEXT;
BEGIN
    IF NEW.primary_sale_recipient IS NULL THEN
        SELECT COALESCE(p.payout_wallet_address, p.wallet_address)
          INTO v_wallet
          FROM public.songs s
          JOIN public.profiles p ON p.id = s.creator_id
         WHERE s.id = NEW.song_id;
        IF v_wallet IS NOT NULL AND v_wallet ~* '^0x[0-9a-f]{40}$' THEN
            NEW.primary_sale_recipient := v_wallet;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nft_releases_set_recipient ON public.nft_releases;
CREATE TRIGGER nft_releases_set_recipient
    BEFORE INSERT ON public.nft_releases
    FOR EACH ROW
    EXECUTE FUNCTION public.nft_releases_autofill_primary_sale_recipient();
