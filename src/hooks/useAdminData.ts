/**
 * Admin-specific data hooks
 *
 * Provides comprehensive data access for the admin portal.
 * Each hook queries Supabase directly for admin views.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ────────────────────────────────────────────
// Generic async hook helper
// ────────────────────────────────────────────

interface AsyncState<T> {
    data: T;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

function useAsync<T>(fetcher: () => Promise<T>, initial: T, deps: any[] = []): AsyncState<T> {
    const [data, setData] = useState<T>(initial);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const prevDepsRef = useRef<any[]>(deps);

    const refresh = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        let cancelled = false;
        const depsChanged = prevDepsRef.current.some((dep, i) => dep !== deps[i]) || prevDepsRef.current.length !== deps.length;
        prevDepsRef.current = deps;

        if (tick === 0 || depsChanged) {
            setLoading(true);
        }
        setError(null);
        fetcher()
            .then((result) => { if (!cancelled) { setData(result); setLoading(false); } })
            .catch((err) => { if (!cancelled) { setError(err?.message || 'Unknown error'); setLoading(false); } });
        return () => { cancelled = true; };
    }, [tick, ...deps]);

    return { data, loading, error, refresh };
}

// ────────────────────────────────────────────
// COMPREHENSIVE PLATFORM STATS
// ────────────────────────────────────────────

export interface AdminPlatformStats {
    totalUsers: number;
    totalArtists: number;
    totalConsumers: number;
    totalSongs: number;
    totalStreams: number;
    totalNFTReleases: number;
    totalNFTTokens: number;
    totalListings: number;
    totalRoyaltyEvents: number;
    totalPlaylists: number;
}

export function useAdminFullStats() {
    return useAsync(
        async () => {
            const [
                { count: totalUsers },
                { count: totalArtists },
                { count: totalConsumers },
                { count: totalSongs },
                { count: totalStreams },
                { count: totalNFTReleases },
                { count: totalNFTTokens },
                { count: totalListings },
                { count: totalRoyaltyEvents },
                { count: totalPlaylists },
            ] = await Promise.all([
                supabase.from('profiles').select('*', { count: 'exact', head: true }),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'creator'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'listener'),
                supabase.from('songs').select('*', { count: 'exact', head: true }),
                supabase.from('streams').select('*', { count: 'exact', head: true }),
                supabase.from('nft_releases').select('*', { count: 'exact', head: true }),
                supabase.from('nft_tokens').select('*', { count: 'exact', head: true }),
                supabase.from('marketplace_listings').select('*', { count: 'exact', head: true }),
                supabase.from('royalty_events').select('*', { count: 'exact', head: true }),
                supabase.from('playlists').select('*', { count: 'exact', head: true }),
            ]);

            return {
                totalUsers: totalUsers || 0,
                totalArtists: totalArtists || 0,
                totalConsumers: totalConsumers || 0,
                totalSongs: totalSongs || 0,
                totalStreams: totalStreams || 0,
                totalNFTReleases: totalNFTReleases || 0,
                totalNFTTokens: totalNFTTokens || 0,
                totalListings: totalListings || 0,
                totalRoyaltyEvents: totalRoyaltyEvents || 0,
                totalPlaylists: totalPlaylists || 0,
            } as AdminPlatformStats;
        },
        {
            totalUsers: 0, totalArtists: 0, totalConsumers: 0, totalSongs: 0,
            totalStreams: 0, totalNFTReleases: 0, totalNFTTokens: 0,
            totalListings: 0, totalRoyaltyEvents: 0, totalPlaylists: 0,
        } as AdminPlatformStats,
        [],
    );
}

// ────────────────────────────────────────────
// USERS (with search/filter)
// ────────────────────────────────────────────

export function useAdminUsersFiltered(filters?: {
    search?: string;
    role?: string;
    country?: string;
    limit?: number;
    offset?: number;
}) {
    const search = filters?.search || '';
    const role = filters?.role || '';
    const country = filters?.country || '';
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    return useAsync(
        async () => {
            let query = supabase
                .from('profiles')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (role) {
                query = query.eq('role', role);
            }
            if (country) {
                query = query.eq('country', country);
            }
            if (search) {
                query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%,wallet_address.ilike.%${search}%`);
            }

            const { data, error, count } = await query;
            if (error) return { users: [], total: 0 };

            const users = (data || []).map((row: any) => ({
                id: row.id,
                name: row.display_name || 'Unnamed',
                email: row.email || '',
                walletAddress: row.wallet_address || '',
                role: row.role,
                country: row.country || '',
                avatarPath: row.avatar_path,
                isVerified: row.is_verified,
                isActive: row.is_active ?? true,
                isBlocked: row.is_blocked ?? false,
                createdAt: row.created_at,
                bio: row.bio || '',
                creatorType: row.creator_type || '',
            }));

            return { users, total: count || 0 };
        },
        { users: [], total: 0 },
        [search, role, country, limit, offset],
    );
}

// ────────────────────────────────────────────
// SONGS (with search/filter)
// ────────────────────────────────────────────

export function useAdminSongsFiltered(filters?: {
    search?: string;
    genre?: string;
    limit?: number;
    offset?: number;
}) {
    const search = filters?.search || '';
    const genre = filters?.genre || '';
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    return useAsync(
        async () => {
            let query = supabase
                .from('songs')
                .select(`
                    *,
                    creator:profiles!creator_id (
                        id, display_name, avatar_path, role
                    )
                `, { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (genre) {
                query = query.eq('genre', genre);
            }
            if (search) {
                query = query.or(`title.ilike.%${search}%,genre.ilike.%${search}%`);
            }

            const { data, error, count } = await query;
            if (error) return { songs: [], total: 0 };

            const songs = (data || []).map((row: any) => ({
                id: row.id,
                title: row.title,
                artistName: row.creator?.display_name || 'Unknown',
                genre: row.genre || 'Other',
                playsCount: row.plays_count || 0,
                likesCount: row.likes_count || 0,
                isPublished: row.is_published,
                isListed: row.is_listed ?? true,
                isFeatured: row.is_featured ?? false,
                coverPath: row.cover_path,
                createdAt: row.created_at,
                releaseDate: row.release_date,
                durationSeconds: row.duration_seconds,
                creatorId: row.creator_id,
            }));

            return { songs, total: count || 0 };
        },
        { songs: [], total: 0 },
        [search, genre, limit, offset],
    );
}

// ────────────────────────────────────────────
// PLAYLISTS
// ────────────────────────────────────────────

export function useAdminPlaylists(limit = 50) {
    return useAsync(
        async () => {
            const { data, error } = await supabase
                .from('playlists')
                .select(`
                    *,
                    profile:profiles!owner_id (
                        id, display_name
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                name: row.name,
                ownerName: row.profile?.display_name || 'Unknown',
                ownerId: row.owner_id,
                isPublic: row.is_public,
                createdAt: row.created_at,
            }));
        },
        [],
        [limit],
    );
}

// ────────────────────────────────────────────
// NFT RELEASES
// ────────────────────────────────────────────

export function useAdminNFTReleases(limit = 50) {
    return useAsync(
        async () => {
            const { data, error } = await supabase
                .from('nft_releases')
                .select(`
                    *,
                    song:songs!song_id (
                        id, title, cover_path,
                        creator:profiles!creator_id (
                            id, display_name
                        )
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                songTitle: row.song?.title || 'Unknown',
                artistName: row.song?.creator?.display_name || 'Unknown',
                tierName: row.tier_name,
                rarity: row.rarity,
                totalSupply: row.total_supply,
                mintedCount: row.minted_count,
                priceEth: row.price_eth ? parseFloat(row.price_eth) : 0,
                isActive: row.is_active,
                createdAt: row.created_at,
                contractAddress: row.contract_address,
                coverPath: row.song?.cover_path,
            }));
        },
        [],
        [limit],
    );
}

// ────────────────────────────────────────────
// NFT TOKENS
// ────────────────────────────────────────────

export function useAdminNFTTokens(limit = 50) {
    return useAsync(
        async () => {
            const { data, error } = await supabase
                .from('nft_tokens')
                .select(`
                    *,
                    release:nft_releases!nft_release_id (
                        id, tier_name, rarity,
                        song:songs!song_id (
                            id, title
                        )
                    )
                `)
                .order('minted_at', { ascending: false })
                .limit(limit);

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                songTitle: row.release?.song?.title || 'Unknown',
                tierName: row.release?.tier_name || '',
                rarity: row.release?.rarity || '',
                ownerWallet: row.owner_wallet_address,
                // PDF #14/#16 — prefer the real on-chain tokenId written by
                // the atomic mint flow. Fall back to legacy `token_id` for
                // rows that predate migration 026.
                onChainTokenId: row.on_chain_token_id || row.token_id || '',
                pricePaidEth: row.price_paid_eth ? parseFloat(row.price_paid_eth) : 0,
                isVoided: row.is_voided ?? false,
                mintedAt: row.minted_at,
            }));
        },
        [],
        [limit],
    );
}

// ────────────────────────────────────────────
// MARKETPLACE LISTINGS
// ────────────────────────────────────────────

export function useAdminMarketplaceListings(limit = 50) {
    return useAsync(
        async () => {
            const { data, error } = await supabase
                .from('marketplace_listings')
                .select(`
                    *,
                    nft_token:nft_tokens!nft_token_id (
                        id, owner_wallet_address,
                        release:nft_releases!nft_release_id (
                            song:songs!song_id ( id, title )
                        )
                    )
                `)
                .order('listed_at', { ascending: false })
                .limit(limit);

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                songTitle: row.nft_token?.release?.song?.title || 'Unknown',
                sellerWallet: row.seller_wallet,
                buyerWallet: row.buyer_wallet,
                priceEth: parseFloat(row.price_eth),
                isActive: row.is_active,
                isFlagged: row.is_flagged ?? false,
                listedAt: row.listed_at,
                soldAt: row.sold_at,
            }));
        },
        [],
        [limit],
    );
}

// ────────────────────────────────────────────
// STREAMS
// ────────────────────────────────────────────

export function useAdminStreams(limit = 50) {
    return useAsync(
        async () => {
            const { data, error } = await supabase
                .from('streams')
                .select(`
                    *,
                    song:songs!song_id ( id, title ),
                    listener:profiles!listener_profile_id ( id, display_name )
                `)
                .order('started_at', { ascending: false })
                .limit(limit);

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                songTitle: row.song?.title || 'Unknown',
                listenerName: row.listener?.display_name || 'Anonymous',
                startedAt: row.started_at,
                durationSeconds: row.duration_seconds,
                isQualified: row.is_qualified,
            }));
        },
        [],
        [limit],
    );
}

// ────────────────────────────────────────────
// ROYALTY EVENTS
// ────────────────────────────────────────────

export function useAdminRoyaltyEvents(limit = 50) {
    return useAsync(
        async () => {
            const { data, error } = await supabase
                .from('royalty_events')
                .select(`
                    *,
                    song:songs!song_id ( id, title )
                `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                songTitle: row.song?.title || 'Unknown',
                sourceType: row.source_type,
                grossAmountEur: parseFloat(row.gross_amount_eur) || 0,
                accountingPeriod: row.accounting_period,
                createdAt: row.created_at,
            }));
        },
        [],
        [limit],
    );
}

// ────────────────────────────────────────────
// ROYALTY SHARES
// ────────────────────────────────────────────

export function useAdminRoyaltyShares(limit = 50) {
    return useAsync(
        async () => {
            const { data, error } = await supabase
                .from('royalty_shares')
                .select(`
                    *,
                    royalty_event:royalty_events!royalty_event_id (
                        id, song_id, source_type,
                        song:songs!song_id ( id, title )
                    ),
                    profile:profiles!linked_profile_id ( id, display_name )
                `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                songTitle: row.royalty_event?.song?.title || 'Unknown',
                sourceType: row.royalty_event?.source_type || '',
                partyEmail: row.party_email || '',
                partyName: row.profile?.display_name || row.party_email || 'Unknown',
                shareType: row.share_type,
                sharePercent: parseFloat(row.share_percent) || 0,
                amountEur: parseFloat(row.amount_eur) || 0,
                createdAt: row.created_at,
            }));
        },
        [],
        [limit],
    );
}

// ────────────────────────────────────────────
// SONG RIGHTS SPLITS
// ────────────────────────────────────────────

export function useAdminSongSplits(limit = 100) {
    return useAsync(
        async () => {
            const { data, error } = await supabase
                .from('song_rights_splits')
                .select(`
                    *,
                    song:songs!song_id ( id, title )
                `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                songTitle: row.song?.title || 'Unknown',
                partyName: row.party_name,
                partyEmail: row.party_email,
                role: row.role,
                sharePercent: parseFloat(row.share_percent) || 0,
            }));
        },
        [],
        [limit],
    );
}

// ────────────────────────────────────────────
// PAYOUT REQUESTS
// ────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export function useAdminPayoutRequests(adminProfileId?: string | 'superadmin', limit = 50) {
    return useAsync(
        async () => {
            // For the admin dashboard, we can override with 'superadmin' if no specific profile is given.
            // If the user uses standard 'useAuth' and has a profile ID, we send that.
            const targetProfile = adminProfileId || 'superadmin';

            try {
                const response = await fetch(`${SUPABASE_URL}/functions/v1/payout-list`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({ profileId: targetProfile }),
                });

                if (!response.ok) {
                    throw new Error(`Edge function returned ${response.status}`);
                }

                const result = await response.json();
                console.log("[useAdminPayoutRequests] Edge Function returned:", result);
                
                if (!result.success) {
                    throw new Error(result.error || 'Failed to fetch payout requests');
                }

                return (result.payouts || []).map((row: any) => ({
                    id: row.id,
                    profileId: row.profile_id,
                    profileName: row.profile?.display_name || 'Unknown',
                    walletAddress: row.profile?.wallet_address || '',
                    amountEur: parseFloat(row.amount_eur) || 0,
                    paymentMethod: row.payment_method || '',
                    status: row.status,
                    adminNotes: row.admin_notes || '',
                    createdAt: row.requested_at,
                    processedAt: row.processed_at,
                }));
            } catch (error: any) {
                console.error("[useAdminPayoutRequests] Error:", error);
                throw error;
            }
        },
        [],
        [limit, adminProfileId],
    );
}

// ────────────────────────────────────────────
// PLATFORM SETTINGS
// ────────────────────────────────────────────

export function useAdminPlatformSettings() {
    return useAsync(
        async () => {
            const { data, error } = await supabase
                .from('platform_settings')
                .select('*')
                .order('key', { ascending: true });

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id || row.key,
                key: row.key,
                value: row.value,
                updatedAt: row.updated_at,
            }));
        },
        [],
        [],
    );
}

// ────────────────────────────────────────────
// ADMIN AUDIT LOG
// ────────────────────────────────────────────

export function useAdminAuditLog(limit = 50) {
    return useAsync(
        async () => {
            const { data, error } = await supabase
                .from('admin_audit_log')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                action: row.action,
                adminId: row.admin_id,
                targetType: row.target_type,
                targetId: row.target_id,
                details: row.details,
                createdAt: row.created_at,
            }));
        },
        [],
        [limit],
    );
}

// ────────────────────────────────────────────
// NOTIFICATIONS
// ────────────────────────────────────────────

export function useAdminNotifications(limit = 50) {
    return useAsync(
        async () => {
            const { data, error } = await supabase
                .from('notifications')
                .select(`
                    *,
                    profile:profiles!profile_id ( id, display_name )
                `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                profileName: row.profile?.display_name || 'Unknown',
                profileId: row.profile_id,
                type: row.type,
                title: row.title,
                body: row.body,
                isRead: row.is_read,
                createdAt: row.created_at,
            }));
        },
        [],
        [limit],
    );
}
