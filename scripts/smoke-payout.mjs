// Smoke test: Use thirdweb privateKeyToAccount (same as client) to sign
// a "MU6 Payout List" message and call the payout-list edge function.
// This verifies the canonical message format matches the server exactly.
//
// Run from MU6-Final/ root: node scripts/smoke-payout.mjs

import { createThirdwebClient } from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";

const CLIENT_ID = "64c9d6a04c2edcf1c8b117db980edd41";
const PK = "0x1b16c5162403e3f5433e92dfbd745b887f243097bccc1b41827c10b554e5ec40";
const ARTIST_PROFILE_ID = "11111111-1111-1111-1111-aaaaaaaaaaaa";
const SUPABASE_URL = "https://ukavmvxelsfdfktiiyvg.supabase.co";
const SUPABASE_ANON = "sb_publishable_wL9HMvfWm4JZiSMuPI_mEw_P2Etx1D1";

const client = createThirdwebClient({ clientId: CLIENT_ID });
const account = privateKeyToAccount({ client, privateKey: PK });
console.log("Signer:", account.address);

// Test 1: payout-list (signed user path)
async function testPayoutList() {
    const issuedAt = Date.now();
    const nonce = crypto.randomUUID();
    const message =
        "MU6 Payout List\n" +
        `profileId: ${ARTIST_PROFILE_ID}\n` +
        `issuedAt: ${issuedAt}\n` +
        `nonce: ${nonce}`;

    const signature = await account.signMessage({ message });
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/payout-list`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({
            profileId: ARTIST_PROFILE_ID,
            signature,
            signerAddress: account.address,
            issuedAt,
            nonce,
        }),
    });
    const body = await resp.text();
    console.log(`\n[payout-list] HTTP ${resp.status}`);
    console.log(body);
    return resp.status === 200;
}

// Test 2: get-audio-url (path validation only; anon can hit it)
async function testGetAudioUrl() {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/get-audio-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ path: "test/does-not-exist.mp3", expiresIn: 60 }),
    });
    const body = await resp.text();
    console.log(`\n[get-audio-url] HTTP ${resp.status}`);
    console.log(body);
    // 200 (signed URL even if file missing) or 404 (file missing) both acceptable
    return resp.status === 200 || resp.status === 404;
}

const r1 = await testPayoutList();
const r2 = await testGetAudioUrl();
console.log("\n=== Summary ===");
console.log("payout-list signed path:", r1 ? "PASS" : "FAIL");
console.log("get-audio-url reachable:", r2 ? "PASS" : "FAIL");
