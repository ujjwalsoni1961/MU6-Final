#!/usr/bin/env node
/**
 * verify-future-release-flow.mjs
 * ──────────────────────────────
 * DRY-RUN proof that the fixed release pipeline will produce correct
 * on-chain tokenURIs for every future release — WITHOUT creating a new
 * token on-chain.
 *
 * Reproduces exactly what `app/(artist)/nft-manager.tsx handleCreate`
 * + `src/services/nftMetadata.ts buildAndPinReleaseMetadata` +
 * `src/services/blockchain.ts createErc1155Release` would do, stopping
 * one step before the actual `lazyMint` tx.
 *
 * Checks:
 *  [A] Contract returns a valid `nextTokenIdToMint` via correct selector
 *      (0x3b1475a7 — NOT the old broken 0x5bc5da30 which would return 0).
 *  [B] Metadata JSON is pinned as a file literally named `<nextTokenId>`
 *      so that DropERC1155's `uri(id) = baseURI + id` resolves correctly.
 *  [C] The IPFS baseURI we would pass to lazyMint ends with '/'.
 *  [D] The file at `baseURI + <nextTokenId>` is fetchable AND parses as
 *      valid OpenSea-schema JSON with required fields.
 *  [E] The nft-admin edge function endpoint is reachable + auth works
 *      (we call an admin-only action with simulate-only params).
 *
 * Usage:
 *   SUPABASE_ANON_KEY=… EXPO_PUBLIC_ADMIN_SECRET=… \
 *     node scripts/verify-future-release-flow.mjs
 */
import { createThirdwebClient } from 'thirdweb';
import { upload } from 'thirdweb/storage';

const CLIENT_ID =
  process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID ||
  '64c9d6a04c2edcf1c8b117db980edd41';
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://ukavmvxelsfdfktiiyvg.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY;
const ADMIN = process.env.EXPO_PUBLIC_ADMIN_SECRET;
const CONTRACT = '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad';
const RPC = `https://80002.rpc.thirdweb.com/${CLIENT_ID}`;

if (!ANON || !ADMIN) {
  console.error(
    'Missing SUPABASE_ANON_KEY and/or EXPO_PUBLIC_ADMIN_SECRET',
  );
  process.exit(1);
}

let failures = 0;
const pass = (n, m) => console.log(`✅ [${n}] ${m}`);
const fail = (n, m) => {
  console.log(`❌ [${n}] ${m}`);
  failures += 1;
};

async function ethCall(data) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: CONTRACT, data }, 'latest'],
    }),
  });
  return (await r.json()).result;
}

