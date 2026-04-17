/**
 * MU6 Auth Service
 *
 * Bridges Thirdweb wallet auth with Supabase profile storage.
 * - On wallet connect: upserts a profile row keyed by wallet_address
 * - On disconnect: clears local state (no session to revoke)
 * - Role check helpers for route guards
 */

import { supabase } from '../lib/supabase';
import type { UserProfile } from '../context/AuthContext';

// ── Profile sync (called by AuthContext on wallet connect) ──

export async function ensureSupabaseProfile(
    walletAddress: string,
    email?: string | null,
): Promise<UserProfile | null> {
    try {
        // 1. Try to find existing profile
        const { data: existing, error: fetchError } = await supabase
            .from('profiles')
            .select('*')
            .eq('wallet_address', walletAddress.toLowerCase())
            .maybeSingle();

        if (existing && !fetchError) {
            // Update email if provided and different
            if (email && email !== existing.email) {
                await supabase
                    .from('profiles')
                    .update({ email })
                    .eq('id', existing.id);
                existing.email = email;
            }
            return mapDbToProfile(existing);
        }

        // 2. Create new profile
        const newId = generateUUID();
        const { data: created, error: createError } = await supabase
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
        .maybeSingle();

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
        cover_path: string;
        creator_type: string;
        country: string;
    }>,
): Promise<UserProfile | null> {
    console.log('[auth] updateProfile called:', profileId, JSON.stringify(updates));
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profileId)
        .select()
        .maybeSingle();

    if (error) {
        console.error('[auth] updateProfile Supabase error:', error.message, error.code, error.details, error.hint);
        return null;
    }
    if (!data) {
        console.error('[auth] updateProfile returned no rows for id:', profileId, '— check RLS or ID mismatch');
        return null;
    }
    console.log('[auth] updateProfile success:', data.id, data.display_name);
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

/**
 * Create or update a profile as an artist in one step.
 * Called from the artist-login flow where info is collected BEFORE wallet connect.
 * Thirdweb auto-creates the wallet, then we save the collected info + wallet address.
 */
export async function createArtistProfile(
    walletAddress: string,
    artistData: {
        displayName: string;
        email: string;
        creatorType: string;
        country: string;
        legalName?: string;
    },
): Promise<UserProfile | null> {
    try {
        const wallet = walletAddress.toLowerCase();

        // Check if profile already exists
        const { data: existing } = await supabase
            .from('profiles')
            .select('*')
            .eq('wallet_address', wallet)
            .maybeSingle();

        if (existing) {
            // Already exists — update role + info if needed
            const { data: updated, error } = await supabase
                .from('profiles')
                .update({
                    role: 'creator',
                    display_name: artistData.displayName,
                    email: artistData.email,
                    creator_type: artistData.creatorType,
                    country: artistData.country,
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (error || !updated) return null;
            return mapDbToProfile(updated);
        }

        // Create new profile directly as creator
        const newId = generateUUID();
        const { data: created, error: createError } = await supabase
            .from('profiles')
            .upsert(
                {
                    id: newId,
                    wallet_address: wallet,
                    display_name: artistData.displayName,
                    email: artistData.email,
                    creator_type: artistData.creatorType,
                    country: artistData.country,
                    role: 'creator',
                },
                { onConflict: 'wallet_address' },
            )
            .select()
            .single();

        if (createError || !created) {
            console.error('[auth] Artist profile creation error:', createError);
            return null;
        }

        return mapDbToProfile(created);
    } catch (err) {
        console.error('[auth] createArtistProfile error:', err);
        return null;
    }
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
        coverPath: row.cover_path,
        isVerified: row.is_verified,
        country: row.country,
        // PDF #13 — admin block/deactivate flags. Default to safe values
        // for legacy rows that predate migration 026.
        isBlocked: row.is_blocked === true,
        isActive: row.is_active !== false,
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
