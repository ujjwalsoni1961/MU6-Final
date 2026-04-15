-- Migration 016: Business Logic V2
-- Adds token price tracking, split contract support, and platform settings
-- for on-chain primary sales with Split contract distribution.

-- 1. Add split_contract_address to songs
ALTER TABLE songs ADD COLUMN IF NOT EXISTS split_contract_address TEXT;

-- 2. Add token price fields to nft_releases
ALTER TABLE nft_releases ADD COLUMN IF NOT EXISTS price_token NUMERIC;        -- on-chain price in native token (POL)
ALTER TABLE nft_releases ADD COLUMN IF NOT EXISTS price_eur_at_list NUMERIC;  -- EUR snapshot at listing time

-- 3. Add token price fields to nft_tokens (price at time of purchase)
ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS price_paid_token NUMERIC;
ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS price_paid_eur_at_sale NUMERIC;

-- 4. Add token price fields to marketplace_listings
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS price_token NUMERIC;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS price_eur_at_list NUMERIC;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS chain_listing_id TEXT;

-- 5. Add last sale token fields to nft_tokens (for display / analytics)
ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS last_sale_price_token NUMERIC;
ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS last_sale_price_eur NUMERIC;

-- 6. User currency preference
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_currency TEXT DEFAULT 'EUR';

-- 7. Platform settings for marketplace and fees
INSERT INTO platform_settings (key, value) VALUES
  ('marketplace_contract_address', '"0x"')
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings (key, value) VALUES
  ('platform_fee_wallet', '"0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39"')
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings (key, value) VALUES
  ('secondary_sale_artist_royalty_percent', '5')
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings (key, value) VALUES
  ('platform_fee_percent', '5')
ON CONFLICT (key) DO NOTHING;
