-- 013_split_sheet_overhaul.sql
-- Fixes split_role enum mismatch and adds email lookup, invitations, and auto-linking

-- ═══════════════════════════════════════════════════
-- 1. Fix split_role enum — add missing values
-- ═══════════════════════════════════════════════════
ALTER TYPE split_role ADD VALUE IF NOT EXISTS 'songwriter';
ALTER TYPE split_role ADD VALUE IF NOT EXISTS 'publisher';
ALTER TYPE split_role ADD VALUE IF NOT EXISTS 'featured';

-- ═══════════════════════════════════════════════════
-- 2. Email lookup RPC (SECURITY DEFINER bypasses RLS)
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.lookup_profile_by_email(target_email TEXT)
RETURNS TABLE(id UUID, display_name TEXT, wallet_address TEXT)
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.display_name, p.wallet_address
    FROM profiles p
    WHERE p.email = lower(trim(target_email))
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════
-- 3. Split invitations table
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS split_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    inviter_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    invitee_email TEXT NOT NULL,
    invitee_name TEXT,
    role split_role NOT NULL DEFAULT 'other',
    share_percent NUMERIC(5,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
    invite_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days'
);

ALTER TABLE split_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invite_select ON split_invitations FOR SELECT USING (
    inviter_profile_id = auth.uid() OR is_admin()
);
CREATE POLICY invite_insert ON split_invitations FOR INSERT WITH CHECK (
    inviter_profile_id = auth.uid() OR is_admin()
);

-- ═══════════════════════════════════════════════════
-- 4. Auto-link trigger: when a new user registers,
--    link any pending splits/invitations by email
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_link_split_invitations()
RETURNS TRIGGER AS $$
BEGIN
    -- Update split entries where email matches
    UPDATE song_rights_splits
    SET linked_profile_id = NEW.id,
        linked_wallet_address = NEW.wallet_address
    WHERE party_email = NEW.email
      AND linked_profile_id IS NULL;

    -- Mark invitations as accepted
    UPDATE split_invitations
    SET status = 'accepted'
    WHERE invitee_email = NEW.email
      AND status = 'pending';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to avoid duplicate trigger
DROP TRIGGER IF EXISTS trg_auto_link_splits_on_signup ON profiles;

CREATE TRIGGER trg_auto_link_splits_on_signup
    AFTER INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION auto_link_split_invitations();
