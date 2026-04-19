const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const SUPABASE_URL = envFile.split('\n').find(l => l.startsWith('EXPO_PUBLIC_SUPABASE_URL=')).split('=')[1].trim();
const SUPABASE_ANON_KEY = envFile.split('\n').find(l => l.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY=')).split('=')[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
    const { data: user } = await supabase.from('profiles').select('wallet_address, email').eq('email', 'ujjwalsoni1961@gmail.com');
    console.log(user);
}
run();
