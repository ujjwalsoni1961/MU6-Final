const { createThirdwebClient, getContract, prepareContractCall, simulateTransaction } = require('thirdweb');
const { defineChain } = require('thirdweb/chains');
const { getActiveClaimCondition, claimTo } = require('thirdweb/extensions/erc721');

async function r() {
  const c = createThirdwebClient({ clientId: '64c9d6a04c2edcf1c8b117db980edd41' });
  const contract = getContract({
      client: c,
      chain: defineChain(80002),
      address: '0xACF1145AdE250D356e1B2869E392e6c748c14C0E'
  });
  
  const condition = await getActiveClaimCondition({ contract });
  console.log('Price:', condition.pricePerToken.toString());

  try {
      const tx = prepareContractCall({
          contract,
          method: "function claim(address _receiver, uint256 _quantity, address _currency, uint256 _pricePerToken, (bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) _allowlistProof, bytes _data)",
          params: [
              '0x0481d354a0f3f2867f1f3d1876ac3401aa1d3074',
              1n,
              '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
              condition.pricePerToken,
              [[], 0n, 0n, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'],
              "0x"
          ],
          value: condition.pricePerToken
      });

      console.log('Simulating...');
      const result = await simulateTransaction({
          transaction: tx,
          from: '0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39' // SERVER_WALLET
      });
      console.log('Simulation success:', result);
  } catch (err) {
      console.error('Simulation Failed:', err.message);
  }
}
r();
