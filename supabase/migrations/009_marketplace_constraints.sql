-- 009: Marketplace listing constraints
-- Adds cancelled_at column and prevents duplicate active listings per NFT token.

DO $$ BEGIN
    ALTER TABLE marketplace_listings ADD COLUMN cancelled_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Prevent duplicate active listings for the same NFT token
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_listings_active_token
    ON marketplace_listings (nft_token_id)
    WHERE (is_active = TRUE);

-- Fast lookup: seller's active listings
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller_active
    ON marketplace_listings (seller_wallet, is_active)
    WHERE (is_active = TRUE);
