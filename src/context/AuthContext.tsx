import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useActiveAccount, useActiveWallet, useDisconnect, useIsAutoConnecting } from 'thirdweb/react';
import { supabase, syncWalletProfile } from '../lib/supabase';

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
    coverPath: string | null;
    isVerified: boolean;
    country: string | null;
    /** PDF #13 — admin can block a user; blocked users are force-signed-out. */
    isBlocked: boolean;
    /** PDF #13 — admin can deactivate an account. */
    isActive: boolean;
}

interface AuthContextType {
    profile: UserProfile | null;
    isLoading: boolean;
    isConnected: boolean;
    walletAddress: string | null;
    role: 'listener' | 'creator' | 'admin' | null;
    /** PDF #13 — true when profile.is_blocked is true. Routing layer uses this to show a suspended screen. */
    isBlocked: boolean;
    /** PDF #13 — false when admin has disabled the account. Routing layer treats !isActive the same as isBlocked. */
    isActive: boolean;
    refreshProfile: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Provider ──
export function AuthProvider({ children }: { children: React.ReactNode }) {
    const account = useActiveAccount();
    const wallet = useActiveWallet();
    const { disconnect } = useDisconnect();
    const isAutoConnecting = useIsAutoConnecting();

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
    // During sign-out, treat as disconnected even if the wallet hook
    // hasn't cleared yet. This prevents stale isConnected=true state
    // from causing redirect loops.
    const isConnected = !!walletAddress && !signingOutRef.current;

    // Sync wallet connection to Supabase profile
    const syncProfile = useCallback(async (address: string) => {
        // Don't sync if we're in the middle of signing out
        if (signingOutRef.current) return;

        setIsLoading(true);
        try {
            // Check if profile already exists for this wallet (public client, RLS allows SELECT)
            const { data: existing } = await supabase
                .from('profiles')
                .select('*')
                .eq('wallet_address', address.toLowerCase())
                .maybeSingle();

            if (existing) {
                // PDF #13 — block enforcement. A blocked user's profile is
                // still loaded so the routing layer can display a clear
                // "Account suspended" screen with a support contact, but
                // all authenticated queries are gated off downstream.
                const mapped = mapDbToProfile(existing);
                setProfile(mapped);
                return;
            }

            // No profile found — call the edge function to create auth user + profile
            // The edge function runs server-side with the service role key
            const result = await syncWalletProfile(address);

            if (!result.profile) {
                console.error('[auth] Edge function failed to create profile for wallet:', address);
                setProfile(null);
                return;
            }

            setProfile(mapDbToProfile(result.profile));
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
        setIsLoading(false);

        // Disconnect the wallet
        if (wallet) {
            try {
                disconnect(wallet);
            } catch (err) {
                console.error('[auth] disconnect error:', err);
            }
        }

        // Give wallet hooks time to clear, then reset the flag.
        // We use a promise so callers can `await signOut()` and
        // navigate only after the full cleanup is done.
        await new Promise<void>((resolve) => {
            setTimeout(() => {
                signingOutRef.current = false;
                resolve();
            }, 300);
        });
    }, [wallet, disconnect]);

    // Auto-sync when wallet connects/changes
    useEffect(() => {
        let mounted = true;
        let timer: NodeJS.Timeout;

        if (signingOutRef.current) {
            // During sign-out, just clear state without re-syncing
            setProfile(null);
            setIsLoading(false);
            return;
        }

        if (walletAddress) {
            syncProfile(walletAddress);
        } else if (!isAutoConnecting) {
            // Only clear state if Thirdweb is done trying to auto-reconnect.
            // Add a small 800ms debounce because on web refresh, isAutoConnecting
            // might be 'false' for a split second before AutoConnect fully mounts.
            timer = setTimeout(() => {
                if (mounted) {
                    setProfile(null);
                    setIsLoading(false);
                }
            }, 800);
        }
        
        return () => {
            mounted = false;
            if (timer) clearTimeout(timer);
        };
    }, [walletAddress, syncProfile, isAutoConnecting]);

    return (
        <AuthContext.Provider
            value={{
                profile,
                isLoading,
                isConnected,
                walletAddress,
                role: profile?.role || null,
                isBlocked: profile?.isBlocked === true,
                // Default true when no profile yet so we don't gate the loading state.
                isActive: profile ? profile.isActive !== false : true,
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
        coverPath: row.cover_path,
        isVerified: row.is_verified,
        country: row.country,
        isBlocked: row.is_blocked === true,
        isActive: row.is_active !== false,
    };
}

function truncateAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
