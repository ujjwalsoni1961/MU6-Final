const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const SUPABASE_URL = envFile.split('\n').find(l => l.startsWith('EXPO_PUBLIC_SUPABASE_URL=')).split('=')[1].trim();
const SUPABASE_ANON_KEY = envFile.split('\n').find(l => l.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY=')).split('=')[1].trim();

async function run() {
    const tokensToFix = [
        {
            owner: '0xddf40a97d5d9b8719732ec56f2c9066ca5ee730c',
            priceEth: 0.5,
            contractAddress: '0xACF1145AdE250D356e1B2869E392e6c748c14C0E' // default SONG_NFT
        },
        {
            owner: '0x406b5acd2145f277248fe2f6c4c94c401e0c3082',
            priceEth: 1,
            contractAddress: '0xACF1145AdE250D356e1B2869E392e6c748c14C0E'
        },
        // token 3 is user '0x0481d354a0f3f2867f1f3d1876ac3401aa1d3074' token_id: 1 -> wait! It says 'last_sale_tx_hash' exists! Maybe they already listed it? But how if they didn't own it? They must have bypassed or failed listing. Wait! token 3 last_transferred_at is not null. 
        // Token 4 is user '0x0481d354a0f3f2867f1f3d1876ac3401aa1d3074', minted_at: '2026-04-17T13:05...', price_paid_eth: 1
        {
            owner: '0x0481d354a0f3f2867f1f3d1876ac3401aa1d3074',
            priceEth: 1,
            contractAddress: '0xACF1145AdE250D356e1B2869E392e6c748c14C0E'
        }
    ];

    for (const token of tokensToFix) {
        const onChainPriceWei = BigInt(0.01 * 1e18).toString();
        console.log(`Fixing token for ${token.owner} with price ${onChainPriceWei}...`);

        const requestBody = {
            action: 'serverClaim',
            receiverAddress: token.owner,
            onChainPriceWei: onChainPriceWei,
            contractAddress: token.contractAddress,
        };

        const response = await fetch(`${SUPABASE_URL}/functions/v1/nft-admin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        console.log(`Response for ${token.owner}:`, data);
    }
}
run();
