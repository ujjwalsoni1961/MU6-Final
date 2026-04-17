-- Fix NFT benefits that were previously stored double-encoded (JSON string inside JSONB column).
-- Root cause: src/services/blockchain.ts used JSON.stringify() when inserting benefits, which the
-- supabase-js client then re-encoded, resulting in a JSON string value instead of a JSONB array.
--
-- Strategy:
--   * Rows where benefits is stored as a JSON string (jsonb_typeof = 'string') are re-parsed into
--     their intended JSONB array structure.
--   * Rows where benefits is NULL or already a proper array are left untouched.
--
-- This migration is idempotent — it can be run repeatedly without damage.

BEGIN;

UPDATE nft_releases
SET benefits = (benefits #>> '{}')::jsonb
WHERE benefits IS NOT NULL
  AND jsonb_typeof(benefits) = 'string';

COMMIT;
