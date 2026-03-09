-- Drop all objects from partially applied migration
-- Tables first (CASCADE drops their triggers, indexes, policies)
DROP TABLE IF EXISTS platform_settings CASCADE;
DROP TABLE IF EXISTS admin_audit_log CASCADE;
DROP TABLE IF EXISTS payout_requests CASCADE;
DROP TABLE IF EXISTS follows CASCADE;
DROP TABLE IF EXISTS likes CASCADE;
DROP TABLE IF EXISTS marketplace_listings CASCADE;
DROP TABLE IF EXISTS royalty_shares CASCADE;
DROP TABLE IF EXISTS royalty_events CASCADE;
DROP TABLE IF EXISTS streams CASCADE;
DROP TABLE IF EXISTS nft_tokens CASCADE;
DROP TABLE IF EXISTS nft_releases CASCADE;
DROP TABLE IF EXISTS song_rights_splits CASCADE;
DROP TABLE IF EXISTS songs CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Functions
DROP FUNCTION IF EXISTS validate_nft_royalty_cap() CASCADE;
DROP FUNCTION IF EXISTS validate_split_sheet_sum() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS increment_plays_on_stream() CASCADE;
DROP FUNCTION IF EXISTS update_likes_count() CASCADE;
DROP FUNCTION IF EXISTS increment_minted_count() CASCADE;
DROP FUNCTION IF EXISTS is_admin() CASCADE;

-- Types
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS creator_type CASCADE;
DROP TYPE IF EXISTS split_role CASCADE;
DROP TYPE IF EXISTS royalty_source_type CASCADE;
DROP TYPE IF EXISTS transaction_status CASCADE;
DROP TYPE IF EXISTS nft_rarity CASCADE;
