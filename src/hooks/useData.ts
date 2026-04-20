/**
 * MU6 Data Hooks
 *
 * React hooks that bridge the Supabase service layer (database.ts)
 * with UI components. Handles:
 *  - Type transformation (DB camelCase → flat UI props)
 *  - Storage URL resolution (coverPath → public URL)
 *  - Loading / error / refresh states
 *  - Auth-scoped queries (likes, follows, owned NFTs)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import * as db from '../services/database';
import * as blockchain from '../services/blockchain';
import { readErc1155BalanceBatch, fetchTokenMetadataFromChain } from './useOnChainNFT';
import type {
    Song as DbSong,
    ArtistProfile as DbArtist,
    NFTRelease as DbNFTRelease,
    NFTToken as DbNFTToken,
    MarketplaceListing as DbListing,
    CreatorDashboardStats,
    CreatorRoyaltySummary,
    SplitEntry,
    StreamEntry,
    RoyaltyShare as DbRoyaltyShare,
} from '../services/database';
import type { Song, Artist, NFT, Transaction, User, OwnedNFT } from '../types';

// ────────────────────────────────────────────
// Storage URL helpers
// ────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

function coverUrl(path: string | null | undefined): string {
    if (!path) return 'https://placehold.co/400x400/1e293b/94a3b8?text=♪';
    if (path.startsWith('http')) return path;
    return db.getPublicUrl('covers', path);
}

/** Known preset avatar IDs (emoji genre avatars, not storage files) */
export const PRESET_AVATAR_IDS = new Set([
    'pop', 'hiphop', 'rock', 'electronic', 'jazz', 'classical',
    'rnb', 'lofi', 'country', 'metal', 'reggae', 'afrobeat',
]);

function avatarUrl(path: string | null | undefined): string {
    if (!path) return 'https://placehold.co/200x200/1e293b/94a3b8?text=👤';
    // Preset avatar IDs are short strings like "pop", "rock" — not file paths
    if (PRESET_AVATAR_IDS.has(path)) return `preset:${path}`;
    if (path.startsWith('http')) return path;
    return db.getPublicUrl('avatars', path);
}

function formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ────────────────────────────────────────────
// Type Adapters: DB → UI shapes
// ────────────────────────────────────────────

// Cache for NFT release song IDs (populated on first use)
let _nftSongIdsCache: Set<string> | null = null;
let _nftSongIdsCacheTime = 0;
const NFT_CACHE_TTL = 60_000; // 60 seconds

async function getNFTSongIds(): Promise<Set<string>> {
    const now = Date.now();
    if (_nftSongIdsCache && now - _nftSongIdsCacheTime < NFT_CACHE_TTL) {
        return _nftSongIdsCache;
    }
    try {
        const releases = await db.getNFTReleases();
        _nftSongIdsCache = new Set(releases.map((r) => r.songId));
        _nftSongIdsCacheTime = now;
    } catch {
        _nftSongIdsCache = new Set();
    }
    return _nftSongIdsCache;
}

/** Convert a DB Song (with joined creator) to the flat UI Song type */
export function adaptSong(s: DbSong, nftSongIds?: Set<string>): Song {
    return {
        id: s.id,
        title: s.title,
        artistName: s.creator?.displayName || 'Unknown Artist',
        coverImage: coverUrl(s.coverPath),
        genre: s.genre || 'Other',
        duration: formatDuration(s.durationSeconds),
        plays: s.playsCount,
        likes: s.likesCount,
        price: 0, // filled by NFT context if applicable
        isNFT: nftSongIds ? nftSongIds.has(s.id) : false,
        isPublished: s.isPublished,
        lyrics: s.description || undefined,
        credits: s.creator
            ? {
                  performedBy: s.creator.displayName || 'Unknown',
                  writtenBy: s.creator.displayName || 'Unknown',
                  producedBy: s.creator.displayName || 'Unknown',
                  releaseDate: s.releaseDate || s.createdAt?.split('T')[0] || '',
              }
            : undefined,
        // Extended fields for internal use
        _creatorId: s.creatorId,
        _audioPath: s.audioPath,
        _coverPath: s.coverPath,
        _durationSeconds: s.durationSeconds,
    };
}

/** Convert a DB ArtistProfile to the flat UI Artist type */
export function adaptArtist(a: DbArtist, stats?: { totalSongs?: number; followers?: number }): Artist {
    return {
        id: a.id,
        name: a.displayName || 'Unnamed Artist',
        avatar: avatarUrl(a.avatarPath),
        cover: a.coverPath ? coverUrl(a.coverPath) : null,
        bio: a.bio || '',
        followers: stats?.followers || 0,
        totalSongs: stats?.totalSongs || 0,
        totalNFTsSold: 0,
        totalEarnings: 0,
        verified: a.isVerified,
    };
}

/** Convert a DB NFTRelease to the flat UI NFT type */
export function adaptNFTRelease(r: DbNFTRelease): NFT {
    return {
        id: r.id,
        songId: r.songId,
        creatorId: r.song?.creatorId || '',
        songTitle: r.song?.title || 'Unknown Song',
        artistName: r.song?.creator?.displayName || 'Unknown Artist',
        coverImage: r.coverImagePath ? coverUrl(r.coverImagePath) : coverUrl(r.song?.coverPath),
        nftCoverImage: r.coverImagePath ? coverUrl(r.coverImagePath) : undefined,
        price: r.priceEth || 0,
        editionNumber: r.mintedCount, // how many minted so far
        totalEditions: r.totalSupply,
        mintedCount: r.mintedCount,
        owner: '', // not applicable for releases
        rarity: (r.rarity as NFT['rarity']) || 'common',
        tierName: r.tierName,
        description: r.description,
        benefits: r.benefits,
        allocatedRoyaltyPercent: r.allocatedRoyaltyPercent,
    };
}

