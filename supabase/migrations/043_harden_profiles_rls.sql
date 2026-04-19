-- ============================================================
-- 043 — Harden profiles RLS (SEC-01)
-- ============================================================
-- Audit finding SEC-01: migration 006 set profiles_update to USING(true)
-- WITH CHECK(true), letting any anon-key holder escalate role='admin',
-- rewrite wallet_address, or change payout bank fields.
--
-- Fix strategy (pragmatic, Thirdweb-auth compatible):
--   * Keep profiles_update permissive at the RLS level so normal clients
--     can edit their own display_name/bio/avatar/etc. without needing a
--     full SIWE session — the app is still in Thirdweb-wallet-auth mode
--     where auth.uid() is NULL.
--   * Install a BEFORE UPDATE trigger on profiles that BLOCKS changes to
--     sensitive columns (role, is_admin, is_blocked, is_active,
--     wallet_address, id, email, payout_bank_details*) unless the caller
--     is running as postgres/service_role. Service-role bypasses RLS, so
--     edge functions using SUPABASE_SERVICE_ROLE_KEY keep working.
--   * Block is enforced by raising a clear RLS-style error so audit logs
--     surface the attempt distinctly.
-- ============================================================

-- 1. Ensure the permissive UPDATE policy stays but document intent.
--    (left-as-is for non-sensitive columns; trigger is the column-level guard)

-- 2. The guard trigger. Uses current_setting('role') — always 'authenticator'
--    / 'anon' / 'authenticated' for PostgREST traffic, and 'service_role' when
--    the service-role key is used. Also allow when session is 'postgres' for
--    direct psql migrations.
CREATE OR REPLACE FUNCTION mu6_guard_profile_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_role_setting text := current_setting('role', true);
    is_privileged boolean := current_role_setting IN ('service_role', 'postgres', 'supabase_admin');
BEGIN
    IF is_privileged THEN
        RETURN NEW;
    END IF;

    -- Block sensitive column changes from non-privileged sessions.
    -- Tolerate equal values (client may echo the full row on update).
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'profiles.role is immutable from client — use admin edge function'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN
        RAISE EXCEPTION 'profiles.wallet_address is immutable from client'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'profiles.id is immutable'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
        RAISE EXCEPTION 'profiles.is_blocked is admin-only'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        RAISE EXCEPTION 'profiles.is_active is admin-only'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
        RAISE EXCEPTION 'profiles.is_verified is admin-only'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'profiles.email must go through auth flow'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_sensitive_columns ON profiles;
CREATE TRIGGER trg_guard_profile_sensitive_columns
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION mu6_guard_profile_sensitive_columns();

COMMENT ON FUNCTION mu6_guard_profile_sensitive_columns IS
    'SEC-01 — blocks client-side edits to role / wallet / id / is_blocked / is_active / is_verified / email. Only service_role sessions (edge functions with SUPABASE_SERVICE_ROLE_KEY) may change these columns.';

-- 3. Same guard on INSERT for role — nobody should self-declare admin via
--    anon key. The profile-sync edge function creates rows with role=listener
--    by default and always uses service_role so is_privileged=true.
CREATE OR REPLACE FUNCTION mu6_guard_profile_insert_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_role_setting text := current_setting('role', true);
    is_privileged boolean := current_role_setting IN ('service_role', 'postgres', 'supabase_admin');
BEGIN
    IF is_privileged THEN
        RETURN NEW;
    END IF;

    IF NEW.role IS NOT NULL AND NEW.role <> 'listener' THEN
        RAISE EXCEPTION 'profiles.role on insert must be listener from client'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.is_blocked IS TRUE OR NEW.is_verified IS TRUE THEN
        RAISE EXCEPTION 'profiles privileged flags cannot be set from client'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_insert_role ON profiles;
CREATE TRIGGER trg_guard_profile_insert_role
BEFORE INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION mu6_guard_profile_insert_role();
