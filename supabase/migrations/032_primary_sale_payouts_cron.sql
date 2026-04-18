-- ────────────────────────────────────────────────────────────────────────────
-- Migration 032: Hourly auto-sweep for primary sale payouts (pg_cron + pg_net)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Part of the Option B primary-sale-forwarding architecture (migration 031).
--
-- The serverClaim edge action forwards POL to the artist inline on every mint.
-- When that inline forward fails (RPC hiccup, gas spike, nonce race, etc.) the
-- row is written as status='pending_retry'. This migration schedules a native
-- Supabase cron job that periodically calls the edge function's
-- `sweepPrimarySalePayouts` action to drain those rows without any external
-- scheduler.
--
-- Why native pg_cron (and not an external scheduler)?
--   • No extra infra / credits — runs inside Supabase.
--   • Survives restarts and is visible in the Supabase dashboard (cron.job).
--   • Uses pg_net for async HTTP, so the DB transaction is never blocked on
--     an edge function response.
--
-- Security model:
--   • The anon JWT is stored in `vault.secrets` under name
--     'mu6_nft_admin_anon_key'. It is NEVER written in this migration — it is
--     seeded live by an admin (see `supabase/migrations/README.md` and the
--     ops runbook). This keeps secrets out of git entirely.
--   • The sweep helper is SECURITY DEFINER so it can read the vault secret;
--     EXECUTE is granted only to `postgres` (the owner used by pg_cron).
--   • The sweep edge endpoint itself authenticates the caller via the anon
--     JWT + its own internal action routing; no service-role key leaves the
--     edge function.
--
-- This migration is idempotent — it can be re-applied safely.

-- 1. Enable the required extensions (installed in the `extensions` schema by
--    Supabase convention; pg_cron installs into its own `cron` schema).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Helper: call the nft-admin edge function's sweepPrimarySalePayouts
--    action. Uses net.http_post (async) so the scheduled job returns fast.
--    Returns the pg_net request id for observability (visible in net._http_response).
CREATE OR REPLACE FUNCTION public.mu6_sweep_primary_sale_payouts()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
    anon_key text;
    request_id bigint;
    -- Project-ref is stable; we hard-code it here rather than parse from any
    -- runtime config because pg_cron runs with an empty GUC context. If the
    -- project is ever migrated, update this URL in a follow-up migration.
    edge_url text := 'https://ukavmvxelsfdfktiiyvg.functions.supabase.co/nft-admin';
BEGIN
    -- Pull the anon JWT from Vault. If the secret has not been seeded yet,
    -- fail loudly so the operator notices (instead of silently doing nothing).
    SELECT decrypted_secret
      INTO anon_key
      FROM vault.decrypted_secrets
     WHERE name = 'mu6_nft_admin_anon_key'
     LIMIT 1;

    IF anon_key IS NULL THEN
        RAISE EXCEPTION
            'mu6_nft_admin_anon_key not found in vault.secrets — seed it before the sweep cron will work';
    END IF;

    -- Fire-and-forget POST. Response bodies land in net._http_response.
    SELECT net.http_post(
        url     := edge_url,
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || anon_key
        ),
        body    := jsonb_build_object(
            'action',      'sweepPrimarySalePayouts',
            'limit',       20,
            'maxAttempts', 5
        ),
        -- 30s timeout is comfortably above the edge function's internal
        -- per-transfer budget (45s waitForTx × up to 20 rows) because the
        -- call itself is async — we are only setting the pg_net
        -- request-dispatch timeout, not waiting for the HTTP response.
        timeout_milliseconds := 30000
    ) INTO request_id;

    RETURN request_id;
END;
$$;

COMMENT ON FUNCTION public.mu6_sweep_primary_sale_payouts() IS
    'Calls the nft-admin edge function sweepPrimarySalePayouts action via pg_net. Scheduled hourly by pg_cron (see migration 032).';

-- Lock down EXECUTE: only the role running pg_cron jobs (postgres) should
-- call this. Revoke from public/authenticated/anon so RLS-bypassed clients
-- cannot invoke it.
REVOKE ALL ON FUNCTION public.mu6_sweep_primary_sale_payouts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mu6_sweep_primary_sale_payouts() FROM anon;
REVOKE ALL ON FUNCTION public.mu6_sweep_primary_sale_payouts() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.mu6_sweep_primary_sale_payouts() TO postgres;

-- 3. Schedule the cron job. We use `cron.schedule(jobname, schedule, command)`
--    so re-applying this migration updates the existing job in place rather
--    than creating duplicates. If the job already exists with a different
--    schedule, unschedule it first for idempotency.
DO $$
DECLARE
    existing_jobid bigint;
BEGIN
    SELECT jobid
      INTO existing_jobid
      FROM cron.job
     WHERE jobname = 'mu6_primary_sale_payouts_sweep';

    IF existing_jobid IS NOT NULL THEN
        PERFORM cron.unschedule(existing_jobid);
    END IF;

    PERFORM cron.schedule(
        'mu6_primary_sale_payouts_sweep',
        '7 * * * *',  -- every hour at :07 (offset from :00 to avoid load spikes)
        $cmd$ SELECT public.mu6_sweep_primary_sale_payouts(); $cmd$
    );
END
$$;

-- 4. Audit note
COMMENT ON EXTENSION pg_cron IS
    'Enabled by migration 032 for hourly primary-sale payout retry sweeps.';
