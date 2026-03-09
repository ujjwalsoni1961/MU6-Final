-- ============================================================
-- MU6 – Switch chain from Base Sepolia (84532) to Polygon Amoy (80002)
-- ============================================================

-- Update default chain_id for new NFT releases
ALTER TABLE nft_releases
  ALTER COLUMN chain_id SET DEFAULT '80002';

-- Update any existing rows that had 84532
UPDATE nft_releases SET chain_id = '80002' WHERE chain_id = '84532';

-- Update seed data contract addresses if they had placeholders
-- (The real deployed addresses on Polygon Amoy)
UPDATE nft_releases
SET contract_address = '0xACF1145AdE250D356e1B2869E392e6c748c14C0E'
WHERE contract_address IS NULL OR contract_address = '';
