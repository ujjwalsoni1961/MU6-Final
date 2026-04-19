// Full E2E test: primary buy (user1) → relist → secondary buy (user2)
// All txs are real, on Polygon Amoy.
//
// Steps:
//   1.  user1 calls serverClaim edge fn → gets 1 copy of token 0
//   2.  user1 calls NFT.setApprovalForAll(marketplace, true)
//   3.  user1 calls Marketplace.createListing(token 0, qty 1, price 0.01 POL)
//   4.  user2 calls Marketplace.buyFromListing(listingId, user2, 1, NATIVE, 0.01 POL)
//   5.  Assert balances: user1 bal = 0, user2 bal = 1

import {
  createThirdwebClient,
  getContract,
  readContract,
  prepareContractCall,
  sendTransaction,
  defineChain,
  waitForReceipt,
} from 'thirdweb';
import { privateKeyToAccount, getWalletBalance } from 'thirdweb/wallets';
import { readFileSync } from 'fs';

// ── Config ──
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ukavmvxelsfdfktiiyvg.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_wL9HMvfWm4JZiSMuPI_mEw_P2Etx1D1';
const CLIENT_ID =
  process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID || '64c9d6a04c2edcf1c8b117db980edd41';
const NFT_ADDR =
  process.env.EXPO_PUBLIC_SONG_NFT_ADDRESS || '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad';
const MKT_ADDR =
  process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS || '0x141Fc79b7F1EB7b393A5DC5f257678c3cD30506a';

const RELEASE_ID = 'febe000e-4548-4dd2-aded-9999e7e6aebd';
const TOKEN_ID = 0n;

const PK_USER1 =
  process.env.EXPO_PUBLIC_E2E_TEST_KEY_USER1 ||
  '0x91013afd778e08e1b0afe8a1528864b146e93b0a1965dadec93ab98975b19bbd';
const PK_USER2 =
  process.env.EXPO_PUBLIC_E2E_TEST_KEY_USER2 ||
  '0xa3a500d40f58a6d56d25357a8c29c6b4ffa682aef16d60a4e4e2644eb8b8bb61';

const NATIVE = '0x0000000000000000000000000000000000000000';
const NATIVE_ALT = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const client = createThirdwebClient({ clientId: CLIENT_ID });
const chain = defineChain(80002);

const user1 = privateKeyToAccount({ client, privateKey: PK_USER1 });
const user2 = privateKeyToAccount({ client, privateKey: PK_USER2 });

const nft = getContract({ client, chain, address: NFT_ADDR });
const mkt = getContract({ client, chain, address: MKT_ADDR });

// ── Helpers ──
async function balanceOf(owner, id) {
  return await readContract({
    contract: nft,
    method: 'function balanceOf(address account, uint256 id) view returns (uint256)',
    params: [owner, id],
  });
}

async function nativeBal(addr) {
  const b = await getWalletBalance({ client, chain, address: addr });
  return b.displayValue;
}

async function isApprovedForAll(owner, operator) {
  return await readContract({
    contract: nft,
    method: 'function isApprovedForAll(address account, address operator) view returns (bool)',
    params: [owner, operator],
  });
}

async function totalListings() {
  return await readContract({
    contract: mkt,
    method: 'function totalListings() view returns (uint256)',
    params: [],
  });
}

async function getListing(listingId) {
  return await readContract({
    contract: mkt,
    method:
      'function getListing(uint256 _listingId) view returns ((uint256 listingId, uint256 tokenId, uint256 quantity, uint256 pricePerToken, uint128 startTimestamp, uint128 endTimestamp, address listingCreator, address assetContract, address currency, uint8 tokenType, uint8 status, bool reserved))',
    params: [listingId],
  });
}

// ── Step 1: primary buy (serverClaim) ──
async function step1_primaryBuy() {
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 1: user1 primary-buy via serverClaim');
  console.log('══════════════════════════════════════════');

  const before = await balanceOf(user1.address, TOKEN_ID);
  console.log(`user1 balance before: ${before}`);
  if (before > 0n) {
    console.log('[skip] user1 already has a copy — continuing');
    return;
  }

  const url = `${SUPABASE_URL}/functions/v1/nft-admin`;
  const payload = {
    action: 'serverClaim',
    receiverAddress: user1.address,
    contractAddress: NFT_ADDR,
    release_id: RELEASE_ID,
  };

  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  console.log(`[serverClaim] status=${res.status} elapsed=${Date.now() - t0}ms`);
  console.log('[serverClaim] response:', JSON.stringify(json).slice(0, 600));

  if (!res.ok || json?.success === false) {
    throw new Error(`serverClaim failed: ${JSON.stringify(json)}`);
  }

  const after = await balanceOf(user1.address, TOKEN_ID);
  console.log(`user1 balance after: ${after}`);
  if (after <= before) throw new Error('user1 balance did not increase');
}