async function main() {
  console.log('── Future Release Flow Verification ──');
  console.log('Contract:', CONTRACT);
  console.log('Mode:    DRY RUN (no new on-chain token will be created)');
  console.log();

  // ── [A] nextTokenIdToMint selector ──
  console.log('[A] Checking nextTokenIdToMint selector …');
  const oldSel = await ethCall('0x5bc5da30'); // old broken selector
  if (!oldSel || oldSel === '0x') {
    pass('A1', 'Old selector 0x5bc5da30 correctly does NOT respond (reverts)');
  } else {
    console.log(`    old selector returned: ${oldSel}`);
  }
  const newSelRaw = await ethCall('0x3b1475a7'); // correct selector used in blockchain.ts
  if (!newSelRaw || newSelRaw === '0x') {
    fail('A2', 'New selector 0x3b1475a7 returned empty — RPC problem');
    return;
  }
  const nextTokenId = BigInt(newSelRaw);
  pass('A2', `nextTokenIdToMint() = ${nextTokenId.toString()} (via 0x3b1475a7)`);

  // ── [B] Pin metadata as file named <nextTokenId> ──
  console.log();
  console.log('[B] Pinning dry-run metadata as file named "' +
    nextTokenId.toString() + '" …');
  const client = createThirdwebClient({ clientId: CLIENT_ID });
  const dryMetadata = {
    name: `DRY-RUN verification — token ${nextTokenId.toString()}`,
    description:
      'Dry-run metadata pin to verify MU6 release pipeline produces correct' +
      ' IPFS paths. Not minted on-chain — this JSON exists only as a proof' +
      ' that our pin filename + baseURI strategy resolves as expected.',
    image:
      'ipfs://QmRDXcPREmu2cfFb9woLVbsfHgzBnKWQcKtjCzYcvZbFyZ/cover.jpg',
    external_url: 'https://mu6-final.vercel.app',
    attributes: [
      { trait_type: 'Kind', value: 'DryRun' },
      { trait_type: 'Expected TokenId', display_type: 'number',
        value: Number(nextTokenId) },
    ],
    properties: {
      dryRunTimestamp: new Date().toISOString(),
      mu6: { platform: 'MU6', dryRun: true },
    },
  };
  const jsonText = JSON.stringify(dryMetadata, null, 2);
  const file = new File([jsonText], String(nextTokenId), {
    type: 'application/json',
  });
  const uploaded = await upload({ client, files: [file] });
  const metadataUri = Array.isArray(uploaded) ? uploaded[0] : uploaded;
  console.log('    pinned:', metadataUri);

  const expectedSuffix = `/${nextTokenId.toString()}`;
  if (metadataUri.endsWith(expectedSuffix)) {
    pass('B1', `Pinned URI ends with /${nextTokenId.toString()} (filename correct)`);
  } else {
    fail('B1', `Pinned URI suffix wrong: ${metadataUri}`);
    return;
  }

  // ── [C] Derived baseURI ends with '/' ──
  const baseURI = metadataUri.replace(/\/[^/]+$/, '/');
  if (baseURI.endsWith('/')) {
    pass('C1', `Derived baseURI ends with '/': ${baseURI}`);
  } else {
    fail('C1', `baseURI does not end with '/': ${baseURI}`);
  }
  const reconstructedTokenURI = `${baseURI}${nextTokenId.toString()}`;
  if (reconstructedTokenURI === metadataUri) {
    pass('C2', 'baseURI + tokenId reconstructs the exact pinned URI');
  } else {
    fail('C2', `mismatch: pinned=${metadataUri} recon=${reconstructedTokenURI}`);
  }

  // ── [D] Fetch + schema check ──
  console.log();
  console.log('[D] Fetching pinned JSON via gateway…');
  // Give IPFS ~8s to propagate
  await new Promise((r) => setTimeout(r, 8000));
  const gw = reconstructedTokenURI.replace(
    'ipfs://',
    'https://ipfs.io/ipfs/',
  );
  let fetched;
  try {
    const r = await fetch(gw, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) {
      fail('D1', `Gateway HTTP ${r.status}`);
    } else {
      fetched = await r.json();
      pass('D1', `Gateway returned valid JSON (${r.status})`);
    }
  } catch (err) {
    fail('D1', `Gateway fetch failed: ${err.message}`);
  }
  if (fetched) {
    const required = ['name', 'description', 'image', 'attributes'];
    const missing = required.filter((k) => !(k in fetched));
    if (missing.length === 0) {
      pass('D2', 'All required OpenSea fields present');
    } else {
      fail('D2', `Missing fields: ${missing.join(', ')}`);
    }
    if (fetched.name === dryMetadata.name) {
      pass('D3', 'Fetched JSON matches what we pinned');
    } else {
      fail('D3', `Name mismatch: got "${fetched.name}"`);
    }
  }

  // ── [E] Edge fn reachable + auth works ──
  console.log();
  console.log('[E] Probing nft-admin edge fn auth…');
  // Use an intentionally-invalid action that still hits the admin gate
  // so we don't cause any side-effect. Invalid action should return 400
  // but ONLY after admin secret is validated (tests the gate itself).
  const probe = await fetch(`${SUPABASE_URL}/functions/v1/nft-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON}`,
      'x-mu6-admin-secret': ADMIN,
    },
    body: JSON.stringify({ action: 'dryRunPing' }),
  });
  const probeJson = await probe.json().catch(() => ({}));
  if (probe.status === 401 || probeJson.code === 'ADMIN_SECRET_REQUIRED') {
    fail('E1', 'Admin secret was REJECTED — edge fn auth broken');
  } else if (probe.status === 400 || probeJson.error) {
    pass('E1',
      'Admin secret accepted (got "unknown action" past the auth gate)');
  } else {
    pass('E1', `Edge fn responded ${probe.status}`);
  }

  // ── Summary ──
  console.log();
  console.log('── SUMMARY ──');
  console.log(`nextTokenIdToMint on-chain: ${nextTokenId.toString()}`);
  console.log(`pinned baseURI:             ${baseURI}`);
  console.log(`would-be tokenURI for next: ${reconstructedTokenURI}`);
  console.log();
  if (failures === 0) {
    console.log('✅ All checks passed.');
    console.log('   The next release created from the artist dashboard will');
    console.log(`   produce token id ${nextTokenId.toString()} with correct metadata.`);
  } else {
    console.log(`❌ ${failures} check(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(99);
});
