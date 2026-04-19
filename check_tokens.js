const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const SUPABASE_URL = envFile.split('\n').find(l => l.startsWith('EXPO_PUBLIC_SUPABASE_URL=')).split('=')[1].trim();
const SUPABASE_ANON_KEY = envFile.split('\n').find(l => l.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY=')).split('=')[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
    const { data: userTokens, error } = await supabase
        .from('nft_tokens')
        .select('*')
        // wallet address for "ujjwalsoni1961@gmail.com" from user profiles or just owner_wallet_address directly
        // User stated: "when user ( ujjwalsoni1961@gmail.com ) bought their first nFT"
        ;
        // let's grab all tokens
        
    console.log(userTokens);
}
run();
