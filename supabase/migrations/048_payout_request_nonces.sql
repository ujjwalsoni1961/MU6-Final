-- ============================================================
-- 048 — Payout request nonce table (SEC-04 replay protection)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payout_request_nonces (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID NOT NULL,
    nonce TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (profile_id, nonce)
);

CREATE INDEX IF NOT EXISTS payout_request_nonces_created_idx
    ON public.payout_request_nonces (created_at DESC);

ALTER TABLE public.payout_request_nonces ENABLE ROW LEVEL SECURITY;
-- No policies => only service_role (edge fn) may read/write.
