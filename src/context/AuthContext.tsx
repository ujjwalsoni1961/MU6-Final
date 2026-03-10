import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useActiveAccount, useActiveWallet, useDisconnect } from 'thirdweb/react';
import { supabaseAdmin, createAuthUserForWallet } from '../lib/supabase';

// ── Types ──
export interface UserProfile {
    id: string;
    walletAddress: string;
    email: string | null;
    displayName: string | null;
    bio: string | null;
    creatorType: string | null;
    role: 'listener' | 'creator' | 'admin';
    avatarPath: string | null;
    isVerified: boolean;
    country: string | null;
}

interface AuthContextType {
    profile: UserProfile | null;
    isLoading: boolean;
    isConnected: boolean;
    walletAddress: string | null;
    role: 'listener' | 'creator' | 'admin' | null;
    refreshProfile: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Provider ──
export function AuthProvider({ children }: { children: React.ReactNode }) {
    const account = useActiveAccount();
    const wallet = useActiveWallet();
    const { disconnect } = useDisconnect();

    const [profile, setProfile] = useState<UserProfile | null>(null);
    // BUG FIX #2: isLoading starts TRUE so that the root router
    // shows the loading screen until the initial auth check completes.
    // Previously it was `false`, which created a race condition where
    // isConnected=true but profile hadn't loaded yet, causing the
    // redirect logic to fall through to the login screen.
    const [isLoading, setIsLoading] = useState(true);

    // BUG FIX #3: Flag to prevent re-sync during sign-out.
    // Without this, disconnecting the wallet triggers the useEffect
    // which sees walletAddress become null, but there's a timing window
    // where useActiveAccount() still returns the old account, causing
    // syncProfile to re-fire and effectively re-log in the user.
    const signingOutRef = useRef(false);

    const walletAddress = account?.address || null;
    const isConnected = !!walletAddress;

    // Sync wallet connection to Supabase profile
    const syncProfile = useCallback(async (address: string) => {
        // Don't sync if we're in the middle of signing out
        if (signingOutRef.current) return;

        setIsLoading(true);
        try {
            // Check if profile already exists for this wallet
            const { data: existing } = await supabaseAdmin
                .from('profiles')
                .select('*')
                .eq('wallet_address', address)
                .single();

            if (existing) {
                setProfile(mapDbToProfile(existing));
                return;
            }

            // ── BUG FIX #1: Profile creation ──
            // The profiles table has a FK constraint: profiles.id → auth.users(id).
            // Since we use Thirdweb (not Supabase Auth), we must first create
            // an auth.users entry via the GoTrue Admin API, then use that ID
            // for the profile row. Previously, we generated a random UUID which
            // violated this FK constraint, causing a silent failure. The fallback
            // created an in-memory-only profile that was never persisted to the DB,
            // breaking likes, follows, and any other FK-dependent operations.

            // Step 1: Create auth.users entry for this wallet
            const authUserId = await createAuthUserForWallet(address);
            if (!authUserId) {
                console.error('[auth] Failed to create auth user for wallet:', address);
                // Set profile to null so the app can show an error state
                setProfile(null);
                return;
            }

            // Step 2: Create profile using the auth user's ID
            const { data: created, error } = await supabaseAdmin
                .from('profiles')
                .upsert({
                    id: authUserId,
                    wallet_address: address,
                    role: 'listener',
                    display_name: truncateAddress(address),
                }, {
                    onConflict: 'wallet_address',
                })
                .select()
                .single();

            if (error) {
                console.error('[auth] Error creating profile:', error);
                // DO NOT set a phantom in-memory profile.
                // This was the previous bug: setting a fake profile with an
                // ID that doesn't exist in the DB causes FK violations everywhere.
                setProfile(null);
                return;
            }

            setProfile(mapDbToProfile(created));
        } catch (err) {
            console.error('[auth] Profile sync error:', err);
            setProfile(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const refreshProfile = useCallback(async () => {
        if (walletAddress) {
            await syncProfile(walletAddress);
        }
    }, [walletAddress, syncProfile]);

    // BUG FIX #3: Proper sign-out that prevents re-sync race
    const signOut = useCallback(async () => {
        // Set the flag BEFORE disconnecting so the useEffect won't re-sync
        signingOutRef.current = true;

        // Clear profile state immediately
        setProfile(null);

        // Disconnect the wallet
        if (wallet) {
            try {
                disconnect(wallet);
            } catch (err) {
                console.error('[auth] disconnect error:', err);
            }
        }

        // Small delay to let the wallet state propagate,
        // then reset the signing-out flag
        setTimeout(() => {
            signingOutRef.current = false;
        }, 500);
    }, [wallet, disconnect]);

    // Auto-sync when wallet connects/changes
    useEffect(() => {
        if (signingOutRef.current) {
            // During sign-out, just clear state without re-syncing
            setProfile(null);
            setIsLoading(false);
            return;
        }

        if (walletAddress) {
            syncProfile(walletAddress);
        } else {
            setProfile(null);
            setIsLoading(false);
        }
    }, [walletAddress, syncProfile]);

    return (
        <AuthContext.Provider
            value={{
                profile,
                isLoading,
                isConnected,
                walletAddress,
                role: profile?.role || null,
                refreshProfile,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

// ── Hook ──
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

// ── Helpers ──
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
