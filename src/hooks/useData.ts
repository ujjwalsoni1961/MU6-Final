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

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import * as db from '../services/database';
import * as blockchain from '../services/blockchain';
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

function avatarUrl(path: string | null | undefined): string {
    if (!path) return 'https://placehold.co/200x200/1e293b/94a3b8?text=👤';
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
        coverImage: coverUrl(r.song?.coverPath),
        price: r.priceEth || 0,
        editionNumber: r.mintedCount + 1, // next available
        totalEditions: r.totalSupply,
        owner: '', // not applicable for releases
        rarity: (r.rarity as NFT['rarity']) || 'common',
    };
}

/** Convert a DB NFTToken (owned) to the flat UI NFT type */
export function adaptNFTToken(t: DbNFTToken): NFT {
    const release = t.release;
    const song = release?.song;
    return {
        id: t.id,
        songId: release?.songId || '',
        creatorId: (song as any)?.creatorId || '',
        songTitle: song?.title || 'Unknown Song',
        artistName: (song as any)?.creator?.displayName || 'Unknown Artist',
        coverImage: coverUrl(song?.coverPath),
        price: t.lastSalePriceEth || release?.priceEth || 0,
        editionNumber: parseInt(t.tokenId) || 0,
        totalEditions: release?.totalSupply || 0,
        owner: t.ownerWalletAddress,
        rarity: (release?.rarity as NFT['rarity']) || 'common',
    };
}

/** Convert a DB MarketplaceListing to the flat UI NFT shape (for marketplace) */
export function adaptListing(l: DbListing): NFT & { listingId: string; sellerWallet: string } {
    const token = l.nftToken;
    const release = token?.release;
    const song = release?.song;
    return {
        id: token?.id || l.id,
        listingId: l.id,
        sellerWallet: l.sellerWallet,
        songId: release?.songId || '',
        creatorId: (song as any)?.creatorId || '',
        songTitle: song?.title || 'Unknown Song',
        artistName: (song as any)?.creator?.displayName || 'Unknown Artist',
        coverImage: coverUrl(song?.coverPath),
        price: l.priceEth,
        editionNumber: parseInt(token?.tokenId || '0') || 0,
        totalEditions: release?.totalSupply || 0,
        owner: l.sellerWallet,
        rarity: (release?.rarity as NFT['rarity']) || 'common',
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

function useAsync<T>(fetcher: () => Promise<T>, initial: T, deps: any[] = []): AsyncState<T> {
    const [data, setData] = useState<T>(initial);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    const refresh = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetcher()
            .then((result) => {
                if (!cancelled) setData(result);
            })
            .catch((err) => {
                if (!cancelled) setError(err?.message || 'Unknown error');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
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
            const songs = await db.getArtistSongs(id);
            return adaptArtist(a, { totalSongs: songs.length });
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

/** Marketplace listings (active) */
export function useMarketplaceListings(limit?: number) {
    return useAsync(
        async () => {
            const listings = await db.getMarketplaceListings({ isActive: true, limit });
            return listings.map(adaptListing);
        },
        [] as (NFT & { listingId: string; sellerWallet: string })[],
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
            return tokens.map(adaptNFTToken);
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
            const { data, error } = await (await import('../lib/supabase')).supabaseAdmin
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
            }));
        },
        [] as Transaction[],
        [limit],
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

/** Create an NFT release (creator) */
export function useCreateNFTRelease() {
    const [state, setState] = useState<MutationState>({ loading: false, error: null, success: false });

    const execute = useCallback(async (
        config: blockchain.MintConfig,
        account?: any, // thirdweb Account
    ) => {
        setState({ loading: true, error: null, success: false });
        try {
            const result = await blockchain.createNFTRelease(config, account);
            if (!result.success) {
                setState({ loading: false, error: result.error || 'Failed to create NFT release', success: false });
                return null;
            }
            setState({ loading: false, error: null, success: true });
            return result.releaseId;
        } catch (err: any) {
            setState({ loading: false, error: err.message, success: false });
            return null;
        }
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
        config: { nftTokenId: string; priceEth: number; sellerWallet: string },
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

/** User's owned NFTs WITH listing status (for collection page) */
export function useOwnedNFTsWithStatus() {
    const { walletAddress } = useAuth();
    return useAsync(
        async () => {
            if (!walletAddress) return [];
            const results = await db.getOwnedNFTsWithListingStatus(walletAddress);
            return results.map(({ token, activeListing }): OwnedNFT => {
                const baseNFT = adaptNFTToken(token);
                return {
                    ...baseNFT,
                    tokenDbId: token.id,
                    onChainTokenId: token.tokenId,
                    ownershipStatus: activeListing ? 'listed' : 'unlisted',
                    activeListingId: activeListing?.id,
                    activeListingPrice: activeListing?.priceEth,
                    chainListingId: activeListing?.chainListingId || undefined,
                };
            });
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
            }

            // Update in DB
            const dbResult = await db.updateListingPrice(listingId, newPriceEth, sellerWallet);
            if (!dbResult.success) {
                setState({ loading: false, error: dbResult.error || 'DB update failed', success: false });
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
// PLATFORM STATS (Admin)
// ────────────────────────────────────────────

export function useAdminPlatformStats() {
    return useAsync(
        async () => {
            const { supabaseAdmin: admin } = await import('../lib/supabase');

            const [
                { count: usersCount },
                { count: songsCount },
                { count: listingsCount },
            ] = await Promise.all([
                admin.from('profiles').select('*', { count: 'exact', head: true }),
                admin.from('songs').select('*', { count: 'exact', head: true }),
                admin.from('marketplace_listings').select('*', { count: 'exact', head: true }),
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
