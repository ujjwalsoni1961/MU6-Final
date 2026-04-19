// Checks on-chain state for our E2E test: balances, token supply, claim condition
import { createThirdwebClient, getContract, readContract, defineChain } from 'thirdweb';
import { getWalletBalance } from 'thirdweb/wallets';

const client = createThirdwebClient({
  clientId: process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID || '64c9d6a04c2edcf1c8b117db980edd41',
});

const chain = defineChain(80002); // Polygon Amoy

const NFT = process.env.EXPO_PUBLIC_SONG_NFT_ADDRESS || '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad';
const MKT = process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS || '0x141Fc79b7F1EB7b393A5DC5f257678c3cD30506a';

const ARTIST = '0xE07540793D7E3f1Dc3E3eBf2F85C215B2e047828';
const USER1 = '0x8BCcdC2b685dD995cF3C709304955FD18C225E28';
const USER2 = '0x37fe83e0a2D0B1dBa6fe1aBe72eeaF9a0eF421C4';

const TOKEN_ID = 0n;

const nft = getContract({ client, chain, address: NFT });
const mkt = getContract({ client, chain, address: MKT });

async function balanceOf(owner, id) {
  try {
    return await readContract({
      contract: nft,
      method: 'function balanceOf(address account, uint256 id) view returns (uint256)',
      params: [owner, id],
    });
  } catch (e) {
    return `err: ${e.message}`;
  }
}

async function totalSupply(id) {
  try {
    return await readContract({
      contract: nft,
      method: 'function totalSupply(uint256 id) view returns (uint256)',
      params: [id],
    });
  } catch (e) {
    return `err: ${e.message}`;
  }
}

async function nativeBalance(addr) {
  const b = await getWalletBalance({ client, chain, address: addr });
  return `${b.displayValue} ${b.symbol}`;
}

async function getActiveClaimCondition(id) {
  try {
    const idx = await readContract({
      contract: nft,
      method: 'function getActiveClaimConditionId(uint256 _tokenId) view returns (uint256)',
      params: [id],
    });
    const cc = await readContract({
      contract: nft,
      method: 'function getClaimConditionById(uint256 _tokenId, uint256 _conditionId) view returns ((uint256 startTimestamp, uint256 maxClaimableSupply, uint256 supplyClaimed, uint256 quantityLimitPerWallet, bytes32 merkleRoot, uint256 pricePerToken, address currency, string metadata))',
      params: [id, idx],
    });
    return { idx: idx.toString(), ...cc };
  } catch (e) {
    return `err: ${e.message}`;
  }
}

async function totalListings() {
  try {
    const n = await readContract({
      contract: mkt,
      method: 'function totalListings() view returns (uint256)',
      params: [],
    });
    return n;
  } catch (e) {
    return `err: ${e.message}`;
  }
}

(async () => {
  console.log('=== NATIVE BALANCES ===');
  console.log('artist:', await nativeBalance(ARTIST));
  console.log('user1: ', await nativeBalance(USER1));
  console.log('user2: ', await nativeBalance(USER2));

  console.log('\n=== TOKEN 0 STATE ===');
  console.log('totalSupply:', (await totalSupply(TOKEN_ID)).toString());
  console.log('artist bal:', (await balanceOf(ARTIST, TOKEN_ID)).toString());
  console.log('user1 bal: ', (await balanceOf(USER1, TOKEN_ID)).toString());
  console.log('user2 bal: ', (await balanceOf(USER2, TOKEN_ID)).toString());

  console.log('\n=== ACTIVE CLAIM CONDITION (token 0) ===');
  const cc = await getActiveClaimCondition(TOKEN_ID);
  if (typeof cc === 'string') {
    console.log(cc);
  } else {
    console.log(JSON.stringify({
      idx: cc.idx,
      maxClaimableSupply: cc.maxClaimableSupply?.toString(),
      supplyClaimed: cc.supplyClaimed?.toString(),
      quantityLimitPerWallet: cc.quantityLimitPerWallet?.toString(),
      pricePerToken: cc.pricePerToken?.toString(),
      currency: cc.currency,
      startTimestamp: cc.startTimestamp?.toString(),
      merkleRoot: cc.merkleRoot,
    }, null, 2));
  }

  console.log('\n=== MARKETPLACE ===');
  console.log('totalListings:', (await totalListings()).toString());
})().catch(e => { console.error(e); process.exit(1); });