/** Convert a DB NFTToken (owned) to the flat UI NFT type.
 *  Pass editionNumber explicitly when computing per-release edition numbers. */
export function adaptNFTToken(t: DbNFTToken, editionNum?: number): NFT {
    const release = t.release;
    const song = release?.song;
    return {
        id: t.id,
        songId: release?.songId || '',
        creatorId: (song as any)?.creatorId || '',
        songTitle: song?.title || 'Unknown Song',
        artistName: (song as any)?.creator?.displayName || 'Unknown Artist',
        coverImage: release?.coverImagePath ? coverUrl(release.coverImagePath) : coverUrl(song?.coverPath),
        nftCoverImage: release?.coverImagePath ? coverUrl(release.coverImagePath) : undefined,
        // Price shown on a card = last traded price (LTP) of this specific
        // token. Fall back to `pricePaidEth` (what the current owner paid)
        // and finally to the release's primary drop price. A `null` LTP
        // means the token never sold; 0 is a legit value (free mint) so we
        // use explicit null-checks, not truthy-falsy fallback chains.
        price: (t.lastSalePriceToken != null)
            ? t.lastSalePriceToken
            : (t.pricePaidEth != null ? t.pricePaidEth : (release?.priceEth || 0)),
        editionNumber: editionNum ?? 0,
        totalEditions: release?.totalSupply || 0,
        mintedCount: release?.mintedCount || 0,
        owner: t.ownerWalletAddress,
        rarity: (release?.rarity as NFT['rarity']) || 'common',
        tierName: release?.tierName,
        description: release?.description,
        benefits: release?.benefits,
        allocatedRoyaltyPercent: release?.allocatedRoyaltyPercent,
        onChainTokenId: t.onChainTokenId || undefined,
        ownerWallet: t.ownerWalletAddress,
    };
}

/** Convert a DB MarketplaceListing to the flat UI NFT shape (for marketplace).
 *  Pass editionNumber explicitly when computing per-release edition numbers. */
export function adaptListing(l: DbListing, editionNum?: number): NFT & { listingId: string; sellerWallet: string; nftTokenId: string } {
    const token = l.nftToken;
    const release = token?.release;
    const song = release?.song;
    return {
        id: token?.id || l.id,
        nftTokenId: l.nftTokenId,
        listingId: l.id,
        sellerWallet: l.sellerWallet,
        songId: release?.songId || '',
        creatorId: (song as any)?.creatorId || '',
        songTitle: song?.title || 'Unknown Song',
        artistName: (song as any)?.creator?.displayName || 'Unknown Artist',
        coverImage: release?.coverImagePath ? coverUrl(release.coverImagePath) : coverUrl(song?.coverPath),
        nftCoverImage: release?.coverImagePath ? coverUrl(release.coverImagePath) : undefined,
        price: l.priceEth,
        editionNumber: editionNum ?? 0,
        totalEditions: release?.totalSupply || 0,
        mintedCount: release?.mintedCount || 0,
        owner: l.sellerWallet,
        rarity: (release?.rarity as NFT['rarity']) || 'common',
        tierName: release?.tierName,
        description: release?.description,
        benefits: release?.benefits,
        allocatedRoyaltyPercent: release?.allocatedRoyaltyPercent,
        onChainTokenId: token?.onChainTokenId || undefined,
        ownerWallet: l.sellerWallet,
    };
}

/** Convert a DB profile to the flat UI User type */
export function adaptUser(p: DbArtist): User {
    return {
        id: p.id,
        name: p.displayName || 'Unnamed',
        avatar: avatarUrl(p.avatarPath),
        walletAddress: p.walletAddress || '',
        ownedNFTs: 0,
        likedSongs: 0,
        email: '',
        role: p.role === 'creator' ? 'artist' : (p.role as User['role']),
        joinedDate: '',
        status: 'active',
    };
}

// ────────────────────────────────────────────
// Generic async hook helper
// ────────────────────────────────────────────

interface AsyncState<T> {
    data: T;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

const FETCH_TIMEOUT_MS = 15_000; // 15-second timeout for data fetches

function useAsync<T>(fetcher: () => Promise<T>, initial: T, deps: any[] = []): AsyncState<T> {
    const [data, setData] = useState<T>(initial);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const prevDepsRef = useRef<any[]>(deps);

    const refresh = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        let cancelled = false;

        // Check if deps changed (excluding tick)
        const depsChanged = prevDepsRef.current.some((dep, i) => dep !== deps[i]) || prevDepsRef.current.length !== deps.length;
        prevDepsRef.current = deps;

        // Only set hard loading if it's initial load or deps changed
        if (tick === 0 || depsChanged) {
            setLoading(true);
            setData(initial); // Reset data on dep change
        }

        setError(null);

        // Race the fetcher against a timeout so loading never gets stuck
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out. Pull down to retry.')), FETCH_TIMEOUT_MS),
        );

