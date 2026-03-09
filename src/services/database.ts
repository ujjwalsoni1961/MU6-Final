/**
 * MU6 Database Service
 *
 * Full Supabase query layer replacing all mock data.
 * Uses the public client (RLS-aware) for reads;
 * admin client only where explicitly needed.
 */

import { supabase, supabaseAdmin } from '../lib/supabase';

// ────────────────────────────────────────────
// Types (mirrors DB schema)
// ────────────────────────────────────────────

export interface Song {
    id: string;
    creatorId: string;
    title: string;
    album: string | null;
    genre: string | null;
    description: string | null;
    durationSeconds: number | null;
    audioPath: string | null;
    coverPath: string | null;
    isPublished: boolean;
    releaseDate: string | null;
    playsCount: number;
    likesCount: number;
    createdAt: string;
    // Joined fields
    creator?: ArtistProfile;
}

export interface ArtistProfile {
    id: string;
    walletAddress: string | null;
    displayName: string | null;
    bio: string | null;
    creatorType: string | null;
    role: string;
    avatarPath: string | null;
    isVerified: boolean;
    country: string | null;
}

export interface NFTRelease {
    id: string;
    songId: string;
    chainId: string;
    contractAddress: string | null;
    tierName: string;
    rarity: string;
    totalSupply: number;
    allocatedRoyaltyPercent: number;
    priceEth: number | null;
    mintedCount: number;
    isActive: boolean;
    createdAt: string;
    // Joined
    song?: Song;
}

export interface NFTToken {
    id: string;
    nftReleaseId: string;
    tokenId: string;
    ownerWalletAddress: string;
    mintedAt: string;
    lastSalePriceEth: number | null;
    // Joined
    release?: NFTRelease;
}

export interface MarketplaceListing {
    id: string;
    nftTokenId: string;
    sellerWallet: string;
    priceEth: number;
    isActive: boolean;
    listedAt: string;
    soldAt: string | null;
    buyerWallet: string | null;
    // Joined
    nftToken?: NFTToken;
}

export interface SplitEntry {
    id: string;
    songId: string;
    partyEmail: string;
    partyName: string;
    role: string;
    sharePercent: number;
    linkedProfileId: string | null;
}

export interface StreamEntry {
    id: string;
    songId: string;
    listenerProfileId: string | null;
    startedAt: string;
    durationSeconds: number;
    isQualified: boolean;
}

// ────────────────────────────────────────────
// SONGS
// ────────────────────────────────────────────

