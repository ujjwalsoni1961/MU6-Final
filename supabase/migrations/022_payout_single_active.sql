-- ============================================================
-- MU6 — Migration 022: Payout Single-Active Request
-- ============================================================
-- PDF Fix #8 requirements:
--   1. An artist may have at most ONE active (status='pending') payout request
--      at a time. New requests are rejected until the existing one is
--      approved (-> 'completed') or rejected (-> 'failed').
--   2. On approval: balance auto-debits. Handled already by
--      get_artist_balance() which treats 'pending' + 'completed' as paid-out.
--      When an admin flips 'pending' -> 'completed', the debit stays.
--   3. On rejection: status flips 'pending' -> 'failed'. get_artist_balance()
--      excludes 'failed', so the balance is naturally restored.
--
-- This migration adds the single-active constraint at the DB level (so the
-- app UI cannot bypass it even under race conditions) and exposes a small
-- helper function the app can use for UI gating.
-- ============================================================

BEGIN;

-- 0. Clean up pre-existing duplicate pending rows.
--    Keep the most recent pending per profile; mark older ones as 'failed'
--    with an auto-resolution admin note so the unique index below can be
--    created without violating its constraint. Safe to rerun (no-op if all
--    profiles already have at most one pending row).
WITH ranked AS (
  SELECT
    id,
    profile_id,
    requested_at,
    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY requested_at DESC) AS rn
  FROM payout_requests
  WHERE status = 'pending'
)
UPDATE payout_requests pr
SET
  status = 'failed',
  processed_at = now(),
  admin_notes = COALESCE(pr.admin_notes, '')
    || ' [Auto-resolved by migration 022: superseded by newer pending request]'
FROM ranked r
WHERE pr.id = r.id AND r.rn > 1;

-- 1. Enforce at most one pending payout per profile.
--    Partial unique index is the cleanest way: it only applies to rows
--    whose status is 'pending', so completed/failed history is unlimited.
CREATE UNIQUE INDEX IF NOT EXISTS payout_requests_one_pending_per_profile
  ON payout_requests (profile_id)
  WHERE status = 'pending';

-- 2. Helper: does this profile already have a pending payout?
CREATE OR REPLACE FUNCTION has_pending_payout(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM payout_requests
    WHERE profile_id = p_profile_id
      AND status = 'pending'
  );
$$;

COMMIT;