        Promise.race([fetcher(), timeout])
            .then((result) => {
                if (!cancelled) {
                    setData(result);
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err?.message || 'Something went wrong. Pull down to retry.');
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [tick, ...deps]);

    return { data, loading, error, refresh };
}

// ────────────────────────────────────────────
// CONSUMER HOOKS
// ────────────────────────────────────────────

/** Trending songs (by play count) */
export function useTrendingSongs(limit = 10) {
    return useAsync(
        async () => {
            const [songs, nftSongIds] = await Promise.all([
                db.getTrendingSongs(limit),
                getNFTSongIds(),
            ]);
            return songs.map((s) => adaptSong(s, nftSongIds));
        },
        [] as Song[],
        [limit],
    );
}

/** New releases (by release date) */
export function useNewReleases(limit = 10) {
    return useAsync(
        async () => {
            const [songs, nftSongIds] = await Promise.all([
                db.getNewReleases(limit),
                getNFTSongIds(),
            ]);
            return songs.map((s) => adaptSong(s, nftSongIds));
        },
        [] as Song[],
        [limit],
    );
}

/** All published songs (paginated) */
export function useSongs(filters?: { genre?: string; search?: string; limit?: number }) {
    return useAsync(
        async () => {
            const [songs, nftSongIds] = await Promise.all([
                db.getSongs(filters),
                getNFTSongIds(),
            ]);
            return songs.map((s) => adaptSong(s, nftSongIds));
        },
        [] as Song[],
        [filters?.genre, filters?.search, filters?.limit],
    );
}

/** Single song by ID */
export function useSongById(id: string | undefined) {
    return useAsync(
        async () => {
            if (!id) return null;
            const [s, nftSongIds] = await Promise.all([
                db.getSongById(id),
                getNFTSongIds(),
            ]);
            return s ? adaptSong(s, nftSongIds) : null;
        },
        null as Song | null,
        [id],
    );
}

/** Search artists by name */
export function useSearchArtists(query: string | undefined) {
    return useAsync(
        async () => {
            if (!query) return [];
            const artists = await db.searchArtists(query);
            return artists.map((a) => adaptArtist(a));
        },
        [] as Artist[],
        [query],
    );
}

/** Artists list */
export function useArtists(limit = 20) {
    return useAsync(
        async () => {
            const artists = await db.getArtists(limit);
            return artists.map((a) => adaptArtist(a));
        },
        [] as Artist[],
        [limit],
    );
}

/** Single artist by ID */
export function useArtistById(id: string | undefined) {
    return useAsync(
        async () => {
            if (!id) return null;
            const a = await db.getArtistById(id);
            if (!a) return null;
            const [songs, followers] = await Promise.all([
                db.getArtistSongs(id),
                db.getFollowersCount(id)
            ]);
            return adaptArtist(a, { totalSongs: songs.length, followers });
        },
        null as Artist | null,
        [id],
    );
}

/** Songs by a specific artist */
export function useArtistSongs(creatorId: string | undefined) {
    return useAsync(
        async () => {
            if (!creatorId) return [];
            const [songs, nftSongIds] = await Promise.all([
                db.getArtistSongs(creatorId),
                getNFTSongIds(),
            ]);
            return songs.map((s) => adaptSong(s, nftSongIds));
        },
        [] as Song[],
        [creatorId],
    );
}

/** NFT releases (for marketplace / drops) */
export function useNFTReleases(songId?: string) {
    return useAsync(
        async () => {
            const releases = await db.getNFTReleases(songId);
            return releases.map(adaptNFTRelease);
        },
        [] as NFT[],
        [songId],
    );
}

export function useNFTReleaseById(id: string) {
    return useAsync(
        async () => {
            if (!id) return null;
            const release = await db.getNFTReleaseById(id);
            return release ? adaptNFTRelease(release) : null;
        },
        null as NFT | null,
        [id],
    );
}

export function useNFTTokenById(id: string) {
    return useAsync(
        async () => {
            if (!id) return null;
            const token = await db.getNFTTokenById(id);
            if (!token) return null;
            const editionMap = await db.getEditionNumbers([token.id]);
            return adaptNFTToken(token, editionMap[token.id]);
        },
        null as NFT | null,
        [id],
    );
}

/** Marketplace listings (active) */
export function useMarketplaceListings(limit?: number) {
    return useAsync(
        async () => {
            const listings = await db.getMarketplaceListings({ isActive: true, limit });
            // Compute per-release edition numbers
            const tokenIds = listings.map(l => l.nftToken?.id).filter(Boolean) as string[];
            const editionMap = await db.getEditionNumbers(tokenIds);
            return listings.map(l => adaptListing(l, editionMap[l.nftToken?.id || '']));
        },
        [] as (NFT & { listingId: string; sellerWallet: string; nftTokenId: string })[],
        [limit],
    );
}

/** User's liked songs */
export function useLikedSongs() {
    const { profile } = useAuth();
    return useAsync(
        async () => {
            if (!profile?.id) return [];
            const [songs, nftSongIds] = await Promise.all([
                db.getLikedSongs(profile.id),
                getNFTSongIds(),
            ]);
            return songs.map((s) => adaptSong(s, nftSongIds));
        },
        [] as Song[],
        [profile?.id],
    );
}

/** User's owned NFTs (by wallet) */
export function useOwnedNFTs() {
    const { walletAddress } = useAuth();
    return useAsync(
        async () => {
            if (!walletAddress) return [];
            const tokens = await db.getNFTTokensByOwner(walletAddress);
            const editionMap = await db.getEditionNumbers(tokens.map(t => t.id));
            return tokens.map(t => adaptNFTToken(t, editionMap[t.id]));
        },
        [] as NFT[],
        [walletAddress],
    );
}

/** Check if current user liked a song */
export function useIsLiked(songId: string | undefined) {
    const { profile } = useAuth();
    const [liked, setLiked] = useState(false);

    useEffect(() => {
        if (!songId || !profile?.id) {
            setLiked(false);
            return;
        }
        db.isLikedByUser(songId, profile.id).then(setLiked);
    }, [songId, profile?.id]);

    const toggle = useCallback(async () => {
        if (!songId || !profile?.id) return;
        if (liked) {
            await db.unlikeSong(songId, profile.id);
            setLiked(false);
        } else {
            await db.likeSong(songId, profile.id);
            setLiked(true);
        }
    }, [songId, profile?.id, liked]);

    return { liked, toggle };
}

/**
 * Live follower / following counts for a profile.
 *
 * The consumer profile previously hard-coded "Following: 0" which never
 * updated. This hook fetches both counts and exposes a `refresh()` the
 * screen can call after the user follows or unfollows an artist so the
 * stats stay in sync with the `follows` table.
 */
export function useFollowCounts(profileId: string | undefined) {
    const [counts, setCounts] = useState<{ followers: number; following: number }>({ followers: 0, following: 0 });
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!profileId) {
            setCounts({ followers: 0, following: 0 });
            return;
        }
        setLoading(true);
        try {
            const [followers, following] = await Promise.all([
                db.getFollowersCount(profileId),
                db.getFollowingCount(profileId),
            ]);
            setCounts({ followers, following });
        } finally {
            setLoading(false);
        }
    }, [profileId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { ...counts, loading, refresh };
}

