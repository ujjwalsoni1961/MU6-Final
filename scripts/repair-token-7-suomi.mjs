#!/usr/bin/env node
/**
 * Repair SUOMI token 7 — re-pin metadata as file "7" + updateBatchBaseURI(7).
 *
 * Root cause (on-chain evidence):
 *   token 7 lazyMint tx 0x71dfb88e…0552 emitted
 *     baseURI = ipfs://QmeZP7Ak6Cx98zEbakwGf1mGPFxoCgw6ZNXcuBcDuiQaxf/0
 *   (note: ends with `/0`, NOT `/`). Contract computes
 *     uri(7) = baseURI + "7" = ipfs://<cid>/07 → 404
 *   Meanwhile the pinned CID actually has a file named "0" with the
 *   correct SUOMI metadata (Bairan — SUOMI).
 *
 * Why it happened:
 *   The user's browser was serving a stale (pre-fix) JS bundle that used
 *   `upload({ files: [metadataJson] })` with a plain object. thirdweb's
 *   `buildFormData` defaults such inputs to filename `${index}` → "0".
 *   The caller then forwarded the returned `ipfs://<cid>/0` as baseURI
 *   to lazyMint, breaking uri(N) for any N != 0.
 *
 * Fix (this script):
 *   1. Fetch the already-correct JSON at ipfs://<oldCid>/0
 *   2. Re-pin it as a file literally named "7" → returns ipfs://<newCid>/7
 *   3. Derive baseURI = ipfs://<newCid>/
 *   4. Call updateBatchBaseURI(index=7, baseURI) via nft-admin edge fn
 *   5. Verify uri(7) resolves to the new JSON
 *
 * Env required:
 *   SUPABASE_ANON_KEY            — anon/publishable key for edge fn auth
 *   EXPO_PUBLIC_ADMIN_SECRET     — MU6 admin secret for nft-admin
 */
import { createThirdwebClient } from 'thirdweb';
import { upload } from 'thirdweb/storage';

const SUPABASE_URL = 'https://ukavmvxelsfdfktiiyvg.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_SECRET = process.env.EXPO_PUBLIC_ADMIN_SECRET;

if (!SUPABASE_ANON_KEY || !ADMIN_SECRET) {
  console.error('Missing env: SUPABASE_ANON_KEY, EXPO_PUBLIC_ADMIN_SECRET');
  process.exit(1);
}

const THIRDWEB_CLIENT_ID = '64c9d6a04c2edcf1c8b117db980edd41';
const CONTRACT = '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad';
const RPC = `https://80002.rpc.thirdweb.com/${THIRDWEB_CLIENT_ID}`;
const OLD_METADATA_URI =
  'ipfs://QmeZP7Ak6Cx98zEbakwGf1mGPFxoCgw6ZNXcuBcDuiQaxf/0';
const TOKEN_ID = '7';
// DropERC1155 uses per-batch indexing. tokens were lazy-minted one at a time,
// so batch index == tokenId for tokens 0..7 on this contract.
const BATCH_INDEX = '7';

const client = createThirdwebClient({ clientId: THIRDWEB_CLIENT_ID });

async function main() {
  // --- 1. pull existing (correct) metadata JSON ---
  console.log('[1] fetching existing metadata from IPFS…');
  const gw = OLD_METADATA_URI.replace('ipfs://', 'https://ipfs.io/ipfs/');
  const oldResp = await fetch(gw);
  if (!oldResp.ok) throw new Error(`old metadata fetch ${oldResp.status}`);
  const metadata = await oldResp.json();
  console.log('    name :', metadata.name);
  console.log('    tier :', metadata.attributes?.find((a) => a.trait_type === 'Tier')?.value);

  // --- 2. re-pin JSON as file "7" using the CORRECT shape ({data, name}) ---
  //    We deliberately use the {data: Uint8Array, name: "7"} pattern — the
  //    same shape the production client now uses — so we validate the
  //    naming behaviour end-to-end.
  console.log('[2] pinning metadata JSON as file named "7"…');
  const jsonText = JSON.stringify(metadata, null, 2);
  const jsonBytes = new TextEncoder().encode(jsonText);
  const named = { data: jsonBytes, name: TOKEN_ID };
  const jsonUri = await upload({ client, files: [named] });
  console.log('    JSON pinned at:', jsonUri);
  if (!jsonUri.endsWith(`/${TOKEN_ID}`)) {
    throw new Error(
      `Unexpected JSON URI shape: ${jsonUri} (expected to end with /${TOKEN_ID})`,
    );
  }
  const baseURI = jsonUri.replace(/\/[^/]+$/, '/');
  console.log('    baseURI for batch:', baseURI);
  if (`${baseURI}${TOKEN_ID}` !== jsonUri) {
    throw new Error('baseURI reconstruction mismatch');
  }

  // --- 3. call updateBatchBaseURI via edge fn ---
  console.log(
    `[3] calling nft-admin.updateBatchBaseURI index=${BATCH_INDEX}…`,
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
    throw new Error(
      `updateBatchBaseURI failed: ${edgeJson?.error || edgeResp.status}`,
    );
  }

  // --- 4. verify uri(7) on chain ---
  console.log('[4] reading uri(7) from chain…');
  const idHex = (7).toString(16).padStart(64, '0');
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
  console.log('    on-chain uri(7):', chainUri);

  const chainGw = chainUri.replace('ipfs://', 'https://ipfs.io/ipfs/');
  const resolvedResp = await fetch(chainGw);
  if (!resolvedResp.ok) {
    throw new Error(`uri(7) → ${resolvedResp.status} at ${chainGw}`);
  }
  const resolved = await resolvedResp.json();
  console.log('    IPFS JSON name :', resolved.name);
  console.log('    IPFS JSON image:', resolved.image);

  if (resolved.name !== metadata.name) {
    throw new Error('Chain URI does not resolve to freshly pinned metadata');
  }
  console.log('\n✅ SUOMI token 7 repaired.');
  console.log('   Thirdweb dashboard will now show real metadata + image.');
}

main().catch((err) => {
  console.error('\n❌ Repair failed:', err.message || err);
  process.exit(1);
});
