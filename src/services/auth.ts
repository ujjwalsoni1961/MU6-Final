/**
 * MU6 Auth Service
 *
 * Bridges Thirdweb wallet auth with Supabase profile storage.
 * - On wallet connect: upserts a profile row keyed by wallet_address
 * - On disconnect: clears local state (no session to revoke)
 * - Role check helpers for route guards
 */

import { supabaseAdmin, supabase } from '../lib/supabase';
import type { UserProfile } from '../context/AuthContext';

// ── Profile sync (called by AuthContext on wallet connect) ──

export async function ensureSupabaseProfile(
    walletAddress: string,
    email?: string | null,
): Promise<UserProfile | null> {
    try {
        // 1. Try to find existing profile
        const { data: existing, error: fetchError } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('wallet_address', walletAddress.toLowerCase())
            .single();

        if (existing && !fetchError) {
            // Update email if provided and different
            if (email && email !== existing.email) {
                await supabaseAdmin
                    .from('profiles')
                    .update({ email })
                    .eq('id', existing.id);
                existing.email = email;
            }
            return mapDbToProfile(existing);
        }

        // 2. Create new profile
        const newId = generateUUID();
        const { data: created, error: createError } = await supabaseAdmin
            .from('profiles')
            .upsert(
                {
                    id: newId,
                    wallet_address: walletAddress.toLowerCase(),
                    email: email || null,
                    role: 'listener',
                    display_name: truncateAddress(walletAddress),
                },
                { onConflict: 'wallet_address' },
            )
            .select()
            .single();

        if (createError) {
            console.error('[auth] Profile creation error:', createError);
            return null;
        }

        return mapDbToProfile(created);
    } catch (err) {
        console.error('[auth] ensureSupabaseProfile error:', err);
        return null;
    }
}

// ── Profile helpers ──

export async function getProfileByWallet(walletAddress: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('wallet_address', walletAddress.toLowerCase())
        .single();

    if (error || !data) return null;
    return mapDbToProfile(data);
}

export async function updateProfile(
    profileId: string,
    updates: Partial<{
        display_name: string;
        bio: string;
        email: string;
        avatar_path: string;
        creator_type: string;
        country: string;
    }>,
): Promise<UserProfile | null> {
    const { data, error } = await supabaseAdmin
        .from('profiles')
        .update(updates)
        .eq('id', profileId)
        .select()
        .single();

    if (error || !data) {
        console.error('[auth] updateProfile error:', error);
        return null;
    }
    return mapDbToProfile(data);
}

/**
 * Upgrade a listener to creator role.
 * Called after creator registration form is submitted.
 */
export async function upgradeToCreator(
    profileId: string,
    creatorData: {
        display_name: string;
        email: string;
        creator_type: string;
        country: string;
    },
): Promise<UserProfile | null> {
    return updateProfile(profileId, {
        ...creatorData,
        ...({ role: 'creator' } as any),
    });
}

// ── Role checks ──

export function isCreator(profile: UserProfile | null): boolean {
    return profile?.role === 'creator' || profile?.role === 'admin';
}

export function isAdmin(profile: UserProfile | null): boolean {
    return profile?.role === 'admin';
}

// ── Internal helpers ──

function mapDbToProfile(row: any): UserProfile {
    return {
        id: row.id,
        walletAddress: row.wallet_address,
        email: row.email,
        displayName: row.display_name,
        bio: row.bio,
        creatorType: row.creator_type,
        role: row.role,
        avatarPath: row.avatar_path,
        isVerified: row.is_verified,
        country: row.country,
    };
}

function truncateAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
