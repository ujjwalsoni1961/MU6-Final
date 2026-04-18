-- ============================================================================
-- 038 · Helper functions + pg_cron sync jobs
-- ----------------------------------------------------------------------------
-- Sections:
--   A. increment_token_balance(...)  — atomic upsert helper for syncTransfers
--   B. refresh_collection_stats()   — REFRESH MATERIALIZED VIEW wrapper
--   C. mu6_check_server_wallet_balance() — daily low-balance alert
--   D. pg_cron jobs for sync/enrichment pipeline
--      mu6_sync_transfers_erc1155   every 5 min
--      mu6_sync_transfers_erc721    every 5 min (2-min offset)
--      mu6_enrich_marketplace       every 10 min
--      mu6_enrich_opensea           every 15 min
--      mu6_refresh_stats            every 15 min
--      mu6_wallet_balance_alert     daily 08:00 UTC
-- ============================================================================

BEGIN;

-- ── A. increment_token_balance ───────────────────────────────────────────────
-- Atomically credit or debit an owner's ERC-1155 balance.
-- Called by syncTransfers for every TransferSingle / TransferBatch item.
-- p_delta: stringified integer — positive = credit, negative = debit.
-- Balance is clamped to >= 0 to tolerate out-of-order sync.
CREATE OR REPLACE FUNCTION public.increment_token_balance(
    p_chain_id  INTEGER,
    p_contract  TEXT,
    p_token_id  TEXT,
    p_owner     TEXT,
    p_delta     TEXT,
    p_block     BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.nft_token_owners
        (chain_id, contract_address, token_id, owner, balance, last_block, updated_at)
    VALUES
        (p_chain_id, p_contract, p_token_id::NUMERIC, p_owner,
         GREATEST(0, p_delta::NUMERIC),
         p_block, now())
    ON CONFLICT (chain_id, contract_address, token_id, owner)
    DO UPDATE SET
        balance    = GREATEST(0, nft_token_owners.balance + p_delta::NUMERIC),
        last_block = GREATEST(nft_token_owners.last_block, p_block),
        updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.increment_token_balance IS
    'Atomically credit (p_delta > 0) or debit (p_delta < 0) an ERC-1155 '
    'token balance in nft_token_owners. Called by the syncTransfers edge '
    'action. Balance is clamped to >= 0 to tolerate out-of-order sync.';

-- ── B. refresh_collection_stats ─────────────────────────────────────────────
-- Wraps REFRESH MATERIALIZED VIEW CONCURRENTLY so it can be called via
-- supabase.rpc("refresh_collection_stats") from the edge function and from cron.
CREATE OR REPLACE FUNCTION public.refresh_collection_stats()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_nft_collection_stats;
END;
$$;

COMMENT ON FUNCTION public.refresh_collection_stats IS
    'Refreshes mv_nft_collection_stats concurrently. Called by the '
    'refreshCollectionStats edge action and directly by pg_cron.';

-- ── C. mu6_check_server_wallet_balance ──────────────────────────────────────
-- Called daily by pg_cron.  Makes a synchronous eth_getBalance RPC call via
-- pg_net and records a warning in nft_sync_state if balance < 1 POL (1e18 wei).
-- The /admin/nft-health page surfaces error_count > 0 rows in nft_sync_state.
--
-- Note: the anon key is NOT a secret — it is a public JWT that only enforces
-- RLS policies (which are also server-side).  It is already in client bundles
-- and in this repository (migration filenames / edge function calls).
CREATE OR REPLACE FUNCTION public.mu6_check_server_wallet_balance()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_rpc        TEXT := 'https://80002.rpc.thirdweb.com/64c9d6a04c2edcf1c8b117db980edd41';
    v_server     TEXT := '0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39';
    v_req_id     BIGINT;
    v_resp_row   RECORD;
    v_result     TEXT;
    v_bal        NUMERIC;
    v_one_pol    NUMERIC := 1000000000000000000; -- 1e18
BEGIN
    -- Send async request via pg_net
    SELECT net.http_post(
        url     := v_rpc,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body    := ('{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["'
                    || v_server || '","latest"]}'
                   )::bytea
    ) INTO v_req_id;

    -- Wait briefly then collect response (pg_net 0.7+ returns immediately)
    PERFORM pg_sleep(2);

    SELECT status_code, content INTO v_resp_row
    FROM net._http_response
    WHERE id = v_req_id;

    IF v_resp_row IS NULL OR v_resp_row.status_code != 200 THEN
        RAISE WARNING '[mu6_check_server_wallet_balance] RPC call failed: status=%', v_resp_row.status_code;
        RETURN;
    END IF;

    -- Extract hex result from JSON body
    v_result := (v_resp_row.content::json)->>'result';

    IF v_result IS NULL OR v_result = '0x' OR v_result = '0x0' THEN
        v_bal := 0;
    ELSE
        -- Convert hex string to numeric
        v_bal := CONCAT('x', ltrim(v_result, '0x'))::bit(256)::numeric;
    END IF;

    IF v_bal < v_one_pol THEN
        INSERT INTO public.nft_sync_state
            (chain_id, contract_address, sync_type, last_synced_block, last_synced_at, error_count, last_error)
        VALUES
            (80002, v_server, 'transfers', 0, now(), 1,
             'LOW_BALANCE: server wallet POL balance = ' || v_bal || ' wei (< 1 POL). Top up ' || v_server || ' on Amoy.')
        ON CONFLICT (chain_id, contract_address, sync_type)
        DO UPDATE SET
            error_count    = nft_sync_state.error_count + 1,
            last_error     = 'LOW_BALANCE: server wallet POL balance = ' || v_bal || ' wei (< 1 POL). Top up ' || v_server || ' on Amoy.',
            last_synced_at = now();
    ELSE
        -- Clear any previous alert
        UPDATE public.nft_sync_state
        SET error_count = 0,
            last_error  = NULL,
            last_synced_at = now()
        WHERE chain_id = 80002
          AND contract_address = v_server
          AND sync_type = 'transfers';
    END IF;
END;
$$;

COMMENT ON FUNCTION public.mu6_check_server_wallet_balance IS
    'Daily pg_cron job: checks server wallet POL balance via eth_getBalance. '
    'Writes an alert row to nft_sync_state if balance < 1 POL. '
    'Surfaced by the /admin/nft-health admin page.';

-- ── D. pg_cron jobs ──────────────────────────────────────────────────────────
-- The anon key is embedded because:
--   1. It is public (present in client JS bundles and in this repo already).
--   2. ALTER DATABASE SET custom.param is not permitted in managed Supabase
--      projects at the SQL layer.
--   3. The edge function applies service-role for all write operations.

DO $cron_setup$
DECLARE
    v_edge_url  TEXT := 'https://ukavmvxelsfdfktiiyvg.supabase.co/functions/v1/nft-admin';
    -- anon key: public JWT — see above comment
    v_anon_key  TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrYXZtdnhlbHNmZGZrdGlpeXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4ODU2NjcsImV4cCI6MjA4NjQ2MTY2N30.SOhR-X9z--iHPVF5yZhHV6ygdj0GjPQYumDd8iGf5MI';
    v_erc1155   TEXT := '0x10450d990a0fb50d00aa5d304846b8421d3cb5ad';
    v_erc721    TEXT := '0xacf1145ade250d356e1b2869e392e6c748c14c0e';
    v_mkt       TEXT := '0x141fc79b7f1eb7b393a5dc5f257678c3cd30506a';
    v_chain     INT  := 80002;
BEGIN

-- Remove any stale versions before scheduling fresh ones
PERFORM cron.unschedule(j.jobname)
FROM cron.job j
WHERE j.jobname IN (
    'mu6_sync_transfers_erc1155', 'mu6_sync_transfers_erc721',
    'mu6_enrich_marketplace', 'mu6_enrich_opensea',
    'mu6_refresh_stats', 'mu6_wallet_balance_alert'
);

-- 1. sync_transfers_erc1155 — every 5 min
PERFORM cron.schedule(
    'mu6_sync_transfers_erc1155',
    '*/5 * * * *',
    format(
        $q$SELECT net.http_post(
            url     := %L,
            headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
            body    := '{"action":"syncTransfers","chainId":%s,"contractAddress":"%s"}'::bytea
        )$q$,
        v_edge_url, v_anon_key, v_chain, v_erc1155
    )
);

-- 2. sync_transfers_erc721 — every 5 min, 2-min offset
PERFORM cron.schedule(
    'mu6_sync_transfers_erc721',
    '2-59/5 * * * *',
    format(
        $q$SELECT net.http_post(
            url     := %L,
            headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
            body    := '{"action":"syncTransfers","chainId":%s,"contractAddress":"%s"}'::bytea
        )$q$,
        v_edge_url, v_anon_key, v_chain, v_erc721
    )
);

-- 3. enrich_mu6 — every 10 min
PERFORM cron.schedule(
    'mu6_enrich_marketplace',
    '*/10 * * * *',
    format(
        $q$SELECT net.http_post(
            url     := %L,
            headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
            body    := '{"action":"enrichMu6MarketplaceSales","chainId":%s,"marketplaceAddress":"%s"}'::bytea
        )$q$,
        v_edge_url, v_anon_key, v_chain, v_mkt
    )
);

-- 4. enrich_opensea — every 15 min (3-min offset)
PERFORM cron.schedule(
    'mu6_enrich_opensea',
    '3-59/15 * * * *',
    format(
        $q$SELECT net.http_post(
            url     := %L,
            headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
            body    := '{"action":"enrichOpenseaSales","chainId":%s,"contractAddress":"%s"}'::bytea
        )$q$,
        v_edge_url, v_anon_key, v_chain, v_erc1155
    )
);

-- 5. stats_refresh — every 15 min (direct SQL, no pg_net needed)
PERFORM cron.schedule(
    'mu6_refresh_stats',
    '*/15 * * * *',
    'SELECT public.refresh_collection_stats();'
);

-- 6. wallet_balance_alert — daily 08:00 UTC
PERFORM cron.schedule(
    'mu6_wallet_balance_alert',
    '0 8 * * *',
    'SELECT public.mu6_check_server_wallet_balance();'
);

END;
$cron_setup$;

COMMIT;
