# MU6 Path B Implementation Spec — ERC-1155 shared contract + secondary sync

## Deployment
- **New contract (Amoy)**: `0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad` (DropERC1155)
- **Legacy contract (Amoy)**: `0xACF1145AdE250D356e1B2869E392e6c748c14C0E` (DropERC721, keep as legacy-only)
- **MarketplaceV3 (Amoy)**: `0x141Fc79b7F1EB7b393A5DC5f257678c3cD30506a`
- **Server wallet**: `0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39`
- **Admin wallet**: `0x44ff5d342d5e5e0438ce06878d9e69470c1d95e4`
- **Chain ID**: 80002 (Polygon Amoy testnet)
- **RPC**: `https://80002.rpc.thirdweb.com/64c9d6a04c2edcf1c8b117db980edd41`

## Verified on-chain state of new contract
- name: `MU6 Music Collection`
- symbol: `MU6`
- primarySaleRecipient: server wallet ✅
- getDefaultRoyaltyInfo: server wallet, 500 bps (5%) ✅
- getPlatformFeeInfo: `0x1Af20C6B...` (thirdweb deployer-fee wallet), 200 bps (2%) — hardcoded, cannot change
- owner: admin wallet ✅

## Fee Economics (confirmed: Option A)
- Thirdweb fee: **2%** (hardcoded, goes to `0x1Af20C6B...`)
- MU6 fee: **5%** (configurable, goes to server wallet)
- Artist net: **93%** of gross

Note: Old code assumed thirdweb 50 bps. New default constant `THIRDWEB_DROP_FEE_BPS = 200`.

## Mainnet-readiness requirement
- All contract addresses from DB, never hardcoded in new code paths
- CHAIN_ID / RPC_URL already env-driven — keep that pattern
- NETWORK env flag switches testnet/mainnet

## Phases

### Phase 1: DB migrations (034-037)
1. **034** — nft_releases ERC-1155 fields:
   - `token_id BIGINT` (on-chain token id — nullable until lazy-minted)
   - `nft_standard TEXT DEFAULT 'erc1155'` (check: 'erc721'|'erc1155')
   - `max_supply NUMERIC` (maps to claim condition maxClaimableSupply)
   - `price_wei NUMERIC(78,0)` (on-chain source of truth, not price_eth/price_token)
   - `currency_address TEXT DEFAULT '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'`
   - `thirdweb_fee_bps INTEGER DEFAULT 200` (new — was implicit 50)
   - Unique: (contract_address, chain_id, token_id) WHERE token_id IS NOT NULL
   - Backfill existing rows: mark as nft_standard='erc721' with legacy contract

2. **035** — profiles royalty config:
   - `royalty_bps INTEGER DEFAULT 500` (0..1000 check)
   - `royalty_recipient_wallet TEXT` (nullable — falls back to payout_wallet_address)
   - Trigger to validate 0 <= royalty_bps <= 1000

3. **036** — unified sales history:
   - Table `nft_sales_history` with marketplace enum
   - Enum: mu6_marketplace, opensea, blur, direct_transfer, unknown
   - Indices on (contract_address, token_id, block_number DESC) and (tx_hash)

4. **037** — ownership sync state:
   - Table `nft_token_owners` (contract, token_id, owner, balance, last_block)
   - Table `nft_sync_state` (contract, chain_id, last_synced_block, last_synced_at)
   - Unique: (contract, token_id, owner)

### Phase 2: Edge function on-chain actions
Add to `nft-admin` edge function:
- `setClaimConditionForToken(tokenId, pricePerToken, maxClaimableSupply, currency)` — calls `setClaimConditions(uint256,(uint256,uint256,uint256,uint256,bytes32,uint256,address)[],bool)` on DropERC1155 for a specific tokenId
- `setRoyaltyInfoForToken(tokenId, recipient, bps)` — calls `setRoyaltyInfoForToken(uint256,address,uint256)`
- `setDefaultRoyaltyInfo(recipient, bps)` — already may exist; update if needed
- `setMarketplacePlatformFee(recipient, bps)` — calls `setPlatformFeeInfo` on MarketplaceV3
- `verifyContractConfig` — readback of all three: platform fee, royalty, primary sale recipient. Returns unified JSON.

### Phase 3: Claim/primary sale flow refactor
- `serverClaim` now takes `{release_id, quantity, buyer_wallet}` → reads contract_address+token_id from nft_releases → routes:
  - if nft_standard='erc1155' → DropERC1155 claim ABI
  - if nft_standard='erc721' → legacy DropERC721 flow (keep working for back-compat)