/** Check if current user follows an artist */
export function useIsFollowing(artistId: string | undefined) {
    const { profile } = useAuth();
    const [following, setFollowing] = useState(false);

    useEffect(() => {
        if (!artistId || !profile?.id) {
            setFollowing(false);
            return;
        }
        db.isFollowing(profile.id, artistId).then(setFollowing);
    }, [artistId, profile?.id]);

    const toggle = useCallback(async () => {
        if (!artistId || !profile?.id) return;
        if (following) {
            await db.unfollowArtist(profile.id, artistId);
            setFollowing(false);
        } else {
            await db.followArtist(profile.id, artistId);
            setFollowing(true);
        }
    }, [artistId, profile?.id, following]);

    return { following, toggle };
}

// ────────────────────────────────────────────
// NOTIFICATIONS
// ────────────────────────────────────────────

interface NotificationItem {
    id: string;
    type: string;
    title: string;
    body: string | null;
    isRead: boolean;
    createdAt: string;
}

/** Notifications for the current user */
export function useNotifications(limit = 50) {
    const { profile } = useAuth();
    const state = useAsync(
        async () => {
            if (!profile?.id) return [];
            const { supabase: client } = await import('../lib/supabase');
            const { data, error } = await client
                .from('notifications')
                .select('*')
                .eq('profile_id', profile.id)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error || !data) return [];
            return data.map((row: any): NotificationItem => ({
                id: row.id,
                type: row.type,
                title: row.title,
                body: row.body,
                isRead: row.is_read,
                createdAt: row.created_at,
            }));
        },
        [] as NotificationItem[],
        [profile?.id, limit],
    );

    const markAllRead = useCallback(async () => {
        if (!profile?.id) return;
        const { supabase: client } = await import('../lib/supabase');
        await client
            .from('notifications')
            .update({ is_read: true })
            .eq('profile_id', profile.id)
            .eq('is_read', false);
        state.refresh();
    }, [profile?.id, state.refresh]);

    return { ...state, markAllRead };
}

/** Unread notification count for the current user (for badge) */
export function useUnreadNotificationCount() {
    const { profile } = useAuth();
    return useAsync(
        async () => {
            if (!profile?.id) return 0;
            const { supabase: client } = await import('../lib/supabase');
            const { count, error } = await client
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('profile_id', profile.id)
                .eq('is_read', false);

            if (error) return 0;
            return count || 0;
        },
        0,
        [profile?.id],
    );
}

// ────────────────────────────────────────────
// CREATOR HOOKS
// ────────────────────────────────────────────

/** Creator dashboard stats */
export function useCreatorDashboard() {
    const { profile } = useAuth();
    return useAsync(
        async () => {
            if (!profile?.id) return null;
            return db.getCreatorDashboard(profile.id);
        },
        null as CreatorDashboardStats | null,
        [profile?.id],
    );
}

/** Creator's own songs (published + drafts) */
export function useCreatorSongs() {
    const { profile } = useAuth();
    return useAsync(
        async () => {
            if (!profile?.id) return [];
            const [songs, nftSongIds] = await Promise.all([
                db.getSongs({ creatorId: profile.id, includeDrafts: true }),
                getNFTSongIds(),
            ]);
            return songs.map((s) => adaptSong(s, nftSongIds));
        },
        [] as Song[],
        [profile?.id],
    );
}

/** NFT releases for creator's songs */
export function useCreatorNFTs() {
    const { profile } = useAuth();
    return useAsync(
        async () => {
            if (!profile?.id) return [];
            // Get all songs first (including drafts), then get NFT releases for them
            const songs = await db.getSongs({ creatorId: profile.id, includeDrafts: true });
            const allReleases: NFT[] = [];
            for (const song of songs) {
                const releases = await db.getNFTReleases(song.id);
                allReleases.push(...releases.map(adaptNFTRelease));
            }
            return allReleases;
        },
        [] as NFT[],
        [profile?.id],
    );
}

// ────────────────────────────────────────────
// ROYALTY & SPLIT SHEET HOOKS
// ────────────────────────────────────────────

/** Creator's full royalty summary (stream + NFT revenue, per-song breakdown) */
export function useCreatorRoyalties() {
    const { profile } = useAuth();
    return useAsync(
        async () => {
            if (!profile?.id) return null;
            return db.getCreatorRoyaltySummary(profile.id);
        },
        null as CreatorRoyaltySummary | null,
        [profile?.id],
    );
}

