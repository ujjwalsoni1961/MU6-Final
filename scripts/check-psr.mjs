import { createThirdwebClient, getContract, readContract, defineChain } from 'thirdweb';
const client = createThirdwebClient({ clientId: '64c9d6a04c2edcf1c8b117db980edd41' });
const chain = defineChain(80002);
const NFT = '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad';
const nft = getContract({ client, chain, address: NFT });

const RPC = 'https://rpc-amoy.polygon.technology/';

async function code(addr) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [addr, 'latest'] }),
  });
  const j = await r.json();
  return j.result === '0x' ? 'EOA' : `contract (${(j.result.length - 2) / 2} bytes)`;
}

// Contract-wide primary sale recipient
try {
  const psr = await readContract({
    contract: nft,
    method: 'function primarySaleRecipient() view returns (address)',
    params: [],
  });
  console.log('contract primarySaleRecipient:', psr, '→', await code(psr));
} catch (e) { console.log('psr err:', e.message); }

// Per-token recipient saleRecipient(tokenId)
try {
  const tsr = await readContract({
    contract: nft,
    method: 'function saleRecipient(uint256) view returns (address)',
    params: [0n],
  });
  console.log('token 0 saleRecipient:', tsr, '→', await code(tsr));
} catch (e) { console.log('tsr err:', e.message); }

// Royalty recipient
try {
  const royInfo = await readContract({
    contract: nft,
    method: 'function getRoyaltyInfoForToken(uint256 _tokenId) view returns (address, uint16)',
    params: [0n],
  });
  console.log('royaltyInfoForToken 0:', royInfo);
  console.log('royalty recipient code:', await code(royInfo[0]));
} catch (e) { console.log('royalty err:', e.message); }

// Contract-wide royalty
try {
  const royInfo = await readContract({
    contract: nft,
    method: 'function getDefaultRoyaltyInfo() view returns (address, uint16)',
    params: [],
  });
  console.log('defaultRoyaltyInfo:', royInfo, '→', await code(royInfo[0]));
} catch (e) { console.log('def royalty err:', e.message); }

// Platform fee info
try {
  const pf = await readContract({
    contract: nft,
    method: 'function getPlatformFeeInfo() view returns (address, uint16)',
    params: [],
  });
  console.log('platformFeeInfo:', pf, '→', await code(pf[0]));
} catch (e) { console.log('pfee err:', e.message); }

// Check DB recipient
console.log('\ncheck DB primary_sale_recipient 0x16d4...6761:', await code('0x16d4d64cb8528e554b0c1ee2f2d5a8f55e3f6761'));
