# MU6 Pragmatic Hardening — Single-Session Plan

Generated for the tomorrow-deliver push. Scope confirmed by user:
- Pragmatic testnet hardening (close all 5 audit criticals)
- Env-gated Thirdweb privateKey E2E login for artist / user1 / user2
- Light DRM only (60s signed audio URLs)

## Fixes

### SEC-01 — profiles_update `USING(true)` lockdown
**Migration 043_harden_profiles_rls.sql**
- Drop open `profiles_update` policy.
- New policy: `USING(true) WITH CHECK(true)` BUT with a BEFORE UPDATE trigger that blocks client-originated changes to the sensitive columns unless the session is `service_role`:
  - `role`, `is_admin`, `is_blocked`, `is_active`, `wallet_address`, `id`, `email` (email goes through auth.users)
- Same trigger blocks edits to `payout_bank_details_json` when called outside service_role.
- Reasoning: RLS alone can't do column-level permission cleanly in Thirdweb-auth mode because `auth.uid()` is NULL. A trigger that inspects `current_setting('role') = 'service_role'` achieves per-column restriction without a full SIWE refactor.

### SEC-02 — admin-action edge fn requires admin secret header
- Add `MU6_ADMIN_SECRET` env var (server-only).
- Verify `x-mu6-admin-secret` HTTP header equals env, via constant-time compare.
- Keep `profileId: 'superadmin'` body shape unchanged so the client doesn't break.
- Add allowlist of (table, action) pairs to constrain blast radius.
- Write audit_log row for every call.

### SEC-03 — nft-admin edge fn: admin secret for admin-only actions
- Same `MU6_ADMIN_SECRET` header.
- Actions split into 3 tiers:
  - **User-initiated (open w/ rate limit):** `serverClaim`, `getTxStatus`.
  - **Artist-initiated (requires wallet sig binding caller to artist-owned release):** `lazyMint`.
  - **Admin-only (requires admin secret):** everything else including `setClaimConditionForToken`, `setRoyalty*`, `setPrimarySaleRecipient`, `setPlatformFee`, `deploySplit`, `deployMarketplace`, `transferFunds`, `retry/sweepPrimarySalePayouts`, `setMarketplacePlatformFee`, `syncTransfers`, `enrichMu6MarketplaceSales`, `enrichOpenseaSales`, `refreshCollectionStats`, `verifyContractConfig`.
- verifyAuth stays as the outer gate (Supabase ingress).

### SEC-04 — payout-request EIP-191 wallet sig
- Client signs `MU6 payout request\nprofileId:<id>\namountEur:<n>\nnonce:<uuid>\nissued:<iso>` with the active wallet.
- Edge fn verifies signature (recover address, compare to profile.wallet_address).
- Enforces server-side: amount ≤ available balance.
- Writes audit row with signer address + raw body.

### SEC-05 — Audio signed URLs
- New edge fn `get-audio-url`: input `{ audioPath, wallet?, signature? }`. For testnet demo, only verifies caller is `authenticated` (any wallet user), returns 60s signed URL.
- New migration 044 drops the `Authenticated users read audio` SELECT policy on audio bucket.
- Client: `db.getAudioUrl(path)` switched to call this edge fn.

### SEC-09 — CORS allowlist (quick win)
- CORS_HEADERS helper: reflect origin only if in allowlist (`mu6.app`, `*.vercel.app`, `localhost:*`, `exp://*`).

### E2E login — Thirdweb privateKey
- New `app/(auth)/e2e-login.tsx`: shown only when `EXPO_PUBLIC_E2E_MODE === 'true'`.
- Three buttons: test-artist / test-user-1 / test-user-2.
- Use `privateKeyToAccount` from `thirdweb/wallets`, construct a `smartAccount` OR direct privateKey sign. Then call `connect` on an inAppWallet with a privateKey strategy.
- Link from main login as a subtle "DEV: Test Accounts" button shown only in E2E mode.
- Env vars set in Vercel preview env only: `EXPO_PUBLIC_E2E_MODE=true`, `EXPO_PUBLIC_E2E_TEST_KEY_ARTIST`, `..._USER1`, `..._USER2`.

### Seed test profiles
- INSERT into `profiles` with role='creator' for artist wallet, role='listener' for user1/user2.
- Do via migration 045 (idempotent ON CONFLICT DO NOTHING).

## Deployment sequence
1. Write all code.
2. Connect Supabase connector (await user).
3. Push migrations 043, 044, 045.
4. Set edge-fn secrets (`MU6_ADMIN_SECRET`).
5. Deploy edge functions (admin-action, payout-request, payout-list, nft-admin, get-audio-url).
6. Set Vercel env vars for E2E wallets.
7. Rebuild web app.
8. Deploy prod.
9. Test all 3 wallets + admin end-to-end.
