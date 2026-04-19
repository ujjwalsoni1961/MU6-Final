const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const SUPABASE_URL = envFile.split('\n').find(l => l.startsWith('EXPO_PUBLIC_SUPABASE_URL=')).split('=')[1].trim();
const SUPABASE_ANON_KEY = envFile.split('\n').find(l => l.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY=')).split('=')[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
    const { data: tokens } = await supabase.from('nft_tokens').select(`
        *,
        nft_releases ( contract_address )
    `);
    console.log(JSON.stringify(tokens, null, 2));
}
run();