/** Recent royalty share entries for current user (for transaction history) */
export function useRoyaltyHistory(limit = 50) {
    const { profile } = useAuth();
    return useAsync(
        async () => {
            if (!profile?.id) return [];
            return db.getRoyaltySharesByProfile(profile.id, { limit });
        },
        [] as DbRoyaltyShare[],
        [profile?.id, limit],
    );
}

/** Split sheet for a specific song */
export function useSongSplitSheet(songId: string | undefined) {
    return useAsync(
        async () => {
            if (!songId) return [];
            return db.getSplitsBySong(songId);
        },
        [] as SplitEntry[],
        [songId],
    );
}

/** Mutation hook: upsert a split sheet */
export function useUpsertSplitSheet() {
    const [state, setState] = useState<MutationState>({ loading: false, error: null, success: false });

    const execute = useCallback(async (
        songId: string,
        splits: Array<{
            partyEmail: string;
            partyName: string;
            role: string;
            sharePercent: number;
            linkedProfileId?: string;
            linkedWalletAddress?: string;
        }>,
    ) => {
        setState({ loading: true, error: null, success: false });
        try {
            // Validate SUM = 100
            const total = splits.reduce((sum, s) => sum + s.sharePercent, 0);
            if (Math.abs(total - 100) > 0.01) {
                setState({ loading: false, error: `Split percentages must sum to 100% (currently ${total.toFixed(2)}%)`, success: false });
                return null;
            }

            const result = await db.upsertSplitSheet(songId, splits);
            if (result.length === 0) {
                setState({ loading: false, error: 'Failed to save split sheet', success: false });
                return null;
            }
            setState({ loading: false, error: null, success: true });
            return result;
        } catch (err: any) {
            setState({ loading: false, error: err.message, success: false });
            return null;
        }
    }, []);

    const reset = useCallback(() => setState({ loading: false, error: null, success: false }), []);

    return { ...state, execute, reset };
}

// ────────────────────────────────────────────
// ADMIN HOOKS
// ────────────────────────────────────────────

/** All users for admin */
export function useAdminUsers(limit = 50) {
    return useAsync(
        async () => {
            const { data, error } = await (await import('../lib/supabase')).supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);
            if (error || !data) return [];
            return data.map((row: any) => {
                return {
                    id: row.id,
                    name: row.display_name || 'Unnamed',
                    avatar: avatarUrl(row.avatar_path),
                    walletAddress: row.wallet_address || '',
                    ownedNFTs: 0,
                    likedSongs: 0,
                    email: row.email || '',
                    role: row.role === 'creator' ? 'artist' : row.role === 'listener' ? 'consumer' : row.role,
                    joinedDate: row.created_at ? new Date(row.created_at).toLocaleDateString() : '',
                    status: 'active' as const,
                } as User;
            });
        },
        [] as User[],
        [limit],
    );
}

/** All songs for admin */
export function useAdminSongs(limit = 100) {
    return useAsync(
        async () => {
            const [songs, nftSongIds] = await Promise.all([
                db.getSongs({ limit }),
                getNFTSongIds(),
            ]);
            return songs.map((s) => adaptSong(s, nftSongIds));
        },
        [] as Song[],
        [limit],
    );
}

/** All marketplace listings for admin (active + sold) */
export function useAdminTransactions(limit = 50) {
    return useAsync(
        async () => {
            const listings = await db.getMarketplaceListings({ limit });
            return listings.map((l): Transaction => ({
                id: l.id,
                type: l.soldAt ? 'purchase' : 'listing',
                songTitle: l.nftToken?.release?.song?.title || 'Unknown',
                buyer: l.buyerWallet || undefined,
                seller: l.sellerWallet || undefined,
                price: l.priceEth,
                date: l.soldAt || l.listedAt,
                status: l.soldAt ? 'completed' : (l.isActive ? 'pending' : 'failed'),
                fee: l.soldAt ? l.priceEth * 0.05 : undefined, // 5% platform fee
                isFlagged: (l as any).isFlagged ?? false,
            }));
        },
        [] as Transaction[],
        [limit],
    );
}

/** User's own activity feed (wallet-scoped) */
export function useUserActivity(filter?: 'all' | 'purchases' | 'sales' | 'mints') {
    const { walletAddress } = useAuth();
    return useAsync(
        async () => {
            if (!walletAddress) return [];
            return db.getUserActivity(walletAddress, filter || 'all');
        },
        [] as db.UserActivity[],
        [walletAddress, filter],
    );
}

// ────────────────────────────────────────────
// PLATFORM STATS (Admin)
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// NFT MUTATION HOOKS
// ────────────────────────────────────────────

interface MutationState {
    loading: boolean;
    error: string | null;
    success: boolean;
}

/**
 * Legacy NFT-release hook (DropERC721 path). The ERC-1155 flow uses
 * `createErc1155Release` directly; this hook is retained only as a
 * state placeholder for existing UI that still reads .loading/.error/.reset.
 * Calling execute() is a no-op and always returns null.
 */
export function useCreateNFTRelease() {
    const [state, setState] = useState<MutationState>({ loading: false, error: null, success: false });

    const execute = useCallback(async (): Promise<string | null> => {
        setState({ loading: false, error: 'Legacy ERC-721 release path is retired — use ERC-1155 flow.', success: false });
        return null;
    }, []);

    const reset = useCallback(() => setState({ loading: false, error: null, success: false }), []);

    return { ...state, execute, reset };
}

