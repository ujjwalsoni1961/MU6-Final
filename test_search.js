const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    const s = "hip";
    let query = supabase.from('songs').select('title');
    query = query.or(`title.ilike.%${s}%,album.ilike.%${s}%,genre.ilike.%${s}%`);
    const { data, error } = await query;
    console.log("Data:", data);
    console.log("Error:", error);
}

test();
