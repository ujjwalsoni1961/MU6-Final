import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useActiveAccount, useActiveWallet, useDisconnect } from 'thirdweb/react';
import { supabaseAdmin } from '../lib/supabase';

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
    const [isLoading, setIsLoading] = useState(false);

    const walletAddress = account?.address || null;
    const isConnected = !!walletAddress;

    // Sync wallet connection to Supabase profile
    const syncProfile = useCallback(async (address: string) => {
        setIsLoading(true);
        try {
            // Check if profile exists
            const { data: existing } = await supabaseAdmin
                .from('profiles')
                .select('*')
                .eq('wallet_address', address)
                .single();

            if (existing) {
                setProfile(mapDbToProfile(existing));
                return;
            }

            // Create new profile via upsert
            // First, we need a Supabase auth user. For MVP with Thirdweb auth,
            // we use the service role to create the profile directly.
            const newId = crypto.randomUUID ? crypto.randomUUID() : generateUUID();

            const { data: created, error } = await supabaseAdmin
                .from('profiles')
                .upsert({
                    id: newId,
                    wallet_address: address,
                    role: 'listener',
                    display_name: truncateAddress(address),
                }, {
                    onConflict: 'wallet_address',
                })
                .select()
                .single();

            if (error) {
                console.error('Error creating profile:', error);
                // Still set a minimal profile so the app works
                setProfile({
                    id: newId,
                    walletAddress: address,
                    email: null,
                    displayName: truncateAddress(address),
                    bio: null,
                    creatorType: null,
                    role: 'listener',
                    avatarPath: null,
                    isVerified: false,
                    country: null,
                });
                return;
            }

            setProfile(mapDbToProfile(created));
        } catch (err) {
            console.error('Profile sync error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const refreshProfile = useCallback(async () => {
        if (walletAddress) {
            await syncProfile(walletAddress);
        }
    }, [walletAddress, syncProfile]);

    const signOut = useCallback(async () => {
        if (wallet) {
            disconnect(wallet);
        }
        setProfile(null);
    }, [wallet, disconnect]);

    // Auto-sync when wallet connects/changes
    useEffect(() => {
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

function generateUUID(): string {
    // Simple UUID v4 fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
