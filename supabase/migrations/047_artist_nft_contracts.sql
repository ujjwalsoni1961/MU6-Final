-- 047_artist_nft_contracts.sql
-- ─────────────────────────────
-- Registry of per-artist DropERC1155 contracts. Introduced alongside the
-- nft-admin "deployDropERC1155" action (Fix 4). One row per (profile_id, chain_id).
--
-- Design:
--  - Nullable profile_id on releases stays untouched; releases still point at
--    their contract_address. This table is a convenience lookup for artists
--    who want their own contract.
--  - On testnet the shared contract is the default; rows here are opt-in.
--  - Unique on (profile_id, chain_id) so the same artist gets one contract
--    per chain (testnet + mainnet can coexist).

CREATE TABLE IF NOT EXISTS public.artist_nft_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    chain_id text NOT NULL,
    contract_address text NOT NULL,
    name text,
    symbol text,
    contract_uri text,
    deployed_tx_hash text,
    deployed_at timestamptz DEFAULT now(),
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS artist_nft_contracts_profile_chain_uidx
    ON public.artist_nft_contracts (profile_id, chain_id);

CREATE INDEX IF NOT EXISTS artist_nft_contracts_contract_idx
    ON public.artist_nft_contracts (contract_address);

-- Row-level security: service-role + admins only. Artists can read their own row.
ALTER TABLE public.artist_nft_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS artist_nft_contracts_self_select ON public.artist_nft_contracts;
CREATE POLICY artist_nft_contracts_self_select
    ON public.artist_nft_contracts
    FOR SELECT
    USING (profile_id = auth.uid());

-- updated_at trigger (reuse existing helper if present)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artist_nft_contracts_touch ON public.artist_nft_contracts;
CREATE TRIGGER artist_nft_contracts_touch
    BEFORE UPDATE ON public.artist_nft_contracts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.artist_nft_contracts IS
    'Per-artist DropERC1155 contracts (Fix 4). Populated by nft-admin deployDropERC1155 action. Falls back to shared MU6 contract when no row exists for a given (profile_id, chain_id).';
