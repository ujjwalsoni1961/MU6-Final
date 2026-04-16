-- 020: NFT Enhancements
-- Adds description, custom cover image, and benefits fields to nft_releases
-- for the NFT creation and detail page overhaul.

ALTER TABLE nft_releases ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE nft_releases ADD COLUMN IF NOT EXISTS cover_image_path TEXT;
ALTER TABLE nft_releases ADD COLUMN IF NOT EXISTS benefits JSONB DEFAULT '[]';