/** Mint (claim) an NFT token from a release */
export function useMintToken() {
    const [state, setState] = useState<MutationState>({ loading: false, error: null, success: false });

    const execute = useCallback(async (
        releaseId: string,
        buyerWallet: string,
        account?: any,
    ) => {
        setState({ loading: true, error: null, success: false });
        try {
            const result = await blockchain.mintToken(releaseId, buyerWallet, account);
            if (!result.success) {
                setState({ loading: false, error: result.error || 'Mint failed', success: false });
                return null;
            }
            setState({ loading: false, error: null, success: true });
            return result.tokenId;
        } catch (err: any) {
            setState({ loading: false, error: err.message, success: false });
            return null;
        }
    }, []);

    const reset = useCallback(() => setState({ loading: false, error: null, success: false }), []);

    return { ...state, execute, reset };
}

/** List an owned NFT for sale on the marketplace */
export function useListForSale() {
    const [state, setState] = useState<MutationState>({ loading: false, error: null, success: false });

    const execute = useCallback(async (
        config: {
            nftTokenId: string;
            priceEth: number;
            sellerWallet: string;
            /** Chain-first fallback when nftTokenId UUID is missing */
            contractAddress?: string;
            onChainTokenId?: string;
        },
        account?: any,
    ) => {
        setState({ loading: true, error: null, success: false });
        try {
            const result = await blockchain.listForSale(config, account);
            if (!result.success) {
                setState({ loading: false, error: result.error || 'Listing failed', success: false });
                return null;
            }
            setState({ loading: false, error: null, success: true });
            return result.listingId;
        } catch (err: any) {
            setState({ loading: false, error: err.message, success: false });
            return null;
        }
    }, []);

    const reset = useCallback(() => setState({ loading: false, error: null, success: false }), []);

    return { ...state, execute, reset };
}

/** Buy an NFT from a marketplace listing (secondary sale) */
export function useBuyListing() {
    const [state, setState] = useState<MutationState>({ loading: false, error: null, success: false });

    const execute = useCallback(async (
        listingId: string,
        buyerWallet: string,
        account?: any,
    ) => {
        setState({ loading: true, error: null, success: false });
        try {
            const result = await blockchain.buyListingFlow({ listingId, buyerWallet }, account);
            if (!result.success) {
                setState({ loading: false, error: result.error || 'Purchase failed', success: false });
                return false;
            }
            setState({ loading: false, error: null, success: true });
            return true;
        } catch (err: any) {
            setState({ loading: false, error: err.message, success: false });
            return false;
        }
    }, []);

    const reset = useCallback(() => setState({ loading: false, error: null, success: false }), []);

    return { ...state, execute, reset };
}

/** Cancel a marketplace listing */
export function useCancelListing() {
    const [state, setState] = useState<MutationState>({ loading: false, error: null, success: false });

    const execute = useCallback(async (
        listingId: string,
        sellerWallet: string,
        account?: any,
    ) => {
        setState({ loading: true, error: null, success: false });
        try {
            const result = await blockchain.cancelListingFlow(listingId, sellerWallet, account);
            if (!result.success) {
                setState({ loading: false, error: result.error || 'Cancel failed', success: false });
                return false;
            }
            setState({ loading: false, error: null, success: true });
            return true;
        } catch (err: any) {
            setState({ loading: false, error: err.message, success: false });
            return false;
        }
    }, []);

    const reset = useCallback(() => setState({ loading: false, error: null, success: false }), []);

    return { ...state, execute, reset };
}

// ────────────────────────────────────────────
// COLLECTION (Owned NFTs with listing status)
// ────────────────────────────────────────────

/**
 * Chain-first collection view.
 *
 * Source of truth is the blockchain. The DB (`nft_tokens`, `nft_releases`) is
 * treated as a cache / metadata provider:
 *
 *   1. Load the universe of ERC-1155 releases from DB — every `(contract,
 *      tokenId)` pair that has been lazy-minted. This is the set of tokens
 *      that *could* exist; we don't rely on any `owner_wallet_address` column.
 *   2. Group by contract and call `balanceOfBatch(wallet, [tokenIds])` ONCE
 *      per contract. This is a single RPC round-trip regardless of how many
 *      releases we scan, and it answers "does this wallet actually hold any
 *      copies?" with on-chain certainty.
 *   3. Keep only pairs with balance > 0. These are the real holdings.
 *   4. For each holding, hydrate metadata:
 *        a. Preferred: DB nft_releases row (already in memory, includes
 *           song title / cover / tier / benefits / royalty %).
 *        b. Fallback: `uri(tokenId)` → IPFS JSON for name/description/image.
 *           Used only when the DB row is missing or bare; keeps the view
 *           working for tokens the wallet bought on secondary that we never
 *           wrote an nft_tokens row for.
 *   5. For listing status, try to find a canonical `nft_tokens` row owned by
 *      this wallet for the same (contract, tokenId). If one exists, look up
 *      its active listing via `getActiveListingsForTokens`. If no DB row
 *      exists, the NFT shows as unlisted (the user will get a row created
 *      on-demand when they click "List for sale").
 *
 * Why this shape — directly addressing the two bugs we saw:
 *   • soniujjwal1961 had 1 on-chain copy but no `nft_tokens` row (the
 *     reconciliation guard in the old buy path had voided / reassigned it).
 *     The old DB-first hook returned [] because `getErc1155OwnedTokens` found
 *     nothing. This version finds the balance directly from chain.
 *   • ujjwalsoni1961 had 5 `nft_tokens` rows across different tokenIds but
 *     only owns 1 copy on chain (legacy ledger drift). The old hook emitted
 *     5 cards (one per ledger row, deduped only by tokenId). This version
 *     only emits cards where on-chain balance > 0, so the 4 ghosts disappear
 *     without needing a DB cleanup first.
 *
 * The DB ledger is still useful for things chain doesn't carry — minted_at,
 * pricePaidEth, audio URL resolution via release→song→cover_path, etc. — so
 * we still enrich with a per-wallet `getErc1155OwnedTokens` lookup when a
 * matching row exists.
 */
