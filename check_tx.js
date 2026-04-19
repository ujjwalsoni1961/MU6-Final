const { createThirdwebClient, waitForReceipt } = require('thirdweb');
const { defineChain } = require('thirdweb/chains');

async function run() {
    const client = createThirdwebClient({ clientId: '64c9d6a04c2edcf1c8b117db980edd41' }); // random public id or get from .env
    const chain = defineChain(80002);

    try {
        const receipt = await waitForReceipt({
            client,
            chain,
            transactionHash: '0xd9c80076677bf1847f061c4f2603d336ca27def78592d58ff7b7b34c1069c069',
        });
        console.log('To:', receipt.to);
        console.log('From:', receipt.from);
        console.log('Logs:', receipt.logs.length);
    } catch(err) {
        console.error(err);
    }
}
run();
