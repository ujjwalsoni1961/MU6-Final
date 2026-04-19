const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ukavmvxelsfdfktiiyvg.supabase.co';
const supabaseKey = 'sb_publishable_wL9HMvfWm4JZiSMuPI_mEw_P2Etx1D1';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('wallet_address', '0xcafebabecafebabecafebabecafebabecafebabe')
    .maybeSingle();
    
  console.log('Data:', data);
  console.log('Error:', error);
}

main();
