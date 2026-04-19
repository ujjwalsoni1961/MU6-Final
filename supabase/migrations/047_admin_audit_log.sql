-- ============================================================
-- 047 — Admin audit log (no-op, table already exists)
-- ============================================================
-- The admin_audit_log table already exists from an earlier migration with
-- columns (id uuid, admin_id uuid, action text, target_type text,
-- target_id uuid, details jsonb, created_at timestamptz).
-- We reuse it. This migration is retained as a placeholder so the numbering
-- stays linear and future devs understand the schema hasn't changed.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'admin_audit_log'
    ) THEN
        RAISE EXCEPTION 'admin_audit_log should already exist — migration 047 placeholder will not create it.';
    END IF;
END
$$;