export function useOwnedNFTsWithStatus() {
    const { walletAddress } = useAuth();
    return useAsync(
        async () => {
            if (!walletAddress) return [] as OwnedNFT[];

            const wallet = walletAddress.toLowerCase();

            // Step 1: universe of ERC-1155 releases. Each row is a (contract,
            // tokenId) pair with DB metadata already joined. Ghost filtering
            // is contract-scoped (see getGhostTokenPairKeys) so we don't
            // accidentally hide a real tokenId that happens to collide with
            // a ghost id on a DIFFERENT contract.
            const [releases, ghostPairs] = await Promise.all([
                db.getAllErc1155ReleasesForScan(),
                db.getGhostTokenPairKeys(),
            ]);
            if (releases.length === 0) return [] as OwnedNFT[];

            type PairKey = string;
            const pairKey = (contract: string, tokenId: string | number): PairKey =>
                `${contract.toLowerCase()}:${String(tokenId)}`;
            const releaseByPair = new Map<PairKey, DbNFTRelease>();
            // Group tokenIds by contract so we can issue one batch call per
            // distinct drop contract (today that's always the single shared
            // DropERC1155, but the data model supports multi-contract).
            const tokenIdsByContract = new Map<string, bigint[]>();

            for (const r of releases) {
                if (!r.contractAddress || r.tokenId == null) continue;
                const tokenIdStr = String(r.tokenId);
                const contract = r.contractAddress.toLowerCase();
                const key = pairKey(contract, tokenIdStr);
                if (ghostPairs.has(key)) continue;
                if (releaseByPair.has(key)) continue; // dedupe belt-and-braces
                releaseByPair.set(key, r);
                const arr = tokenIdsByContract.get(contract) || [];
                arr.push(BigInt(tokenIdStr));
                tokenIdsByContract.set(contract, arr);
            }
            if (releaseByPair.size === 0) return [] as OwnedNFT[];

            // Step 2: one balanceOfBatch per contract.
            const balancePromises: Promise<Array<{ contract: string; tokenId: bigint; balance: bigint }>>[] = [];
            for (const [contract, tokenIds] of tokenIdsByContract.entries()) {
                balancePromises.push(
                    readErc1155BalanceBatch(contract, wallet, tokenIds).then((balances) =>
                        balances.map((balance, i) => ({ contract, tokenId: tokenIds[i], balance })),
                    ),
                );
            }
            const balanceResults = (await Promise.all(balancePromises)).flat();

            // Step 3: filter to pairs the wallet actually holds.
            const ownedPairs = balanceResults.filter((b) => b.balance > 0n);
            if (ownedPairs.length === 0) return [] as OwnedNFT[];

            // Step 4: find DB nft_tokens rows this wallet has for the same
            // pairs — we still need the UUID for listing FK lookups when the
            // user clicks "Sell". If no row exists, that's fine; the card
            // still renders as unlisted and the listing flow will create one
            // on-demand via an admin edge function.
            const walletLedger = await db.getErc1155OwnedTokens(wallet);
            const walletTokenByPair = new Map<PairKey, DbNFTToken>();
            for (const t of walletLedger) {
                const contract = (t.release?.contractAddress || '').toLowerCase();
                const tokenId = t.onChainTokenId;
                if (!contract || !tokenId) continue;
                const key = pairKey(contract, tokenId);
                // Keep the most recent (walletLedger is ordered minted_at DESC).
                if (!walletTokenByPair.has(key)) walletTokenByPair.set(key, t);
            }

            const canonicalDbIds: string[] = [];
            for (const { contract, tokenId } of ownedPairs) {
                const row = walletTokenByPair.get(pairKey(contract, tokenId.toString()));
                if (row) canonicalDbIds.push(row.id);
            }
            const activeListingsByTokenDbId = canonicalDbIds.length > 0
                ? await db.getActiveListingsForTokens(canonicalDbIds)
                : {};

            // Step 5: emit one OwnedNFT per owned pair. Metadata comes from
            // the release row (DB cache). If the DB row is thin (no title /
            // cover) we fall back to on-chain `uri()` — but only then, to
            // keep the happy path a zero-network-extra operation.
            const missingMetaFetches: Promise<void>[] = [];
            const out: OwnedNFT[] = [];

            for (const { contract, tokenId, balance } of ownedPairs) {
                const key = pairKey(contract, tokenId.toString());
                const release = releaseByPair.get(key);
                if (!release) continue;
                const tokenIdStr = tokenId.toString();
                const walletToken = walletTokenByPair.get(key);
                const activeListing = walletToken ? activeListingsByTokenDbId[walletToken.id] : undefined;

                const song = release.song;
                const hasDbCover = !!release.coverImagePath || !!song?.coverPath;
                const resolvedCover = release.coverImagePath
                    ? coverUrl(release.coverImagePath)
                    : coverUrl(song?.coverPath);

                const ownedNft: OwnedNFT = {
                    // Prefer the DB nft_tokens UUID when we have one — keeps
                    // marketplace / listing flows working unchanged. Otherwise
                    // synthesize a stable id from the (contract, tokenId) pair
                    // so React keys stay consistent and downstream code that
                    // only reads `id` for display doesn't break.
                    id: walletToken?.id || `onchain-${contract}-${tokenIdStr}`,
                    songId: release.songId || '',
                    creatorId: (song as any)?.creatorId || '',
                    songTitle: song?.title || 'Unknown Song',
                    artistName: (song as any)?.creator?.displayName || 'Unknown Artist',
                    coverImage: resolvedCover,
                    nftCoverImage: release.coverImagePath ? coverUrl(release.coverImagePath) : undefined,
                    // Prefer last traded price (LTP) for this token. See
                    // `adaptNFTToken` above for the full rationale; same logic
                    // applies here for the chain-first collection path.
                    price: (walletToken?.lastSalePriceToken != null)
                        ? walletToken.lastSalePriceToken
                        : (walletToken?.pricePaidEth != null ? walletToken.pricePaidEth : (release.priceEth || 0)),
                    editionNumber: 0,
                    totalEditions: release.totalSupply || 0,
                    mintedCount: release.mintedCount || 0,
                    owner: wallet,
                    ownerWallet: wallet,
                    rarity: (release.rarity as NFT['rarity']) || 'common',
                    tierName: release.tierName,
                    description: release.description || undefined,
                    benefits: release.benefits,
                    allocatedRoyaltyPercent: release.allocatedRoyaltyPercent,
                    onChainTokenId: tokenIdStr,
                    contractAddress: contract,
                    tokenDbId: walletToken?.id || '',
                    ownershipStatus: activeListing ? 'listed' : 'unlisted',
                    activeListingId: activeListing?.id,
                    activeListingPrice: activeListing?.priceEth,
                    chainListingId: activeListing?.chainListingId || undefined,
                    ownedQuantity: Number(balance),
                };

                // Fallback: if the DB release / song is missing a title or
                // cover, pull from `uri(tokenId)` → IPFS JSON. We batch these
                // fetches and mutate the output in place, so the happy path
                // (DB has everything) stays a zero-extra-round-trip operation.
                const needsChainMetadata = !hasDbCover || !song?.title;
                if (needsChainMetadata) {
                    const idx = out.length; // capture before push
                    missingMetaFetches.push(
                        fetchTokenMetadataFromChain(contract, tokenId).then((meta) => {
                            if (!meta) return;
                            const target = out[idx];
                            if (!target) return;
                            if (meta.name && target.songTitle === 'Unknown Song') {
                                target.songTitle = meta.name;
                            }
                            if (meta.image && target.coverImage.includes('placehold.co')) {
                                target.coverImage = meta.image;
                                target.nftCoverImage = meta.image;
                            }
                            if (meta.description && !target.description) {
                                target.description = meta.description;
                            }
                        }),
                    );
                }

                out.push(ownedNft);
            }

            // Wait for fallback metadata fetches so the UI renders real
            // names / covers on first paint rather than flashing placeholders
            // that swap in late.
            if (missingMetaFetches.length > 0) {
                await Promise.all(missingMetaFetches);
            }

            return out;
        },
        [] as OwnedNFT[],
        [walletAddress],
    );
}

