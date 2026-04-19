require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data: artists, error: aErr } = await supabase.from('profiles').select('*').eq('role', 'creator').ilike('display_name', '%a%').limit(5);
  console.log('Artists error:', aErr);
  console.log('Artists match:', artists?.map(a => a.display_name));
  
  const { data: songs, error: sErr } = await supabase.from('songs').select('*').or('title.ilike.%a%,album.ilike.%a%,genre.ilike.%a%').limit(5);
  console.log('Songs error:', sErr);
  console.log('Songs match:', songs?.map(s => s.title));
}
test();