export async function getSongs(filters?: {
    genre?: string;
    search?: string;
    creatorId?: string;
    limit?: number;
    offset?: number;
}): Promise<Song[]> {
    let query = supabase
        .from('songs')
        .select(`
            *,
            creator:profiles!creator_id (
                id, wallet_address, display_name, bio, creator_type, role, avatar_path, is_verified, country
            )
        `)
        .eq('is_published', true)
        .order('created_at', { ascending: false });

    if (filters?.genre) {
        query = query.eq('genre', filters.genre);
    }
    if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,album.ilike.%${filters.search}%`);
    }
    if (filters?.creatorId) {
        query = query.eq('creator_id', filters.creatorId);
    }
    if (filters?.limit) {
        query = query.limit(filters.limit);
    }
    if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
    }

    const { data, error } = await query;
    if (error) {
        console.error('[db] getSongs error:', error);
        return [];
    }
    return (data || []).map(mapSongRow);
}

export async function getSongById(id: string): Promise<Song | null> {
    const { data, error } = await supabase
        .from('songs')
        .select(`
            *,
            creator:profiles!creator_id (
                id, wallet_address, display_name, bio, creator_type, role, avatar_path, is_verified, country
            )
        `)
        .eq('id', id)
        .single();

    if (error || !data) return null;
    return mapSongRow(data);
}

export async function getTrendingSongs(limit = 10): Promise<Song[]> {
    const { data, error } = await supabase
        .from('songs')
        .select(`
            *,
            creator:profiles!creator_id (
                id, wallet_address, display_name, bio, creator_type, role, avatar_path, is_verified, country
            )
        `)
        .eq('is_published', true)
        .order('plays_count', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[db] getTrendingSongs error:', error);
        return [];
    }
    return (data || []).map(mapSongRow);
}

export async function getNewReleases(limit = 10): Promise<Song[]> {
    const { data, error } = await supabase
        .from('songs')
        .select(`
            *,
            creator:profiles!creator_id (
                id, wallet_address, display_name, bio, creator_type, role, avatar_path, is_verified, country
            )
        `)
        .eq('is_published', true)
        .order('release_date', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[db] getNewReleases error:', error);
        return [];
    }
    return (data || []).map(mapSongRow);
}

/** Create a new song (creator only) */
export async function createSong(
    data: {
        creatorId: string;
        title: string;
        album?: string;
        genre?: string;
        description?: string;
        durationSeconds?: number;
        audioPath?: string;
        coverPath?: string;
        releaseDate?: string;
        isPublished?: boolean;
        trackType?: string;
        masterOwnership?: string;
        masterOwnershipPct?: number;
        compositionOwnership?: string;
        compositionOwnerName?: string;
        compositionOwnershipPct?: number;
    },
): Promise<Song | null> {
    const { data: created, error } = await supabaseAdmin
        .from('songs')
        .insert({
            creator_id: data.creatorId,
            title: data.title,
            album: data.album || null,
            genre: data.genre || null,
            description: data.description || null,
            duration_seconds: data.durationSeconds || null,
            audio_path: data.audioPath || null,
            cover_path: data.coverPath || null,
            release_date: data.releaseDate || null,
            is_published: data.isPublished ?? false,
            track_type: data.trackType || null,
            master_ownership: data.masterOwnership || null,
            master_ownership_pct: data.masterOwnershipPct || null,
            composition_ownership: data.compositionOwnership || null,
            composition_owner_name: data.compositionOwnerName || null,
            composition_ownership_pct: data.compositionOwnershipPct || null,
        })
        .select()
        .single();

    if (error || !created) {
        console.error('[db] createSong error:', error);
        return null;
    }
    return mapSongRow(created);
}

export async function updateSong(
    id: string,
    updates: Record<string, any>,
): Promise<Song | null> {
    // Convert camelCase keys to snake_case for DB
    const dbUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
        dbUpdates[camelToSnake(key)] = value;
    }

    const { data, error } = await supabaseAdmin
        .from('songs')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

    if (error || !data) {
        console.error('[db] updateSong error:', error);
        return null;
    }
    return mapSongRow(data);
}

// ────────────────────────────────────────────
// ARTISTS / PROFILES
// ────────────────────────────────────────────

export async function getArtists(limit = 20): Promise<ArtistProfile[]> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'creator')
        .order('display_name')
        .limit(limit);

    if (error) {
        console.error('[db] getArtists error:', error);
        return [];
    }
    return (data || []).map(mapArtistRow);
}

export async function getArtistById(id: string): Promise<ArtistProfile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) return null;
    return mapArtistRow(data);
}

export async function getArtistSongs(creatorId: string): Promise<Song[]> {
    return getSongs({ creatorId });
}

// ────────────────────────────────────────────
// NFT RELEASES & TOKENS
// ────────────────────────────────────────────

export async function getNFTReleases(songId?: string): Promise<NFTRelease[]> {
    let query = supabase
        .from('nft_releases')
        .select(`
            *,
            song:songs!song_id (
                id, title, cover_path, creator_id,
                creator:profiles!creator_id (
                    id, display_name, avatar_path
                )
            )
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (songId) {
        query = query.eq('song_id', songId);
    }

    const { data, error } = await query;
    if (error) {
        console.error('[db] getNFTReleases error:', error);
        return [];
    }
    return (data || []).map(mapNFTReleaseRow);
}

export async function getNFTTokensByOwner(walletAddress: string): Promise<NFTToken[]> {
    const { data, error } = await supabase
        .from('nft_tokens')
        .select(`
            *,
            release:nft_releases!nft_release_id (
                *,
                song:songs!song_id (
                    id, title, cover_path, creator_id
                )
            )
        `)
        .eq('owner_wallet_address', walletAddress.toLowerCase())
        .order('minted_at', { ascending: false });

    if (error) {
        console.error('[db] getNFTTokensByOwner error:', error);
        return [];
    }
    return (data || []).map(mapNFTTokenRow);
}

