-- 018_fix_auto_link_trigger.sql
-- Fix: auto_link_split_invitations trigger must fire on UPDATE (email added later)
-- Fix: case-insensitive email matching

-- ═══════════════════════════════════════════════════
-- 1. Replace trigger function with case-insensitive matching
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_link_split_invitations()
RETURNS TRIGGER AS $$
BEGIN
    -- Only proceed if email is set
    IF NEW.email IS NULL OR NEW.email = '' THEN
        RETURN NEW;
    END IF;

    -- On UPDATE, skip if email hasn't changed
    IF TG_OP = 'UPDATE' THEN
        IF OLD.email IS NOT DISTINCT FROM NEW.email THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Update split entries where email matches (case-insensitive)
    UPDATE song_rights_splits
    SET linked_profile_id = NEW.id,
        linked_wallet_address = NEW.wallet_address
    WHERE lower(trim(party_email)) = lower(trim(NEW.email))
      AND linked_profile_id IS NULL;

    -- Mark invitations as accepted (case-insensitive)
    UPDATE split_invitations
    SET status = 'accepted'
    WHERE lower(trim(invitee_email)) = lower(trim(NEW.email))
      AND status = 'pending';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════
-- 2. Recreate trigger to fire on both INSERT and UPDATE
-- ═══════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_auto_link_splits_on_signup ON profiles;

CREATE TRIGGER trg_auto_link_splits_on_signup
    AFTER INSERT OR UPDATE OF email ON profiles
    FOR EACH ROW EXECUTE FUNCTION auto_link_split_invitations();
