import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Public client (respects RLS, used in the app)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

/**
 * Sync a wallet address to a Supabase profile via the `profile-sync` edge function.
 *
 * The edge function runs server-side with the service role key, so it can:
 *   1. Create an auth.users entry (GoTrue Admin API)
 *   2. Upsert a profile row (bypasses RLS)
 *
 * Returns the full profile object, or null on failure.
 */
export async function syncWalletProfile(
    walletAddress: string,
): Promise<{ profile: any | null; isNew?: boolean }> {
    try {
        const url = `${supabaseUrl}/functions/v1/profile-sync`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ walletAddress }),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            console.error('[supabase] syncWalletProfile error:', res.status, body);
            return { profile: null };
        }

        const data = await res.json();
        if (data.success && data.profile) {
            return { profile: data.profile, isNew: data.isNew };
        }

        console.error('[supabase] syncWalletProfile unexpected response:', data);
        return { profile: null };
    } catch (err) {
        console.error('[supabase] syncWalletProfile exception:', err);
        return { profile: null };
    }
}