// ────────────────────────────────────────────
// MARKETPLACE
// ────────────────────────────────────────────

export async function getMarketplaceListings(filters?: {
    isActive?: boolean;
    limit?: number;
}): Promise<MarketplaceListing[]> {
    let query = supabase
        .from('marketplace_listings')
        .select(`
            *,
            nft_token:nft_tokens!nft_token_id (
                *,
                release:nft_releases!nft_release_id (
                    *,
                    song:songs!song_id (
                        id, title, cover_path, creator_id,
                        creator:profiles!creator_id (
                            id, display_name, avatar_path
                        )
                    )
                )
            )
        `)
        .order('listed_at', { ascending: false });

    if (filters?.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
    }
    if (filters?.limit) {
        query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) {
        console.error('[db] getMarketplaceListings error:', error);
        return [];
    }
    return (data || []).map(mapListingRow);
}

// ────────────────────────────────────────────
// SPLIT SHEETS
// ────────────────────────────────────────────

export async function getSplitsBySong(songId: string): Promise<SplitEntry[]> {
    const { data, error } = await supabase
        .from('song_rights_splits')
        .select('*')
        .eq('song_id', songId)
        .order('share_percent', { ascending: false });

    if (error) {
        console.error('[db] getSplitsBySong error:', error);
        return [];
    }
    return (data || []).map(mapSplitRow);
}

/**
 * Replace all splits for a song in a single transaction-like batch.
 * Deletes existing splits then inserts new ones.
 * Trigger validates SUM = 100.
 */
export async function upsertSplitSheet(
    songId: string,
    splits: Array<{
        partyEmail: string;
        partyName: string;
        role: string;
        sharePercent: number;
        linkedProfileId?: string;
        linkedWalletAddress?: string;
    }>,
): Promise<SplitEntry[]> {
    // Delete existing
    await supabaseAdmin
        .from('song_rights_splits')
        .delete()
        .eq('song_id', songId);

    // Insert new
    const rows = splits.map((s) => ({
        song_id: songId,
        party_email: s.partyEmail,
        party_name: s.partyName,
        role: s.role,
        share_percent: s.sharePercent,
        linked_profile_id: s.linkedProfileId || null,
        linked_wallet_address: s.linkedWalletAddress || null,
    }));

    const { data, error } = await supabaseAdmin
        .from('song_rights_splits')
        .insert(rows)
        .select();

    if (error) {
        console.error('[db] upsertSplitSheet error:', error);
        return [];
    }
    return (data || []).map(mapSplitRow);
}

// ────────────────────────────────────────────
// STREAMS (Playback Logging)
// ────────────────────────────────────────────

/**
 * Log a stream event. Marks as qualified if >= 15 seconds.
 * The DB trigger auto-increments songs.plays_count for qualified streams.
 */
export async function logStream(
    songId: string,
    listenerProfileId: string | null,
    durationSeconds: number,
): Promise<StreamEntry | null> {
    const isQualified = durationSeconds >= 15;

    const { data, error } = await supabaseAdmin
        .from('streams')
        .insert({
            song_id: songId,
            listener_profile_id: listenerProfileId,
            duration_seconds: durationSeconds,
            is_qualified: isQualified,
        })
        .select()
        .single();

    if (error) {
        console.error('[db] logStream error:', error);
        return null;
    }
    return mapStreamRow(data);
}

// ────────────────────────────────────────────
// LIKES
// ────────────────────────────────────────────

export async function likeSong(songId: string, profileId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
        .from('likes')
        .upsert(
            { song_id: songId, profile_id: profileId },
            { onConflict: 'profile_id,song_id' },
        );
    if (error) {
        console.error('[db] likeSong error:', error);
        return false;
    }
    return true;
}

export async function unlikeSong(songId: string, profileId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
        .from('likes')
        .delete()
        .eq('song_id', songId)
        .eq('profile_id', profileId);
    if (error) {
        console.error('[db] unlikeSong error:', error);
        return false;
    }
    return true;
}

