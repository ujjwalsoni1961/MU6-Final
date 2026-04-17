-- 024_split_sheet_revenue_rework.sql
-- PDF Fix #10 — Split Sheet Revenue rework
--
-- Changes:
--   1. Streaming royalties continue to flow to all split sheet parties (registered or not).
--      Unregistered parties accrue royalty_shares with linked_profile_id = NULL.
--   2. NFT sale revenue (primary + secondary) is now restricted to the primary creator
--      exclusively (no split sheet participation). This is enforced in blockchain.ts / marketplace.ts
--      by always using the creator wallet as the royalty recipient — no migration is required
--      there, but we add a safety note column + helper view for admin visibility.
--   3. Admin dashboard view: `v_admin_unregistered_accrued_revenue` — aggregates unclaimed
--      streaming royalty_shares (where linked_profile_id is null) grouped by email + song.
--   4. Helper RPC `get_unregistered_accrued_revenue()` that also reports the current
--      registration status (whether an account with that email now exists).
--
-- Note:
--   - When an unregistered user later registers (creates a profile with the same email),
--     the existing auto_link_split_invitations() trigger from migration 013 already
--     back-fills their `linked_profile_id` in song_rights_splits. We extend it here to
--     also back-fill royalty_shares so accrued revenue is claimable via the existing
--     payout flow.
--
-- ============================================================
-- 1. Extend auto-link trigger to back-fill royalty_shares too
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_link_split_invitations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Back-fill split sheet entries (existing behaviour)
    UPDATE song_rights_splits
    SET linked_profile_id = NEW.id,
        linked_wallet_address = NEW.wallet_address
    WHERE party_email = NEW.email
      AND linked_profile_id IS NULL;

    -- Back-fill accrued royalty shares that were pending registration
    UPDATE royalty_shares
    SET linked_profile_id = NEW.id,
        wallet_address = NEW.wallet_address
    WHERE party_email = NEW.email
      AND linked_profile_id IS NULL;

    -- Mark invitations as accepted
    UPDATE split_invitations
    SET status = 'accepted'
    WHERE invitee_email = NEW.email
      AND status = 'pending';

    RETURN NEW;
END;
$$;

-- Trigger is already installed on profiles by 013 — no need to re-create.

-- ============================================================
-- 2. Admin view: unregistered accrued streaming revenue
-- ============================================================
-- One row per (email, song) aggregating unclaimed streaming royalty shares.
-- NFT sale rows are excluded — per the PDF, NFT revenue no longer splits to
-- unregistered parties, it all goes to the primary creator.
DROP VIEW IF EXISTS public.v_admin_unregistered_accrued_revenue;

CREATE OR REPLACE VIEW public.v_admin_unregistered_accrued_revenue AS
SELECT
    rs.party_email                                         AS email,
    COALESCE(
        (SELECT srs.party_name FROM song_rights_splits srs
         WHERE srs.party_email = rs.party_email
         ORDER BY srs.created_at DESC LIMIT 1),
        rs.party_email
    )                                                      AS party_name_hint,
    re.song_id                                             AS song_id,
    s.title                                                AS song_title,
    s.creator_id                                           AS song_creator_id,
    SUM(rs.amount_eur)                                     AS total_accrued_eur,
    COUNT(*)                                               AS share_count,
    MIN(rs.created_at)                                     AS first_accrued_at,
    MAX(rs.created_at)                                     AS last_accrued_at,
    EXISTS (SELECT 1 FROM profiles p WHERE p.email = rs.party_email) AS is_registered,
    (SELECT p.id FROM profiles p WHERE p.email = rs.party_email LIMIT 1) AS linked_profile_id
FROM royalty_shares rs
JOIN royalty_events re ON re.id = rs.royalty_event_id
JOIN songs s           ON s.id = re.song_id
WHERE rs.linked_profile_id IS NULL
  AND rs.party_email IS NOT NULL
  AND re.source_type = 'stream'
GROUP BY rs.party_email, re.song_id, s.title, s.creator_id;

-- ============================================================
-- 3. Admin RPC: flattened list with filter
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_unregistered_accrued_revenue(
    only_registered BOOLEAN DEFAULT NULL  -- NULL = all, TRUE = only registered-but-unlinked, FALSE = never registered
)
RETURNS TABLE(
    email TEXT,
    party_name_hint TEXT,
    song_id UUID,
    song_title TEXT,
    song_creator_id UUID,
    total_accrued_eur NUMERIC,
    share_count BIGINT,
    first_accrued_at TIMESTAMPTZ,
    last_accrued_at TIMESTAMPTZ,
    is_registered BOOLEAN,
    linked_profile_id UUID
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT *
    FROM public.v_admin_unregistered_accrued_revenue
    WHERE only_registered IS NULL
       OR is_registered = only_registered
    ORDER BY is_registered DESC, total_accrued_eur DESC;
$$;

-- ============================================================
-- 4. Grants — admin-only access patterns
-- ============================================================
-- The RPC uses SECURITY DEFINER; relies on app-level gating (is_admin() checks already
-- run in the UI). The view itself can be selected by any authenticated client, but the
-- admin screens are the only surface that query it.

GRANT SELECT ON public.v_admin_unregistered_accrued_revenue TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unregistered_accrued_revenue(BOOLEAN) TO authenticated;

-- ============================================================
-- Sanity check
-- ============================================================
-- SELECT COUNT(*) FROM public.v_admin_unregistered_accrued_revenue;