- New DropERC1155 claim signature:
  ```
  claim(address receiver, uint256 tokenId, uint256 quantity, address currency, uint256 pricePerToken, (bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) allowlistProof, bytes data)
  ```
- `splitPrimarySale(grossWei)` updated: `thirdwebFeeWei = grossWei * 200 / 10000`, `platformWei = grossWei * 500 / 10000`, `artistWei = grossWei - thirdwebFeeWei - platformWei`
- `forwardPrimarySalePayout`: logic unchanged at the flow level (server wallet receives `grossWei - thirdwebFeeWei` after claim, keeps `platformWei`, forwards `artistWei` to artist payout wallet), but update THIRDWEB_DROP_FEE_BPS constant to 200
- Self-healing `nft_tokens` insert must work for ERC-1155: for 1155, token_id is fixed (per release), but we mint `quantity` copies — existing `nft_tokens` row-per-copy model still works as ledger

### Phase 4: Secondary sync layer

**4A — Transfer event indexer** (edge action `syncTransfers`, cron every 5 min)
- Read `nft_sync_state.last_synced_block` for contract
- RPC `eth_getLogs` for TransferSingle topic `0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62` and TransferBatch topic `0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb` from last_block+1 to head, chunked 2000 blocks
- Decode each log, upsert `nft_token_owners` (decrement from `from`, increment to `to`), insert `nft_sales_history` row with marketplace='unknown'
- Update `last_synced_block`

**4B — Marketplace enrichers** (cron every 10 min)
- `enrichMu6MarketplaceSales`: read MarketplaceV3 `NewSale` and `NewAuctionBid` events, match by tx_hash to sales_history rows, update marketplace='mu6_marketplace', price_wei
- `enrichOpenseaSales`: call OpenSea API `/api/v2/events/chain/amoy/contract/{contract}` filtered by event_type=sale, match by tx_hash, update marketplace='opensea'. Require `OPENSEA_API_KEY` env (will skip gracefully if not set).

**4C — Collection stats materialized view**
- `mv_nft_collection_stats`: total_volume_wei, volume_by_marketplace JSON, unique_holders, floor_price_wei (from MarketplaceV3 active listings)
- Refresh cron every 15 min

**4D — pg_cron jobs**
- `mu6_sync_transfers` every 5 min
- `mu6_enrich_marketplace` every 10 min
- `mu6_refresh_stats` every 15 min
- `mu6_server_wallet_low_balance_alert` daily (check balance < 0.5 POL)
- Reuse existing `mu6_primary_sale_payouts_sweep` at `7 * * * *`

### Phase 5: Client updates (minimal, UI-preserving)
- `src/lib/nft/claim.ts` — reads contract from release, handles both ERC-721 and ERC-1155
- Collection page reads from `nft_token_owners` + `nft_sales_history`
- Artist profile page — royalty settings form (royalty_bps slider 0-10%, royalty_recipient_wallet input)

### Phase 6: Admin + monitoring
- `/admin/nft-health` page adds:
  - Sync lag (head block - last_synced_block)
  - Pending payouts count + oldest failed payout
  - Server wallet balance
  - Per-release revenue breakdown (gross, thirdweb, MU6, artist paid)

### Phase 7: E2E + commit
- Script: create test release for artist A at 1 POL, artist B at 2 POL, simulate claim, verify on-chain balances
- Typecheck: `cd /home/user/workspace/MU6-Final && npm run typecheck` (or equivalent)
- Commit + push via PAT

## Constants to update in edge function
```ts
export const THIRDWEB_DROP_FEE_BPS = 200; // was 50
export const PLATFORM_FEE_BPS_PRIMARY = 500; // unchanged — MU6 5%
export const DEFAULT_ARTIST_ROYALTY_BPS = 500; // secondary royalty default
export const DROP_ERC1155_CONTRACT_DEFAULT = "0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad"; // testnet only, can be overridden by release.contract_address
```

## Mainnet-ready pattern
- No hardcoded contract addresses in business logic
- All reads go through `nft_releases.contract_address`
- For the one default/fallback, gate behind `Deno.env.get("NETWORK")` switch

## Critical Rules (from user — preserve verbatim)
1. Testnet only (Polygon Amoy 80002) — but make it mainnet-ready
2. Do NOT expose API keys in git
3. On-chain is source of truth
4. "MAKE SURE YOU DO NOT FOUND non-conventional workaround TO SOLVE ISSUES (DO PROPER AND CLEAN WORK)"
5. Use GitHub connector for GitHub URLs (not browser_task)