export async function isLikedByUser(songId: string, profileId: string): Promise<boolean> {
    const { data } = await supabase
        .from('likes')
        .select('id')
        .eq('song_id', songId)
        .eq('profile_id', profileId)
        .maybeSingle();
    return !!data;
}

export async function getLikedSongs(profileId: string): Promise<Song[]> {
    const { data, error } = await supabase
        .from('likes')
        .select(`
            song:songs!song_id (
                *,
                creator:profiles!creator_id (
                    id, wallet_address, display_name, bio, creator_type, role, avatar_path, is_verified, country
                )
            )
        `)
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map((row: any) => mapSongRow(row.song)).filter(Boolean) as Song[];
}

// ────────────────────────────────────────────
// FOLLOWS
// ────────────────────────────────────────────

export async function followArtist(followerId: string, followingId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
        .from('follows')
        .upsert(
            { follower_id: followerId, following_id: followingId },
            { onConflict: 'follower_id,following_id' },
        );
    return !error;
}

export async function unfollowArtist(followerId: string, followingId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);
    return !error;
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();
    return !!data;
}

// ────────────────────────────────────────────
// CREATOR DASHBOARD
// ────────────────────────────────────────────

export interface CreatorDashboardStats {
    totalSongs: number;
    totalPlays: number;
    totalLikes: number;
    totalNFTsMinted: number;
    totalRevenueEur: number;
    recentStreams: StreamEntry[];
}

export async function getCreatorDashboard(profileId: string): Promise<CreatorDashboardStats> {
    // Songs aggregate
    const { data: songs } = await supabase
        .from('songs')
        .select('id, plays_count, likes_count')
        .eq('creator_id', profileId);

    const totalSongs = songs?.length || 0;
    const totalPlays = songs?.reduce((sum, s) => sum + (s.plays_count || 0), 0) || 0;
    const totalLikes = songs?.reduce((sum, s) => sum + (s.likes_count || 0), 0) || 0;

    // NFTs minted
    const songIds = songs?.map((s) => s.id) || [];
    let totalNFTsMinted = 0;
    if (songIds.length > 0) {
        const { data: releases } = await supabase
            .from('nft_releases')
            .select('minted_count')
            .in('song_id', songIds);
        totalNFTsMinted = releases?.reduce((sum, r) => sum + (r.minted_count || 0), 0) || 0;
    }

    // Revenue from royalty_events
    let totalRevenueEur = 0;
    if (songIds.length > 0) {
        const { data: events } = await supabase
            .from('royalty_events')
            .select('gross_amount_eur')
            .in('song_id', songIds);
        totalRevenueEur = events?.reduce((sum, e) => sum + parseFloat(e.gross_amount_eur || '0'), 0) || 0;
    }

    // Recent streams
    let recentStreams: StreamEntry[] = [];
    if (songIds.length > 0) {
        const { data: streams } = await supabase
            .from('streams')
            .select('*')
            .in('song_id', songIds)
            .order('started_at', { ascending: false })
            .limit(20);
        recentStreams = (streams || []).map(mapStreamRow);
    }

    return {
        totalSongs,
        totalPlays,
        totalLikes,
        totalNFTsMinted,
        totalRevenueEur,
        recentStreams,
    };
}

export async function getStreamsByCreator(
    profileId: string,
    options?: { limit?: number; offset?: number },
): Promise<StreamEntry[]> {
    // Get creator's song IDs first
    const { data: songs } = await supabase
        .from('songs')
        .select('id')
        .eq('creator_id', profileId);

    const songIds = songs?.map((s) => s.id) || [];
    if (songIds.length === 0) return [];

    let query = supabase
        .from('streams')
        .select('*')
        .in('song_id', songIds)
        .order('started_at', { ascending: false });

    if (options?.limit) query = query.limit(options.limit);
    if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 20) - 1);

    const { data, error } = await query;
    if (error) return [];
    return (data || []).map(mapStreamRow);
}