// ── Step 2a: approve marketplace ──
async function step2a_approve() {
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 2a: user1 approves marketplace');
  console.log('══════════════════════════════════════════');
  const isApproved = await isApprovedForAll(user1.address, MKT_ADDR);
  if (isApproved) {
    console.log('[skip] already approved');
    return;
  }
  const tx = prepareContractCall({
    contract: nft,
    method: 'function setApprovalForAll(address operator, bool approved)',
    params: [MKT_ADDR, true],
  });
  const { transactionHash } = await sendTransaction({ account: user1, transaction: tx });
  console.log('setApprovalForAll tx:', transactionHash);
  await waitForReceipt({ client, chain, transactionHash });
  console.log('approved ✓');
}

// ── Step 2b: list ──
async function step2b_list() {
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 2b: user1 createListing');
  console.log('══════════════════════════════════════════');

  const price = 10000000000000000n; // 0.01 POL
  const now = BigInt(Math.floor(Date.now() / 1000));
  const endTs = now + 30n * 24n * 60n * 60n; // 30 days

  const nextId = await totalListings();
  console.log('next listing id will be:', nextId.toString());

  const tx = prepareContractCall({
    contract: mkt,
    method:
      'function createListing((address assetContract, uint256 tokenId, uint256 quantity, address currency, uint256 pricePerToken, uint128 startTimestamp, uint128 endTimestamp, bool reserved) _params) returns (uint256 listingId)',
    params: [
      {
        assetContract: NFT_ADDR,
        tokenId: TOKEN_ID,
        quantity: 1n,
        currency: NATIVE_ALT, // MarketplaceV3 uses the "eeee..eee" sentinel for native
        pricePerToken: price,
        startTimestamp: now,
        endTimestamp: endTs,
        reserved: false,
      },
    ],
  });
  const { transactionHash } = await sendTransaction({ account: user1, transaction: tx });
  console.log('createListing tx:', transactionHash);
  await waitForReceipt({ client, chain, transactionHash });

  const listing = await getListing(nextId);
  console.log('listing row:', {
    id: listing.listingId.toString(),
    creator: listing.listingCreator,
    price: listing.pricePerToken.toString(),
    status: listing.status.toString(),
    currency: listing.currency,
  });
  if (listing.listingCreator.toLowerCase() !== user1.address.toLowerCase()) {
    throw new Error('listing creator mismatch');
  }
  return { listingId: nextId, price };
}

// ── Step 3: secondary buy ──
async function step3_secondaryBuy({ listingId, price }) {
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 3: user2 buyFromListing');
  console.log('══════════════════════════════════════════');

  const user1Before = await balanceOf(user1.address, TOKEN_ID);
  const user2Before = await balanceOf(user2.address, TOKEN_ID);
  const u1NBefore = await nativeBal(user1.address);
  const u2NBefore = await nativeBal(user2.address);
  console.log('before:', {
    user1_tok: user1Before.toString(),
    user2_tok: user2Before.toString(),
    user1_native: u1NBefore,
    user2_native: u2NBefore,
  });

  const tx = prepareContractCall({
    contract: mkt,
    method:
      'function buyFromListing(uint256 _listingId, address _buyFor, uint256 _quantity, address _currency, uint256 _expectedTotalPrice) payable',
    params: [listingId, user2.address, 1n, NATIVE_ALT, price],
    value: price,
  });
  const { transactionHash } = await sendTransaction({ account: user2, transaction: tx });
  console.log('buyFromListing tx:', transactionHash);
  await waitForReceipt({ client, chain, transactionHash });

  const user1After = await balanceOf(user1.address, TOKEN_ID);
  const user2After = await balanceOf(user2.address, TOKEN_ID);
  const u1NAfter = await nativeBal(user1.address);
  const u2NAfter = await nativeBal(user2.address);
  console.log('after:', {
    user1_tok: user1After.toString(),
    user2_tok: user2After.toString(),
    user1_native: u1NAfter,
    user2_native: u2NAfter,
  });

  if (user2After - user2Before !== 1n) throw new Error('user2 did not receive token');
  if (user1Before - user1After !== 1n) throw new Error('user1 did not lose token');

  const u1Delta = Number(u1NAfter) - Number(u1NBefore);
  console.log(`user1 native delta: +${u1Delta.toFixed(6)} POL (expected ~+0.0095 POL after 5% fees)`);
}

// ── Main ──
(async () => {
  console.log('user1:', user1.address);
  console.log('user2:', user2.address);
  console.log('release:', RELEASE_ID, 'tokenId:', TOKEN_ID.toString());

  await step1_primaryBuy();
  await step2a_approve();
  const { listingId, price } = await step2b_list();
  await step3_secondaryBuy({ listingId, price });

  console.log('\n✅ FULL E2E PASS');
})().catch((e) => {
  console.error('\n❌ FAIL:', e.message);
  if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
