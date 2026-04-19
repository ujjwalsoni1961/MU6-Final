-- ============================================================
-- 046 — Fix profile guard privileged detection
-- ============================================================
-- Migration 043 installed a trigger that relied on current_setting('role')
-- to detect privileged sessions. In practice:
--   * PostgREST anon/authenticated  -> current_setting('role')='anon' / 'authenticated'
--   * PostgREST service-role call  -> current_setting('role')='service_role'
--   * Management API / direct psql -> current_setting('role')='none', session_user='postgres'
--
-- Fix: also treat session_user IN ('postgres','supabase_admin') as privileged.
-- This keeps anon/authenticated locked out but lets service_role, migrations,
-- and operational SQL through.
-- ============================================================

CREATE OR REPLACE FUNCTION mu6_guard_profile_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    role_setting text := current_setting('role', true);
    is_privileged boolean := role_setting IN ('service_role', 'postgres', 'supabase_admin')
                             OR session_user IN ('postgres', 'supabase_admin');
BEGIN
    IF is_privileged THEN
        RETURN NEW;
    END IF;

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

CREATE OR REPLACE FUNCTION mu6_guard_profile_insert_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    role_setting text := current_setting('role', true);
    is_privileged boolean := role_setting IN ('service_role', 'postgres', 'supabase_admin')
                             OR session_user IN ('postgres', 'supabase_admin');
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

COMMENT ON FUNCTION mu6_guard_profile_sensitive_columns IS
    'SEC-01 — blocks client-side edits to role / wallet / id / is_blocked / is_active / is_verified / email. Privileged when session_user is postgres/supabase_admin OR role setting is service_role.';