// ────────────────────────────────────────────
// PLATFORM SETTINGS
// ────────────────────────────────────────────

export async function getPlatformSetting<T = any>(key: string): Promise<T | null> {
    const { data, error } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', key)
        .single();
    if (error || !data) return null;
    return data.value as T;
}

// ────────────────────────────────────────────
// STORAGE HELPERS
// ────────────────────────────────────────────

/** Get a public URL for cover images / avatars */
export function getPublicUrl(bucket: 'covers' | 'avatars', path: string): string {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
}

/** Get a signed URL for private audio files */
export async function getAudioUrl(path: string, expiresIn = 3600): Promise<string | null> {
    const { data, error } = await supabase.storage
        .from('audio')
        .createSignedUrl(path, expiresIn);
    if (error || !data) return null;
    return data.signedUrl;
}

// ────────────────────────────────────────────
// ROW MAPPERS (snake_case → camelCase)
// ────────────────────────────────────────────

function mapSongRow(row: any): Song {
    return {
        id: row.id,
        creatorId: row.creator_id,
        title: row.title,
        album: row.album,
        genre: row.genre,
        description: row.description,
        durationSeconds: row.duration_seconds,
        audioPath: row.audio_path,
        coverPath: row.cover_path,
        isPublished: row.is_published,
        releaseDate: row.release_date,
        playsCount: row.plays_count || 0,
        likesCount: row.likes_count || 0,
        createdAt: row.created_at,
        creator: row.creator ? mapArtistRow(row.creator) : undefined,
    };
}

function mapArtistRow(row: any): ArtistProfile {
    return {
        id: row.id,
        walletAddress: row.wallet_address,
        displayName: row.display_name,
        bio: row.bio,
        creatorType: row.creator_type,
        role: row.role,
        avatarPath: row.avatar_path,
        isVerified: row.is_verified,
        country: row.country,
    };
}

function mapNFTReleaseRow(row: any): NFTRelease {
    return {
        id: row.id,
        songId: row.song_id,
        chainId: row.chain_id,
        contractAddress: row.contract_address,
        tierName: row.tier_name,
        rarity: row.rarity,
        totalSupply: row.total_supply,
        allocatedRoyaltyPercent: parseFloat(row.allocated_royalty_percent),
        priceEth: row.price_eth ? parseFloat(row.price_eth) : null,
        mintedCount: row.minted_count,
        isActive: row.is_active,
        createdAt: row.created_at,
        song: row.song ? mapSongRow(row.song) : undefined,
    };
}

function mapNFTTokenRow(row: any): NFTToken {
    return {
        id: row.id,
        nftReleaseId: row.nft_release_id,
        tokenId: row.token_id,
        ownerWalletAddress: row.owner_wallet_address,
        mintedAt: row.minted_at,
        lastSalePriceEth: row.last_sale_price_eth ? parseFloat(row.last_sale_price_eth) : null,
        release: row.release ? mapNFTReleaseRow(row.release) : undefined,
    };
}

function mapListingRow(row: any): MarketplaceListing {
    return {
        id: row.id,
        nftTokenId: row.nft_token_id,
        sellerWallet: row.seller_wallet,
        priceEth: parseFloat(row.price_eth),
        isActive: row.is_active,
        listedAt: row.listed_at,
        soldAt: row.sold_at,
        buyerWallet: row.buyer_wallet,
        nftToken: row.nft_token ? mapNFTTokenRow(row.nft_token) : undefined,
    };
}

function mapSplitRow(row: any): SplitEntry {
    return {
        id: row.id,
        songId: row.song_id,
        partyEmail: row.party_email,
        partyName: row.party_name,
        role: row.role,
        sharePercent: parseFloat(row.share_percent),
        linkedProfileId: row.linked_profile_id,
    };
}

function mapStreamRow(row: any): StreamEntry {
    return {
        id: row.id,
        songId: row.song_id,
        listenerProfileId: row.listener_profile_id,
        startedAt: row.started_at,
        durationSeconds: row.duration_seconds,
        isQualified: row.is_qualified,
    };
}

// ────────────────────────────────────────────
// Utility
// ────────────────────────────────────────────

function camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
