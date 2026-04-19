const { createThirdwebClient, getContract, readContract } = require('thirdweb');
const { defineChain } = require('thirdweb/chains');
const { getActiveClaimCondition } = require('thirdweb/extensions/erc721');

async function run() {
    const client = createThirdwebClient({ clientId: '64c9d6a04c2edcf1c8b117db980edd41' });
    const chain = defineChain(80002);
    const contract = getContract({
        client,
        chain,
        address: '0xACF1145AdE250D356e1B2869E392e6c748c14C0E'
    });

    try {
        const condition = await getActiveClaimCondition({ contract });
        console.log('Active claim condition:', condition);
    } catch(err) {
        console.error(err);
    }
}
run();
