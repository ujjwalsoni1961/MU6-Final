-- ============================================================
-- Migration: Admin Controls — Add columns for admin actions
-- ============================================================

-- PROFILES: add is_active and is_blocked for account management
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;

-- SONGS: add is_listed and is_featured for content moderation
ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_listed   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

-- NFT TOKENS: add is_voided for admin override on problematic tokens
ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS is_voided BOOLEAN NOT NULL DEFAULT false;

-- TRANSACTIONS (marketplace_listings): add is_flagged for suspicious activity
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- RLS policies for admin mutations
-- ============================================================

-- Allow admins to update profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_profiles' AND tablename = 'profiles'
  ) THEN
    CREATE POLICY admin_update_profiles ON profiles FOR UPDATE USING (is_admin());
  END IF;
END $$;

-- Allow admins to delete profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_delete_profiles' AND tablename = 'profiles'
  ) THEN
    CREATE POLICY admin_delete_profiles ON profiles FOR DELETE USING (is_admin());
  END IF;
END $$;

-- Allow admins to update songs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_songs' AND tablename = 'songs'
  ) THEN
    CREATE POLICY admin_update_songs ON songs FOR UPDATE USING (is_admin());
  END IF;
END $$;

-- Allow admins to delete songs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_delete_songs' AND tablename = 'songs'
  ) THEN
    CREATE POLICY admin_delete_songs ON songs FOR DELETE USING (is_admin());
  END IF;
END $$;

-- Allow admins to update nft_releases
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_nft_releases' AND tablename = 'nft_releases'
  ) THEN
    CREATE POLICY admin_update_nft_releases ON nft_releases FOR UPDATE USING (is_admin());
  END IF;
END $$;

-- Allow admins to update nft_tokens
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_nft_tokens' AND tablename = 'nft_tokens'
  ) THEN
    CREATE POLICY admin_update_nft_tokens ON nft_tokens FOR UPDATE USING (is_admin());
  END IF;
END $$;

-- Allow admins to update marketplace_listings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_marketplace' AND tablename = 'marketplace_listings'
  ) THEN
    CREATE POLICY admin_update_marketplace ON marketplace_listings FOR UPDATE USING (is_admin());
  END IF;
END $$;

-- Allow admins to update payout_requests
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_payouts' AND tablename = 'payout_requests'
  ) THEN
    CREATE POLICY admin_update_payouts ON payout_requests FOR UPDATE USING (is_admin());
  END IF;
END $$;

-- Allow admins to insert notifications (for broadcast)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_insert_notifications' AND tablename = 'notifications'
  ) THEN
    CREATE POLICY admin_insert_notifications ON notifications FOR INSERT WITH CHECK (is_admin());
  END IF;
END $$;

-- Allow admins to insert audit log entries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_insert_audit_log' AND tablename = 'admin_audit_log'
  ) THEN
    CREATE POLICY admin_insert_audit_log ON admin_audit_log FOR INSERT WITH CHECK (is_admin());
  END IF;
END $$;
