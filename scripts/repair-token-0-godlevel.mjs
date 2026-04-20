#!/usr/bin/env node
/**
 * Repair GOD Level token 0 — pin real metadata + updateBatchBaseURI(0).
 *
 * This is an operational script, NOT part of the build. It reads secrets
 * from env vars only; nothing sensitive is hardcoded.
 *
 * Env required:
 *   SUPABASE_SECRET              — service-role key for `covers` download
 *   SUPABASE_ANON_KEY            — anon/publishable key for edge fn auth
 *   EXPO_PUBLIC_ADMIN_SECRET     — MU6 admin secret for nft-admin
 *
 * Flow:
 *   1. Download the Bairan song cover from Supabase Storage.
 *   2. Pin cover + metadata JSON (named "0") via thirdweb IPFS.
 *   3. POST `updateBatchBaseURI` to nft-admin edge function.
 *   4. Read `uri(0)` post-tx and fetch the JSON to confirm.
 */
import { createThirdwebClient } from 'thirdweb';
import { upload } from 'thirdweb/storage';

const SUPABASE_URL = 'https://ukavmvxelsfdfktiiyvg.supabase.co';
const SUPABASE_SECRET = process.env.SUPABASE_SECRET;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_SECRET = process.env.EXPO_PUBLIC_ADMIN_SECRET;

if (!SUPABASE_SECRET || !SUPABASE_ANON_KEY || !ADMIN_SECRET) {
  console.error('Missing env: SUPABASE_SECRET, SUPABASE_ANON_KEY, EXPO_PUBLIC_ADMIN_SECRET');
  process.exit(1);
}

const THIRDWEB_CLIENT_ID = '64c9d6a04c2edcf1c8b117db980edd41';
const CONTRACT = '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad';
const RPC = `https://80002.rpc.thirdweb.com/${THIRDWEB_CLIENT_ID}`;
const COVER_PATH = 'd1ae5b49-6ea5-4f8f-b7be-2c02f2192094/1774449398890-cover.jpg';
const TOKEN_ID = '0';
const BATCH_INDEX = '0';

const client = createThirdwebClient({ clientId: THIRDWEB_CLIENT_ID });

async function main() {
  // --- Step 1: pull cover JPEG ---
  console.log('[1] downloading cover from Supabase storage…');
  const coverResp = await fetch(
    `${SUPABASE_URL}/storage/v1/object/public/covers/${COVER_PATH}`,
  );
  if (!coverResp.ok) throw new Error(`cover fetch ${coverResp.status}`);
  const coverBuf = Buffer.from(await coverResp.arrayBuffer());
  console.log(`    got ${coverBuf.length} bytes`);

  // --- Step 2: pin cover JPEG ---
  console.log('[2] pinning cover JPEG to IPFS…');
  const coverFile = new File([coverBuf], 'cover.jpg', { type: 'image/jpeg' });
  const coverUri = await upload({ client, files: [coverFile] });
  console.log('    cover pinned:', coverUri);

  // --- Step 3: build metadata ---
  const metadata = {
    name: 'Bairan — GOD Level',
    description:
      'Official MU6 music NFT: "Bairan" by Space. Tier: GOD Level. Holders receive on-chain proof of ownership plus the benefits listed.',
    image: coverUri,
    external_url:
      'https://mu6-final.vercel.app/song/a1b86cab-65d8-4925-87b5-c7b44d610af0',
    attributes: [
      { trait_type: 'Artist', value: 'Space' },
      { trait_type: 'Tier', value: 'GOD Level' },
      { trait_type: 'Rarity', value: 'Common' },
      { trait_type: 'Genre', value: 'Pop' },
      { trait_type: 'Edition size', display_type: 'number', value: 5 },
      { trait_type: 'Price (POL)', display_type: 'number', value: 0.001 },
    ],
    properties: {
      songId: 'a1b86cab-65d8-4925-87b5-c7b44d610af0',
      releaseDate: '2026-03-15',
      benefits: [],
      mu6: {
        platform: 'MU6',
        tierName: 'GOD Level',
        rarity: 'common',
      },
    },
  };

  console.log('[3] pinning metadata JSON as file named "0"…');
  const jsonText = JSON.stringify(metadata, null, 2);
  const jsonFile = new File([jsonText], TOKEN_ID, {
    type: 'application/json',
  });
  const jsonUri = await upload({ client, files: [jsonFile] });
  console.log('    JSON pinned at:', jsonUri);
  if (!jsonUri.endsWith(`/${TOKEN_ID}`)) {
    throw new Error(`Unexpected JSON URI: ${jsonUri}`);
  }
  const baseURI = jsonUri.replace(/\/[^/]+$/, '/');
  console.log('    baseURI for batch:', baseURI);

  // --- Step 4: call updateBatchBaseURI via edge fn ---
  console.log(
    `[4] calling nft-admin.updateBatchBaseURI batchIndex=${BATCH_INDEX}…`,
  );
  const edgeResp = await fetch(`${SUPABASE_URL}/functions/v1/nft-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'x-mu6-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({
      action: 'updateBatchBaseURI',
      contractAddress: CONTRACT,
      index: BATCH_INDEX,
      baseURI,
    }),
  });
  const edgeJson = await edgeResp.json();
  console.log('    edge fn response:', JSON.stringify(edgeJson, null, 2));
  if (!edgeResp.ok || !edgeJson?.success) {
    throw new Error(`updateBatchBaseURI failed: ${edgeJson?.error || edgeResp.status}`);
  }

  // --- Step 5: verify on-chain ---
  console.log('[5] reading uri(0) from chain…');
  const idHex = '0'.padStart(64, '0');
  const callResp = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: CONTRACT, data: '0x0e89341c' + idHex }, 'latest'],
    }),
  });
  const callJson = await callResp.json();
  const r = callJson.result;
  const offset = parseInt(r.slice(2, 66), 16);
  const len = parseInt(r.slice(2 + offset * 2, 2 + offset * 2 + 64), 16);
  const hexStr = r.slice(2 + offset * 2 + 64, 2 + offset * 2 + 64 + len * 2);
  const chainUri = Buffer.from(hexStr, 'hex').toString('utf8');
  console.log('    on-chain uri(0):', chainUri);

  const gw = chainUri.replace('ipfs://', 'https://ipfs.io/ipfs/');
  const jsonResp = await fetch(gw);
  const fetched = await jsonResp.json();
  console.log('    IPFS JSON name:', fetched.name);
  console.log('    IPFS JSON image:', fetched.image);

  if (fetched.name !== metadata.name) {
    throw new Error('Chain URI does not resolve to freshly pinned metadata');
  }
  console.log('\n✅ GOD Level token 0 repaired successfully.');
  console.log('   Thirdweb dashboard + OpenSea will now reflect real metadata.');
}

main().catch((err) => {
  console.error('\n❌ Repair failed:', err.message || err);
  process.exit(1);
});
