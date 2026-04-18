# Migrations Notes

## One-time operator steps (NOT committed to git — secrets)

### Migration 032 — `mu6_nft_admin_anon_key` vault secret

Migration `032_primary_sale_payouts_cron.sql` schedules an hourly pg_cron job
that POSTs to the `nft-admin` edge function's `sweepPrimarySalePayouts`
action. It reads the anon JWT from Vault at call time so the key never lives
in git or in the migration SQL.

After applying migration 032 (on testnet or mainnet), seed the secret **once**
per project:

```sql
-- Run in Supabase SQL editor (or via the Management API with a service token).
-- Replace <ANON_JWT> with the project's anon key from
-- Project Settings → API → anon / public.
DO $$
DECLARE
    existing_id uuid;
BEGIN
    SELECT id INTO existing_id FROM vault.secrets WHERE name = 'mu6_nft_admin_anon_key';
    IF existing_id IS NOT NULL THEN
        DELETE FROM vault.secrets WHERE id = existing_id;
    END IF;
    PERFORM vault.create_secret(
        '<ANON_JWT>',
        'mu6_nft_admin_anon_key',
        'Anon JWT used by pg_cron to call nft-admin edge function (sweep action).'
    );
END
$$;
```

To confirm the helper works end-to-end:

```sql
SELECT public.mu6_sweep_primary_sale_payouts();  -- returns a pg_net request id
-- Wait ~3 seconds
SELECT id, status_code, content FROM net._http_response ORDER BY id DESC LIMIT 1;
-- Expect status_code=200, content='{"success":true,"processed":[...]}'
```

If the anon key is ever rotated, re-run the block above with the new JWT.
The cron job will pick up the new secret on its next tick — no redeploy.
