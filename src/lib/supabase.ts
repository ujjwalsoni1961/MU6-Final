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

// Admin client (bypasses RLS, used only for server-side operations like profile sync)
// In production, this should ONLY be called from Edge Functions / backend.
// For MVP, we use it client-side for the auth sync flow only.
const supabaseServiceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || '';
export const supabaseAdmin = supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
    : supabase; // Fallback to public client if no service key

/**
 * Create a Supabase auth.users entry for a Thirdweb wallet user.
 * The profiles table has a FK constraint (profiles.id → auth.users.id),
 * so we must create an auth user first before inserting the profile.
 *
 * Uses the GoTrue Admin API to create the user without requiring
 * email verification or password-based login.
 *
 * Returns the generated user ID (UUID) or null on failure.
 */
export async function createAuthUserForWallet(
    walletAddress: string,
): Promise<string | null> {
    try {
        // Use a deterministic pseudo-email derived from the wallet address.
        // This avoids collisions and satisfies Supabase's email requirement.
        const pseudoEmail = `${walletAddress.toLowerCase()}@wallet.mu6.local`;

        const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: supabaseServiceKey || supabaseAnonKey,
                Authorization: `Bearer ${supabaseServiceKey || supabaseAnonKey}`,
            },
            body: JSON.stringify({
                email: pseudoEmail,
                password: `wallet-${Date.now()}-${Math.random().toString(36)}`,
                email_confirm: true,
                user_metadata: {
                    wallet_address: walletAddress,
                    source: 'thirdweb',
                },
            }),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            // If user already exists (e.g. retry), look up by email
            if (res.status === 422 || (body?.msg || body?.message || '').includes('already')) {
                return lookupAuthUserByWallet(walletAddress);
            }
            console.error('[supabase] createAuthUserForWallet error:', res.status, body);
            return null;
        }

        const user = await res.json();
        return user.id ?? null;
    } catch (err) {
        console.error('[supabase] createAuthUserForWallet exception:', err);
        return null;
    }
}

/**
 * Look up an existing auth user by wallet address (stored in user_metadata).
 * Fallback for when the user already exists in auth.users.
 */
async function lookupAuthUserByWallet(walletAddress: string): Promise<string | null> {
    try {
        const pseudoEmail = `${walletAddress.toLowerCase()}@wallet.mu6.local`;
        // List users filtered by email
        const res = await fetch(
            `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`,
            {
                method: 'GET',
                headers: {
                    apikey: supabaseServiceKey || supabaseAnonKey,
                    Authorization: `Bearer ${supabaseServiceKey || supabaseAnonKey}`,
                },
            },
        );
        if (!res.ok) return null;
        const data = await res.json();
        const users = data.users || data || [];
        const match = users.find(
            (u: any) =>
                u.email === pseudoEmail ||
                u.user_metadata?.wallet_address?.toLowerCase() === walletAddress.toLowerCase(),
        );
        return match?.id ?? null;
    } catch {
        return null;
    }
}
