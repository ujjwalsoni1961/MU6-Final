-- Migration 027 — admin_audit_log.admin_id nullable for system / superadmin actions
--
-- Background:
-- The admin dashboard uses a static `superadmin` bypass (via useAdminAuth + the
-- admin-action edge function running with the service role). That bypass is
-- intentionally decoupled from Supabase Auth, so `auth.uid()` is NULL during
-- admin mutations. Until now, `logAuditAction` fell back to the zero-UUID
-- (`00000000-0000-0000-0000-000000000000`) when no auth user existed, which
-- violated the FK `admin_audit_log.admin_id -> profiles(id)` and caused every
-- admin audit insert (song listing/delisting, NFT release toggles, etc.) to
-- return 500.
--
-- Clean fix: `admin_id` semantically represents "the admin who took this
-- action". When that is the static superadmin bypass, there is no matching
-- profile row; NULL is the correct representation. The FK is preserved so that
-- real admin profiles (e.g. admin@mu6.io) continue to cascade on delete.

BEGIN;

ALTER TABLE public.admin_audit_log
    ALTER COLUMN admin_id DROP NOT NULL;

COMMENT ON COLUMN public.admin_audit_log.admin_id IS
    'Profile id of the admin who performed the action. NULL = static superadmin bypass (no linked profile).';

COMMIT;
