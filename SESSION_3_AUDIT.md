# Session 3 Audit — MU6 Path B Client UI

_Generated as part of Session 3: client UI polish for ERC-1155 flow._

---

## Upload / Create Release Flow

**File:** `app/(artist)/nft-manager.tsx`

**Current fields (legacy ERC-721 form):**
- Song picker (selects from creator's uploaded songs)
- Tier name (`tierName` state)
- Rarity: common / rare / legendary (`rarity` state)
- Total supply (`totalSupply`, string → parseInt, 1–10 000)
- Price ETH (`priceEth`, string → parseFloat)
- Description (`description`)
- Cover image (custom, picked via ImagePicker, uploaded to Supabase storage `nft-covers/`)
- Benefits list (`benefits[]`)

**Submit path:** calls `createRelease.execute()` → `blockchain.createNFTRelease(config, account)` in `src/services/blockchain.ts`.

**Missing for ERC-1155:** `nft_standard`, `price_wei`, `max_supply`, `start_time`, on-chain lazy-mint + setClaimCondition + setRoyalty steps.

---

## Release Detail Page

**File:** `app/(consumer)/nft-detail.tsx`

**Rendering:**
- Uses `useNFTReleaseById(id)`, `useNFTTokenById(id)`, `useMarketplaceListings()`
- Price: displayed from `nft.price` (DB-derived, via `adaptNFT` in `useData.ts`)
- Claim state: not shown on-chain — shown from DB only (total supply, minted count)
- `useOnChainOwnership(tokenId)` reads ERC-721 `ownerOf`; no ERC-1155 balance read

**Missing for ERC-1155:**
- On-chain claim condition display (price, remaining supply)
- Your ERC-1155 balance
- Secondary market section (nft_sales_history + OpenSea link)

---

## Buy Button

**File:** `app/(consumer)/nft-detail.tsx` — `handleMint()` function

**Current flow:**
```
handleMint → mintHook.execute(nft.id, walletAddress) → blockchain.mintToken(releaseId, buyerWallet)
→ nft-admin edge function { action: 'serverClaim', release_id, receiverAddress }
```

Edge function `serverClaim` already routes by `nft_standard` (sessions 1 & 2):
- `erc1155`: reads `token_id` + `contract_address` from `nft_releases` row, calls DropERC1155 claim ABI
- `erc721`: legacy path

**No client change needed for routing** — client still passes `release_id` and the edge function handles the rest.

**Missing:**
- On-chain price display (from claim condition, not DB)
- Supply remaining display (from claim condition)
- ERC-1155 holder balance display

---

## Styling Convention

- **No Tailwind/NativeWind utility classes** in screen files — all inline `StyleSheet` objects or bare JS style objects.
- Color tokens come from `useTheme()` → `{ isDark, colors }` where `colors.text.primary`, `colors.text.secondary`, `colors.bg.base` etc.
- Accent color: `#38b4ba` (teal) for primary CTAs; `#8b5cf6` (purple) for NFT-related actions.
- Platform branching: `const isWeb = Platform.OS === 'web'`; `const isAndroid = Platform.OS === 'android'`.
- Card bg pattern: `isDark ? 'rgba(255,255,255,0.08)' : '#fff'` (with Android variant).
- Border pattern: `isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'`.
- Use `AnimatedPressable` (from `src/components/shared/AnimatedPressable.tsx`) with `preset="button"` or `preset="icon"`.
- Form inputs: `TextInput` with inline style matching `inputStyle` pattern (borderRadius 12, padding 14).
- Shared form components in `src/components/form/` (FormField, SelectField, TextFormInput, RadioGroup, CheckboxField).
- Spacing: `SafeAreaView` on native, `View` on web for Container; `KeyboardAvoidingView` for forms.

---

## Key Constants

| Item | Value |
|------|-------|
| New DropERC1155 | `0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad` |
| Legacy DropERC721 | `0xACF1145AdE250D356e1B2869E392e6c748c14C0E` |
| Chain ID (Amoy) | `80002` |
| Env flag: ERC-1155 addr | `EXPO_PUBLIC_SONG_NFT_ERC1155_ADDRESS` |
| Edge fn: lazyMint | already exists — takes `{amount, baseURI, contractAddress}` |
| Edge fn: setClaimConditionForToken | exists — takes `{tokenId, pricePerToken, maxClaimableSupply, currency, contractAddress}` |
| Edge fn: setRoyaltyInfoForToken | exists — takes `{tokenId, recipient, bps, contractAddress}` |

---

## lazyMint current limitation

The existing `lazyMint` action in `nft-admin` does **not** return the newly minted `token_id` from the `TokensLazyMinted` event — it only returns `transactionId`. Session 3 will:
1. After `lazyMint` confirms, parse the next available token_id by reading `nextTokenIdToMint - amount` from the confirmed tx or via eth_call `nextTokenIdToMint()`.
2. Or: call `nextTokenIdToMint()` *before* lazyMinting, which is guaranteed to be the first token_id that will be assigned.

Plan: read `nextTokenIdToMint` before lazy-minting (via RPC eth_call on the ERC-1155 contract), use that as `token_id`, then lazy-mint. This is safe because the server wallet is the only authorized minter.
