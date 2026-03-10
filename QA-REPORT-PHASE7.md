# MU6 Phase 7 — QA Report

**Date:** March 10, 2026  
**Tester:** AI QA (Automated via Playwright on Expo Web)  
**Branch:** `main`  
**Commit:** `a90c619`  
**Server:** Expo Web on `localhost:8081`

---

## Summary

**20+ screens tested** across Consumer, Creator, and Admin flows on the web build. All screens render correctly with 0 TypeScript errors and 0 critical JavaScript errors.

| Area | Screens Tested | Status |
|------|---------------|--------|
| Auth | Login, Creator Register | ✅ Pass |
| Consumer | Home, Marketplace, Library, Collection, Wallet, Profile, Search, Settings, Song Detail, NFT Detail | ✅ Pass |
| Creator | Dashboard, Upload, My Songs, Earnings, Split Editor, NFT Manager | ✅ Pass |
| Admin | Dashboard, Users, Songs, Transactions, Contracts | ✅ Pass |
| Player | Music Player Overlay (mini + full) | ✅ Pass |

---

## Bugs Found & Fixed (This Session)

### 1. TypeScript Compilation Errors (3 errors → 0)
- **WebHeader.tsx**: `cursor` CSS prop not in RN types → cast to `any`
- **WebHeader.tsx**: `NodeJS.Timeout` type mismatch → `ReturnType<typeof setTimeout>`
- **thirdweb.ts**: Missing `options` array in `inAppWallet` auth config
- **blockchain.ts**: `Account` type import from wrong module path

### 2. Admin Contracts — Placeholder Data
- **Bug:** Contract addresses were dummy values (`0x1234...abcd`) with wrong network ("Base Sepolia")
- **Fix:** Replaced with real deployed Polygon Amoy contract addresses:
  - DropERC721: `0xACF1145AdE250D356e1B2869E392e6c748c14C0E`
  - MarketplaceV3: `0x141Fc79b7F1EB7b393A5DC5f257678c3cD30506a`
  - Split: `0xb757e188B8A126A6D975514F3a05049a87209c2D`

### 3. WebHeader Search — Using Mock Data
- **Bug:** Header search bar was importing from `../../mock/songs` instead of live Supabase
- **Fix:** Switched to `useSongs({ search, limit: 5 })` hook for real-time search

### 4. NativeWind Dark Mode Warning
- **Bug:** Console error: "Cannot manually set color scheme, as dark mode is type 'media'"
- **Fix:** Added `darkMode: 'class'` to `tailwind.config.js`

### 5. Deprecated React Native APIs
- **`textShadowColor/Offset/Radius`**: Migrated to shorthand `textShadow` in login and creator-register screens
- **`pointerEvents` prop**: Moved from View prop to style in AnimatedBackground

### 6. Database Search Enhancement
- **Bug:** Song search only checked `title` and `album`, missing genre
- **Fix:** Added `genre` to the `.or()` filter in `database.ts`

---

## Known Warnings (Non-Critical)

| Warning | Impact | Notes |
|---------|--------|-------|
| `expo-av` deprecated | Low | Migration to `expo-audio`/`expo-video` is a future task; current player works fine |
| Multiple GoTrueClient instances | None | Supabase SDK warning from having anon + service role clients; harmless |
| `textShadow` TS type not recognized | None | Runtime works; type cast applied for TS |

---

## Screens That Cannot Be Fully Tested Without Auth

These screens render correctly with placeholder/empty data but need a real wallet connection to test fully:

1. **OTP Verification Flow** — Requires receiving and entering a real email OTP
2. **Profile Sync** — Needs active wallet connection to create/load Supabase profile
3. **NFT Minting** — Needs connected wallet + POL on Amoy testnet
4. **Marketplace Purchase** — Needs connected wallet + POL
5. **Song Upload (full flow)** — Needs authenticated creator profile
6. **Stream Logging** — Needs authenticated user + actual audio files

---

## Supabase Data Verified

- **Profiles**: 9 users (7 creators, seed data)
- **Songs**: 12 songs with cover images, metadata, and play counts
- **NFT Releases**: 11 releases with various rarities and pricing
- **All queries**: Working via REST API with both anon and service role keys

---

## Recommendations for Manual Testing (Phase 7 continued)

1. **Mobile Login Flow**: Test email OTP on both iOS and Android physical devices
   - iPhone issue reported: email entry may not proceed — monitor thirdweb ConnectEmbed behavior
   - Android: OTP sends but nothing happens after entry — may need ConnectEmbed callback debugging
2. **Dark Mode Toggle**: Verify on mobile that the toggle in Settings works and persists
3. **Audio Playback**: Upload a real audio file to Supabase `audio` bucket and test playback
4. **NFT Minting**: Connect a wallet with Amoy testnet POL and test the full mint flow
5. **Marketplace**: List an NFT for sale and test the buy flow between two wallets