/** Update listing price mutation hook */
export function useUpdateListingPrice() {
    const [state, setState] = useState<MutationState>({ loading: false, error: null, success: false });

    const execute = useCallback(async (
        listingId: string,
        newPriceEth: number,
        sellerWallet: string,
        chainListingId?: string,
        onChainTokenId?: string,
        account?: any,
    ) => {
        setState({ loading: true, error: null, success: false });
        try {
            let newChainListingId: string | undefined;

            // On-chain update if we have chain listing info
            if (account && chainListingId && onChainTokenId && blockchain.isMarketplaceReady()) {
                const priceWei = BigInt(Math.floor(newPriceEth * 1e18));
                const result = await blockchain.updateListingOnChain(
                    account,
                    BigInt(chainListingId),
                    BigInt(onChainTokenId),
                    priceWei,
                );
                if (!result.success) {
                    setState({ loading: false, error: result.error || 'On-chain update failed', success: false });
                    return false;
                }
                newChainListingId = result.newListingId;
            }

            // Update price in DB
            const dbResult = await db.updateListingPrice(listingId, newPriceEth, sellerWallet);
            if (!dbResult.success) {
                setState({ loading: false, error: dbResult.error || 'DB update failed', success: false });
                return false;
            }

            // Also update chain_listing_id in DB if a new one was created (cancel+recreate)
            if (newChainListingId) {
                const { supabase: client } = await import('../lib/supabase');
                await client
                    .from('marketplace_listings')
                    .update({ chain_listing_id: newChainListingId })
                    .eq('id', listingId);
            }

            setState({ loading: false, error: null, success: true });
            return true;
        } catch (err: any) {
            setState({ loading: false, error: err.message, success: false });
            return false;
        }
    }, []);

    const reset = useCallback(() => setState({ loading: false, error: null, success: false }), []);
    return { ...state, execute, reset };
}

// ────────────────────────────────────────────
// PLATFORM STATS (Admin)
// ────────────────────────────────────────────

export function useAdminPlatformStats() {
    return useAsync(
        async () => {
            const { supabase: client } = await import('../lib/supabase');

            const [
                { count: usersCount },
                { count: songsCount },
                { count: listingsCount },
            ] = await Promise.all([
                client.from('profiles').select('*', { count: 'exact', head: true }),
                client.from('songs').select('*', { count: 'exact', head: true }),
                client.from('marketplace_listings').select('*', { count: 'exact', head: true }),
            ]);

            return {
                totalUsers: usersCount || 0,
                totalSongs: songsCount || 0,
                totalListings: listingsCount || 0,
            };
        },
        { totalUsers: 0, totalSongs: 0, totalListings: 0 },
        [],
    );
}
