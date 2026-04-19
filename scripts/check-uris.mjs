import { createThirdwebClient, getContract, readContract, defineChain } from 'thirdweb';
const client = createThirdwebClient({ clientId: '64c9d6a04c2edcf1c8b117db980edd41' });
const chain = defineChain(80002);
const nft = getContract({ client, chain, address: '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad' });

for (const id of [0n, 1n, 2n, 3n]) {
  try {
    const uri = await readContract({
      contract: nft,
      method: 'function uri(uint256 _tokenId) view returns (string)',
      params: [id],
    });
    console.log(`tokenId ${id}: uri = ${uri}`);
  } catch (e) {
    console.log(`tokenId ${id}: err = ${e.message}`);
  }
}

// nextTokenIdToMint
try {
  const n = await readContract({
    contract: nft,
    method: 'function nextTokenIdToMint() view returns (uint256)',
    params: [],
  });
  console.log('nextTokenIdToMint:', n.toString());
} catch (e) { console.log('ntitm err:', e.message); }

// contractURI (for collection-level metadata)
try {
  const c = await readContract({
    contract: nft,
    method: 'function contractURI() view returns (string)',
    params: [],
  });
  console.log('contractURI:', c);
} catch (e) { console.log('contractURI err:', e.message); }
