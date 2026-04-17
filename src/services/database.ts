/**
 * MU6 Database Service
 *
 * Full Supabase query layer replacing all mock data.
 * Uses the public client (RLS-aware) for reads;
 * admin client only where explicitly needed.
 */

import { supabase } from '../lib/supabase';
import { sendSongPublishedEmail, sendStreamMilestoneEmail } from './email';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

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
    coverPath: string | null;
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
    description: string | null;
    coverImagePath: string | null;
    benefits: { title: string; description: string }[];
    // Joined
    song?: Song;
}

export interface NFTToken {
    id: string;
    releaseId: string;
    onChainTokenId: string | null;
    ownerWalletAddress: string;
    mintedAt: string;
    pricePaidEth: number | null;
    // Joined fields
    release?: NFTRelease;
}

export interface TradeEvent {
    id: string;
    type: 'mint' | 'sale';
    date: string;
    price: number;
    fromWallet: string;
    toWallet: string;
}

export interface MarketplaceListing {
    id: string;
    nftTokenId: string;
    sellerWallet: string;
    priceEth: number;
    priceToken: number | null;
    priceEurAtList: number | null;
    isActive: boolean;
    chainListingId: string | null;
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

export interface RoyaltyEvent {
    id: string;
    songId: string;
    sourceType: 'stream' | 'primary_sale' | 'secondary_sale';
    sourceReference: string;
    grossAmountEur: number;
    accountingPeriod: string | null;
    createdAt: string;
    // Joined
    song?: Song;
}

export interface RoyaltyShare {
    id: string;
    royaltyEventId: string;
    partyEmail: string | null;
    linkedProfileId: string | null;
    walletAddress: string | null;
    shareType: 'split' | 'direct';
    nftReleaseId: string | null;
    nftTokenId: string | null;
    sharePercent: number;
    amountEur: number;
    createdAt: string;
    // Joined
    royaltyEvent?: RoyaltyEvent;
    profile?: ArtistProfile;
}

export interface CreatorRoyaltySummary {
    streamRevenue: number;
    primarySaleRevenue: number;
    secondarySaleRevenue: number;
    totalRevenue: number;
    streamCount: number;
    totalNFTsSold: number;
    perSongBreakdown: Array<{
        songId: string;
        songTitle: string;
        coverImage: string;
        streamRevenue: number;
        nftRevenue: number;
        totalRevenue: number;
        streamCount: number;
    }>;
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
    includeDrafts?: boolean;
}): Promise<Song[]> {
    // Use admin client for creator-owned queries (their own songs list).
    // The anon client goes through RLS which checks auth.uid(), but since we
    // use Thirdweb (not Supabase Auth), auth.uid() is always NULL on the client.
    // For published songs this doesn't matter (RLS passes on is_published=TRUE),
    // but for drafts and to guarantee creator queries always work, use admin.
    const isCreatorQuery = !!filters?.creatorId;
    const client = isCreatorQuery ? supabase : supabase;

    let query = client
        .from('songs')
        .select(`
            *,
            creator:profiles!creator_id (
                id, wallet_address, display_name, bio, creator_type, role, avatar_path, cover_path, is_verified, country
            )
        `)
        .is('deleted_at', null) // PDF #11 — hide soft-deleted songs from mobile
        .order('created_at', { ascending: false });

    // When a creator is viewing their own songs, include drafts.
    // Otherwise only show published songs AND enforce admin listing state
    // (is_listed=true). `is_listed` is the admin kill-switch for pulling a song
    // from the consumer app without deleting it; admin-side UI toggles this via
    // useAdminSongActions.toggleListed.
    if (filters?.creatorId && filters?.includeDrafts) {
        // No is_published / is_listed filter — show all songs for this creator
    } else {
        query = query.eq('is_published', true).eq('is_listed', true);
    }

    if (filters?.genre) {
        query = query.eq('genre', filters.genre);
    }
    if (filters?.search) {
        const s = filters.search;
        
        // Find artists whose display_name matches the search
        const { data: matchedArtists } = await client
            .from('profiles')
            .select('id')
            .eq('role', 'creator')
            .ilike('display_name', `%${s}%`)
            .limit(10);
            
        const artistIds = matchedArtists?.map(a => a.id) || [];
        
        if (artistIds.length > 0) {
            query = query.or(`title.ilike.%${s}%,album.ilike.%${s}%,genre.ilike.%${s}%,creator_id.in.(${artistIds.join(',')})`);
        } else {
            query = query.or(`title.ilike.%${s}%,album.ilike.%${s}%,genre.ilike.%${s}%`);
        }
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
        console.error('[db] getSongs error:', error, 'filters:', filters);
        return [];
    }
    return (data || []).map(mapSongRow);
}

export async function getSongById(id: string): Promise<Song | null> {
    // NOTE: we intentionally do NOT filter on is_listed here. A song page may
    // be opened from deep links, collection pages, or history even after admin
    // delists it, and existing NFT holders must still resolve song metadata
    // for their library. Listing visibility is enforced at the browse/query
    // layer (getSongs/getTrendingSongs/getNewReleases).
    const { data, error } = await supabase
        .from('songs')
        .select(`
            *,
            creator:profiles!creator_id (
                id, wallet_address, display_name, bio, creator_type, role, avatar_path, cover_path, is_verified, country
            )
        `)
        .eq('id', id)
        .is('deleted_at', null) // PDF #11 — hide soft-deleted songs from mobile
        .maybeSingle();

    if (error || !data) return null;
    return mapSongRow(data);
}

export async function getTrendingSongs(limit = 10): Promise<Song[]> {
    const { data, error } = await supabase
        .from('songs')
        .select(`
            *,
            creator:profiles!creator_id (
                id, wallet_address, display_name, bio, creator_type, role, avatar_path, cover_path, is_verified, country
            )
        `)
        .eq('is_published', true)
        .eq('is_listed', true) // admin kill-switch — hide delisted songs
        .is('deleted_at', null) // PDF #11 — hide soft-deleted songs
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
                id, wallet_address, display_name, bio, creator_type, role, avatar_path, cover_path, is_verified, country
            )
        `)
        .eq('is_published', true)
        .eq('is_listed', true) // admin kill-switch — hide delisted songs
        .is('deleted_at', null) // PDF #11 — hide soft-deleted songs
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
    const { data: created, error } = await supabase
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

    // Fire-and-forget: email the creator that their song is live
    if (created.is_published) {
        try {
            const { data: { users } } = await supabase.auth.admin.listUsers();
            const creatorUser = users?.find((u: any) => u.id === data.creatorId);
            if (creatorUser?.email) {
                void sendSongPublishedEmail(creatorUser.email, data.title).catch(() => {});
            }
        } catch (emailErr) {
            console.warn('[db] Song published email failed (non-blocking):', emailErr);
        }
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

    const { data, error } = await supabase
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

/** Upgrade a listener to creator role. Persists creator profile data. */
export async function upgradeToCreator(profileId: string, data: {
    displayName: string;
    email?: string;
    creatorType?: string;
    country?: string;
    bio?: string;
}): Promise<ArtistProfile | null> {
    const { data: updated, error } = await supabase
        .from('profiles')
        .update({
            role: 'creator',
            display_name: data.displayName,
            email: data.email || null,
            creator_type: data.creatorType || 'artist',
            country: data.country || null,
            bio: data.bio || null,
        })
        .eq('id', profileId)
        .select()
        .single();

    if (error || !updated) {
        console.error('[db] upgradeToCreator error:', error);
        return null;
    }
    return mapArtistRow(updated);
}

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

export async function searchArtists(query: string, limit = 20): Promise<ArtistProfile[]> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'creator')
        .ilike('display_name', `%${query}%`)
        .order('display_name')
        .limit(limit);

    if (error) {
        console.error('[db] searchArtists error:', error);
        return [];
    }
    return (data || []).map(mapArtistRow);
}

export async function getArtistById(id: string): Promise<ArtistProfile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle();

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

export async function getNFTReleaseById(releaseId: string): Promise<NFTRelease | null> {
    const { data, error } = await supabase
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
        .eq('id', releaseId)
        .maybeSingle();

    if (error || !data) {
        if (error) console.error('[db] getNFTReleaseById error:', error);
        return null;
    }
    return mapNFTReleaseRow(data);
}

export async function getNFTTokenById(tokenId: string): Promise<NFTToken | null> {
    const { data, error } = await supabase
        .from('nft_tokens')
        .select(`
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
        `)
        .eq('id', tokenId)
        .maybeSingle();

    if (error || !data) {
        if (error) console.error('[db] getNFTTokenById error:', error);
        return null;
    }
    return mapNFTTokenRow(data);
}

export async function getNFTTokensByOwner(walletAddress: string): Promise<NFTToken[]> {
    const { data, error } = await supabase
        .from('nft_tokens')
        .select(`
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
        `)
        .eq('owner_wallet_address', walletAddress.toLowerCase())
        .order('minted_at', { ascending: false });

    if (error) {
        console.error('[db] getNFTTokensByOwner error:', error);
        return [];
    }
    return (data || []).map(mapNFTTokenRow);
}

export async function getNFTTokensForRelease(releaseId: string): Promise<NFTToken[]> {
    const { data, error } = await supabase
        .from('nft_tokens')
        .select(`
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
        `)
        .eq('nft_release_id', releaseId)
        .order('minted_at', { ascending: true });

    if (error) {
        console.error('[db] getNFTTokensForRelease error:', error);
        return [];
    }
    return (data || []).map(mapNFTTokenRow);
}

/**
 * Compute per-release edition numbers for a set of tokens.
 * Returns a map of token_id → edition_number (1-based sequential within each release).
 */
export async function getEditionNumbers(tokenIds: string[]): Promise<Record<string, number>> {
    if (tokenIds.length === 0) return {};

    // Get the release IDs for the given tokens
    const { data: tokenData, error } = await supabase
        .from('nft_tokens')
        .select('id, nft_release_id')
        .in('id', tokenIds);

    if (error || !tokenData) return {};

    // Collect unique release IDs
    const releaseIds = [...new Set(tokenData.map((t: any) => t.nft_release_id))];

    // For each release, get all tokens ordered by minted_at to compute sequential edition numbers
    const editionMap: Record<string, number> = {};

    for (const releaseId of releaseIds) {
        const { data: relTokens, error: relErr } = await supabase
            .from('nft_tokens')
            .select('id')
            .eq('nft_release_id', releaseId)
            .order('minted_at', { ascending: true });

        if (relErr || !relTokens) continue;

        relTokens.forEach((t: any, idx: number) => {
            editionMap[t.id] = idx + 1; // 1-based edition number
        });
    }

    return editionMap;
}

export async function getNFTTradeHistory(params: { tokenId?: string; releaseId?: string }): Promise<TradeEvent[]> {
    const history: TradeEvent[] = [];

    // Base query for primary mints
    let tokensQuery = supabase
        .from('nft_tokens')
        .select(`
            id,
            minted_at,
            owner_wallet_address,
            price_paid_eth,
            release:nft_releases!nft_release_id (
                price_eth,
                song:songs!song_id (
                    creator:profiles!creator_id (
                        wallet_address
                    )
                )
            )
        `);

    if (params.tokenId) {
        tokensQuery = tokensQuery.eq('id', params.tokenId);
    } else if (params.releaseId) {
        tokensQuery = tokensQuery.eq('nft_release_id', params.releaseId);
    } else {
        return [];
    }

    const { data: tokenDataRaw, error: tokensError } = await tokensQuery;
    const tokensData = tokenDataRaw as any[] || [];

    // Map mint events
    if (!tokensError) {
        tokensData.forEach(t => {
            const releaseData = Array.isArray(t.release) ? t.release[0] : t.release;
            const songData = Array.isArray(releaseData?.song) ? releaseData.song[0] : releaseData?.song;
            const creatorData = Array.isArray(songData?.creator) ? songData.creator[0] : songData?.creator;
            
            const creatorWallet = creatorData?.wallet_address || 'Creator';
            const mintPrice = t.price_paid_eth !== null && t.price_paid_eth !== undefined
                ? t.price_paid_eth
                : (releaseData?.price_eth || 0);

            history.push({
                id: `mint-${t.id}`,
                type: 'mint',
                date: t.minted_at,
                price: mintPrice,
                fromWallet: creatorWallet,
                toWallet: t.owner_wallet_address || 'Unknown' // Will overlap with secondary sales below but accurate for initial
            });
        });
    }

    // Base query for secondary sales
    let listingsQuery = supabase
        .from('marketplace_listings')
        .select(`
            id,
            seller_wallet,
            buyer_wallet,
            price_eth,
            sold_at,
            nft_token_id,
            nft_token:nft_tokens!inner(nft_release_id)
        `)
        .not('sold_at', 'is', null)
        .order('sold_at', { ascending: true });

    if (params.tokenId) {
        listingsQuery = listingsQuery.eq('nft_token_id', params.tokenId);
    } else if (params.releaseId) {
        listingsQuery = listingsQuery.eq('nft_token.nft_release_id', params.releaseId);
    }

    const { data: listingsDataRaw, error: listingsError } = await listingsQuery;
    const listingsData = listingsDataRaw as any[] || [];

    if (!listingsError) {
        listingsData.forEach(l => {
            history.push({
                id: `sale-${l.id}`,
                type: 'sale',
                date: l.sold_at,
                price: l.price_eth || 0,
                fromWallet: l.seller_wallet,
                toWallet: l.buyer_wallet || 'Unknown'
            });
        });
    }

    // Sort by date descending (newest first)
    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return history;
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
    await supabase
        .from('song_rights_splits')
        .delete()
        .eq('song_id', songId);

    // Insert new
    const rows = splits.map((s) => ({
        song_id: songId,
        party_email: s.partyEmail,
        party_name: s.partyName,
        role: s.role.toLowerCase() as any,
        share_percent: s.sharePercent,
        linked_profile_id: s.linkedProfileId || null,
        linked_wallet_address: s.linkedWalletAddress || null,
    }));

    const { data, error } = await supabase
        .from('song_rights_splits')
        .insert(rows)
        .select();

    if (error) {
        console.error('[db] upsertSplitSheet error:', error);
        return [];
    }
    return (data || []).map(mapSplitRow);
}

/**
 * Look up a profile by email via the SECURITY DEFINER RPC.
 * Returns profile info if found, or { exists: false } if not.
 */
export async function lookupProfileByEmail(email: string): Promise<{
    exists: boolean;
    profileId?: string;
    displayName?: string;
    walletAddress?: string;
} | null> {
    const { data, error } = await supabase.rpc('lookup_profile_by_email', {
        target_email: email.toLowerCase().trim(),
    });

    if (error) {
        console.error('[db] lookupProfileByEmail error:', error);
        return null;
    }
    if (!data || data.length === 0) return { exists: false };
    const row = data[0];
    return {
        exists: true,
        profileId: row.id,
        displayName: row.display_name,
        walletAddress: row.wallet_address,
    };
}

/**
 * Create a split invitation record for an unregistered email.
 */
export async function createSplitInvitation(params: {
    songId: string;
    inviterProfileId: string;
    inviteeEmail: string;
    inviteeName: string;
    role: string;
    sharePercent: number;
}): Promise<boolean> {
    const { error } = await supabase
        .from('split_invitations')
        .insert({
            song_id: params.songId,
            inviter_profile_id: params.inviterProfileId,
            invitee_email: params.inviteeEmail.toLowerCase().trim(),
            invitee_name: params.inviteeName,
            role: params.role.toLowerCase() as any,
            share_percent: params.sharePercent,
        });

    if (error) {
        console.error('[db] createSplitInvitation error:', error);
        return false;
    }
    return true;
}

// ────────────────────────────────────────────
// STREAMS (Playback Logging)
// ────────────────────────────────────────────

/**
 * Log a stream event. Marks as qualified if >= 15 seconds.
 * Deduplication: same user can only count as 1 stream per song per 30 minutes.
 * The DB trigger auto-increments songs.plays_count for qualified streams.
 */
export async function logStream(
    songId: string,
    listenerProfileId: string | null,
    durationSeconds: number,
): Promise<StreamEntry | null> {
    let isQualified = durationSeconds >= 15;

    // ── Anonymous listener protection ──
    // Anonymous listeners (no profile) cannot generate qualified streams.
    // This prevents royalty inflation from unauthenticated repeat plays.
    if (isQualified && !listenerProfileId) {
        console.log('[db] Stream from anonymous listener — marking as non-qualified (no revenue)');
        isQualified = false;
    }

    // ── Stream deduplication: 30-minute window ──
    // Same user can only generate 1 qualified stream per song per 30 minutes.
    // Non-qualified streams are always logged (they don't generate revenue).
    if (isQualified && listenerProfileId) {
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: recentStream } = await supabase
            .from('streams')
            .select('id')
            .eq('song_id', songId)
            .eq('listener_profile_id', listenerProfileId)
            .eq('is_qualified', true)
            .gte('started_at', thirtyMinAgo)
            .limit(1)
            .maybeSingle();

        if (recentStream) {
            console.log('[db] Stream dedup: skipping qualified stream for song', songId, '- already counted within 30 min');
            // Still log the stream but as non-qualified (no revenue, no play count)
            const { data, error } = await supabase
                .from('streams')
                .insert({
                    song_id: songId,
                    listener_profile_id: listenerProfileId,
                    duration_seconds: durationSeconds,
                    is_qualified: false, // deduplicated — no revenue
                })
                .select()
                .single();

            if (error) {
                console.error('[db] logStream (dedup) error:', error);
                return null;
            }
            return mapStreamRow(data);
        }
    }

    const { data, error } = await supabase
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

    // Fire-and-forget: check for stream milestones after a qualified stream
    if (isQualified) {
        const MILESTONES = [10, 100, 500, 1000, 5000, 10000];
        try {
            const { data: song } = await supabase
                .from('songs')
                .select('title, plays_count, creator_id')
                .eq('id', songId)
                .maybeSingle();

            if (song && MILESTONES.includes(song.plays_count)) {
                const { data: { users } } = await supabase.auth.admin.listUsers();
                const creatorUser = users?.find((u: any) => u.id === song.creator_id);
                if (creatorUser?.email) {
                    void sendStreamMilestoneEmail(
                        creatorUser.email,
                        song.title,
                        song.plays_count,
                    ).catch(() => {});
                }
            }
        } catch (milestoneErr) {
            console.warn('[db] Stream milestone email failed (non-blocking):', milestoneErr);
        }
    }

    return mapStreamRow(data);
}

// ────────────────────────────────────────────
// LIKES
// ────────────────────────────────────────────

export async function likeSong(songId: string, profileId: string): Promise<boolean> {
    const { error } = await supabase
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
    const { error } = await supabase
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
                    id, wallet_address, display_name, bio, creator_type, role, avatar_path, cover_path, is_verified, country
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
    const { error } = await supabase
        .from('follows')
        .upsert(
            { follower_id: followerId, following_id: followingId },
            { onConflict: 'follower_id,following_id' },
        );
    return !error;
}

export async function unfollowArtist(followerId: string, followingId: string): Promise<boolean> {
    const { error } = await supabase
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

export async function getFollowersCount(artistId: string): Promise<number> {
    const { count } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', artistId);
    return count || 0;
}

/** How many artists this profile is currently following. */
export async function getFollowingCount(profileId: string): Promise<number> {
    const { count } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profileId);
    return count || 0;
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
    // Use admin client — Thirdweb auth means auth.uid() is NULL on anon client,
    // so RLS may silently filter out creator's own songs/data.
    const client = supabase;

    // Songs aggregate
    const { data: songs } = await client
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
        const { data: releases } = await client
            .from('nft_releases')
            .select('minted_count')
            .in('song_id', songIds);
        totalNFTsMinted = releases?.reduce((sum, r) => sum + (r.minted_count || 0), 0) || 0;
    }

    // Revenue from royalty_events
    let totalRevenueEur = 0;
    if (songIds.length > 0) {
        const { data: events } = await client
            .from('royalty_events')
            .select('gross_amount_eur')
            .in('song_id', songIds);
        totalRevenueEur = events?.reduce((sum, e) => sum + parseFloat(e.gross_amount_eur || '0'), 0) || 0;
    }

    // Recent streams
    let recentStreams: StreamEntry[] = [];
    if (songIds.length > 0) {
        const { data: streams } = await client
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
    // Get creator's song IDs first (admin client bypasses RLS — Thirdweb auth means auth.uid() is NULL)
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
// ROYALTIES
// ────────────────────────────────────────────

/** Get full royalty summary for a creator across all their songs */
export async function getCreatorRoyaltySummary(profileId: string): Promise<CreatorRoyaltySummary> {
    // Get creator's songs (admin client bypasses RLS — Thirdweb auth means auth.uid() is NULL)
    const { data: songs } = await supabase
        .from('songs')
        .select('id, title, cover_path, plays_count')
        .eq('creator_id', profileId);

    const songList = songs || [];
    const songIds = songList.map((s) => s.id);

    if (songIds.length === 0) {
        return {
            streamRevenue: 0, primarySaleRevenue: 0, secondarySaleRevenue: 0,
            totalRevenue: 0, streamCount: 0, totalNFTsSold: 0, perSongBreakdown: [],
        };
    }

    // Get all royalty shares for this profile
    const { data: shares } = await supabase
        .from('royalty_shares')
        .select(`
            amount_eur,
            royalty_event:royalty_events!royalty_event_id (
                song_id, source_type
            )
        `)
        .eq('linked_profile_id', profileId);

    const shareList = shares || [];

    // Aggregate by source type
    let streamRevenue = 0;
    let primarySaleRevenue = 0;
    let secondarySaleRevenue = 0;
    let streamCount = 0;
    const songMap = new Map<string, { streamRev: number; nftRev: number; streamCount: number }>();

    for (const s of shareList) {
        const event = s.royalty_event as any;
        const amt = parseFloat(s.amount_eur) || 0;
        const songId = event?.song_id;
        const sourceType = event?.source_type;

        if (sourceType === 'stream') {
            streamRevenue += amt;
            streamCount++;
        } else if (sourceType === 'primary_sale') {
            primarySaleRevenue += amt;
        } else if (sourceType === 'secondary_sale') {
            secondarySaleRevenue += amt;
        }

        if (songId) {
            const existing = songMap.get(songId) || { streamRev: 0, nftRev: 0, streamCount: 0 };
            if (sourceType === 'stream') {
                existing.streamRev += amt;
                existing.streamCount++;
            } else {
                existing.nftRev += amt;
            }
            songMap.set(songId, existing);
        }
    }

    // Get NFTs minted count
    let totalNFTsSold = 0;
    if (songIds.length > 0) {
        const { data: releases } = await supabase
            .from('nft_releases')
            .select('minted_count')
            .in('song_id', songIds);
        totalNFTsSold = releases?.reduce((sum, r) => sum + (r.minted_count || 0), 0) || 0;
    }

    // Build per-song breakdown
    const perSongBreakdown = songList.map((song) => {
        const data = songMap.get(song.id) || { streamRev: 0, nftRev: 0, streamCount: 0 };
        return {
            songId: song.id,
            songTitle: song.title,
            coverImage: song.cover_path || '',
            streamRevenue: data.streamRev,
            nftRevenue: data.nftRev,
            totalRevenue: data.streamRev + data.nftRev,
            streamCount: data.streamCount,
        };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);

    return {
        streamRevenue,
        primarySaleRevenue,
        secondarySaleRevenue,
        totalRevenue: streamRevenue + primarySaleRevenue + secondarySaleRevenue,
        streamCount,
        totalNFTsSold,
        perSongBreakdown,
    };
}

/** Get royalty events for a specific song */
export async function getRoyaltyEventsBySong(
    songId: string,
    options?: { sourceType?: string; limit?: number },
): Promise<RoyaltyEvent[]> {
    let query = supabase
        .from('royalty_events')
        .select('*')
        .eq('song_id', songId)
        .order('created_at', { ascending: false });

    if (options?.sourceType) {
        query = query.eq('source_type', options.sourceType);
    }
    if (options?.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
        console.error('[db] getRoyaltyEventsBySong error:', error);
        return [];
    }
    return (data || []).map(mapRoyaltyEventRow);
}

/** Get royalty shares for a specific profile */
export async function getRoyaltySharesByProfile(
    profileId: string,
    options?: { limit?: number },
): Promise<RoyaltyShare[]> {
    let query = supabase
        .from('royalty_shares')
        .select(`
            *,
            royalty_event:royalty_events!royalty_event_id (
                *,
                song:songs!song_id (
                    id, title, cover_path
                )
            )
        `)
        .eq('linked_profile_id', profileId)
        .order('created_at', { ascending: false });

    if (options?.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
        console.error('[db] getRoyaltySharesByProfile error:', error);
        return [];
    }
    return (data || []).map(mapRoyaltyShareRow);
}

// ────────────────────────────────────────────
// PLATFORM SETTINGS
// ────────────────────────────────────────────

export async function getPlatformSetting<T = any>(key: string): Promise<T | null> {
    const { data, error } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
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

/** Get a public URL for audio files.
 *  The audio bucket was made public so the anon client can read audio without signing.
 */
export async function getAudioUrl(path: string, _expiresIn = 3600): Promise<string | null> {
    try {
        const { data } = supabase.storage.from('audio').getPublicUrl(path);
        return data.publicUrl || null;
    } catch (error) {
        console.error('[db] getAudioUrl error:', error);
        return null;
    }
}

// ────────────────────────────────────────────
// MARKETPLACE (Extended)
// ────────────────────────────────────────────

/** Get the active listing for a specific NFT token (if any) */
export async function getActiveListingForToken(nftTokenId: string): Promise<MarketplaceListing | null> {
    const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('nft_token_id', nftTokenId)
        .eq('is_active', true)
        .maybeSingle();

    if (error || !data) return null;
    return mapListingRow(data);
}

/** Get owned NFTs with their listing status for the collection view */
export async function getOwnedNFTsWithListingStatus(walletAddress: string): Promise<Array<{
    token: NFTToken;
    activeListing: MarketplaceListing | null;
}>> {
    // Step 1: Get all tokens DB thinks this wallet owns. Filter out tokens
    // whose underlying song was soft-deleted (PDF #11).
    const { data: tokens, error: tokensError } = await supabase
        .from('nft_tokens')
        .select(`
            *,
            release:nft_releases!nft_release_id (
                *,
                song:songs!song_id (
                    id, title, cover_path, creator_id, deleted_at,
                    creator:profiles!creator_id (
                        id, display_name, avatar_path
                    )
                )
            )
        `)
        .eq('owner_wallet_address', walletAddress.toLowerCase())
        .eq('is_voided', false)
        // Only tokens with a verified on-chain id are shown to consumers.
        // Rows with on_chain_token_id=NULL are pre-Bug-14 legacy and cannot be
        // verified against the blockchain — they're filtered out entirely.
        .not('on_chain_token_id', 'is', null)
        .order('minted_at', { ascending: false });

    if (tokensError || !tokens || tokens.length === 0) return [];

    // Filter out tokens whose song was soft-deleted (PDF #11 — admin delete
    // must remove the NFT from the owner's collection immediately).
    const liveTokens = tokens.filter((t: any) => !t.release?.song?.deleted_at);

    if (liveTokens.length === 0) return [];

    // Step 2: Get active listings for these tokens
    const tokenIds = liveTokens.map((t: any) => t.id);
    const { data: listings } = await supabase
        .from('marketplace_listings')
        .select('*')
        .in('nft_token_id', tokenIds)
        .eq('is_active', true);

    // Build a map: nft_token_id -> active listing
    const listingMap = new Map<string, any>();
    (listings || []).forEach((l: any) => {
        listingMap.set(l.nft_token_id, l);
    });

    return liveTokens.map((t: any) => ({
        token: mapNFTTokenRow(t),
        activeListing: listingMap.has(t.id) ? mapListingRow(listingMap.get(t.id)) : null,
    }));
}

/** Update the price of an active marketplace listing */
export async function updateListingPrice(
    listingId: string,
    newPriceEth: number,
    sellerWallet: string,
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from('marketplace_listings')
        .update({ price_eth: newPriceEth })
        .eq('id', listingId)
        .eq('seller_wallet', sellerWallet.toLowerCase())
        .eq('is_active', true);

    if (error) return { success: false, error: error.message };
    return { success: true };
}

/** Cancel an active marketplace listing (DB side only) */
export async function cancelListingDb(
    listingId: string,
    sellerWallet: string,
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from('marketplace_listings')
        .update({ is_active: false })
        .eq('id', listingId)
        .eq('seller_wallet', sellerWallet.toLowerCase())
        .eq('is_active', true);

    if (error) return { success: false, error: error.message };
    return { success: true };
}

// ────────────────────────────────────────────
// USER ACTIVITY FEED (wallet-scoped)
// ────────────────────────────────────────────

export interface UserActivity {
    id: string;
    type: 'purchase' | 'sale' | 'mint' | 'listing';
    songTitle: string;
    coverPath: string | null;
    price: number | null;
    date: string;
    status: 'completed' | 'pending' | 'active';
}

/**
 * Get activity feed for a specific wallet address.
 * Combines purchases, sales, listings, and mints into one sorted list.
 */
export async function getUserActivity(
    walletAddress: string,
    filter?: 'all' | 'purchases' | 'sales' | 'mints',
    limit = 20,
): Promise<UserActivity[]> {
    const wallet = walletAddress.toLowerCase();
    const activities: UserActivity[] = [];

    // ── Purchases (listings where this wallet is the buyer) ──
    if (!filter || filter === 'all' || filter === 'purchases') {
        const { data: purchases } = await supabase
            .from('marketplace_listings')
            .select(`
                id, price_eth, listed_at, sold_at, buyer_wallet, is_active,
                nft_token:nft_tokens!nft_token_id (
                    release:nft_releases!nft_release_id (
                        song:songs!song_id ( title, cover_path )
                    )
                )
            `)
            .eq('buyer_wallet', wallet)
            .order('sold_at', { ascending: false })
            .limit(limit);

        (purchases || []).forEach((row: any) => {
            const song = row.nft_token?.release?.song;
            activities.push({
                id: `purchase-${row.id}`,
                type: 'purchase',
                songTitle: song?.title || 'Unknown Song',
                coverPath: song?.cover_path || null,
                price: row.price_eth ? parseFloat(row.price_eth) : null,
                date: row.sold_at || row.listed_at,
                status: 'completed',
            });
        });
    }

    // ── Sales & Active Listings (listings where this wallet is the seller) ──
    if (!filter || filter === 'all' || filter === 'sales') {
        const { data: sales } = await supabase
            .from('marketplace_listings')
            .select(`
                id, price_eth, listed_at, sold_at, seller_wallet, is_active,
                nft_token:nft_tokens!nft_token_id (
                    release:nft_releases!nft_release_id (
                        song:songs!song_id ( title, cover_path )
                    )
                )
            `)
            .eq('seller_wallet', wallet)
            .order('listed_at', { ascending: false })
            .limit(limit);

        (sales || []).forEach((row: any) => {
            const song = row.nft_token?.release?.song;
            activities.push({
                id: `${row.sold_at ? 'sale' : 'listing'}-${row.id}`,
                type: row.sold_at ? 'sale' : 'listing',
                songTitle: song?.title || 'Unknown Song',
                coverPath: song?.cover_path || null,
                price: row.price_eth ? parseFloat(row.price_eth) : null,
                date: row.sold_at || row.listed_at,
                status: row.sold_at ? 'completed' : (row.is_active ? 'active' : 'completed'),
            });
        });
    }

    // ── Mints (NFT tokens owned by this wallet) ──
    if (!filter || filter === 'all' || filter === 'mints') {
        const { data: mints } = await supabase
            .from('nft_tokens')
            .select(`
                id, minted_at, last_sale_price_eth,
                release:nft_releases!nft_release_id (
                    price_eth,
                    song:songs!song_id ( title, cover_path )
                )
            `)
            .eq('owner_wallet_address', wallet)
            .order('minted_at', { ascending: false })
            .limit(limit);

        (mints || []).forEach((row: any) => {
            const song = row.release?.song;
            activities.push({
                id: `mint-${row.id}`,
                type: 'mint',
                songTitle: song?.title || 'Unknown Song',
                coverPath: song?.cover_path || null,
                price: row.release?.price_eth ? parseFloat(row.release.price_eth) : null,
                date: row.minted_at,
                status: 'completed',
            });
        });
    }

    // Sort by date descending and limit
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return activities.slice(0, limit);
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
        coverPath: row.cover_path ?? null,
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
        description: row.description || null,
        coverImagePath: row.cover_image_path || null,
        benefits: row.benefits || [],
        song: row.song ? mapSongRow(row.song) : undefined,
    };
}

function mapNFTTokenRow(row: any): NFTToken {
    return {
        id: row.id,
        releaseId: row.nft_release_id,
        // Prefer the real on-chain token ID parsed from the Transfer event.
        // Falls back to DB-ordered token_id for legacy rows pre-migration 026.
        onChainTokenId: row.on_chain_token_id || row.token_id,
        ownerWalletAddress: row.owner_wallet_address,
        mintedAt: row.minted_at,
        pricePaidEth: row.price_paid_eth ? parseFloat(row.price_paid_eth) : null,
        release: row.release ? mapNFTReleaseRow(row.release) : undefined,
    };
}

function mapListingRow(row: any): MarketplaceListing {
    return {
        id: row.id,
        nftTokenId: row.nft_token_id,
        sellerWallet: row.seller_wallet,
        priceEth: parseFloat(row.price_eth),
        priceToken: row.price_token != null ? parseFloat(row.price_token) : null,
        priceEurAtList: row.price_eur_at_list != null ? parseFloat(row.price_eur_at_list) : null,
        isActive: row.is_active,
        chainListingId: row.chain_listing_id || null,
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

function mapRoyaltyEventRow(row: any): RoyaltyEvent {
    return {
        id: row.id,
        songId: row.song_id,
        sourceType: row.source_type,
        sourceReference: row.source_reference,
        grossAmountEur: parseFloat(row.gross_amount_eur) || 0,
        accountingPeriod: row.accounting_period,
        createdAt: row.created_at,
        song: row.song ? mapSongRow(row.song) : undefined,
    };
}

function mapRoyaltyShareRow(row: any): RoyaltyShare {
    return {
        id: row.id,
        royaltyEventId: row.royalty_event_id,
        partyEmail: row.party_email,
        linkedProfileId: row.linked_profile_id,
        walletAddress: row.wallet_address,
        shareType: row.share_type,
        nftReleaseId: row.nft_release_id,
        nftTokenId: row.nft_token_id,
        sharePercent: parseFloat(row.share_percent) || 0,
        amountEur: parseFloat(row.amount_eur) || 0,
        createdAt: row.created_at,
        royaltyEvent: row.royalty_event ? mapRoyaltyEventRow(row.royalty_event) : undefined,
        profile: row.profile ? mapArtistRow(row.profile) : undefined,
    };
}

// ────────────────────────────────────────────
// NFT SALES BY CREATOR
// ────────────────────────────────────────────

export interface NFTSaleRecord {
    id: string;
    songTitle: string;
    buyerWallet: string;
    pricePaidToken: number;
    pricePaidEurAtSale: number;
    txHash: string | null;
    purchasedAt: string;
    editionNumber: number;
    saleType: 'primary' | 'secondary';
}

/** Get NFT primary sales for a creator's songs */
export async function getCreatorNFTSales(profileId: string, limit = 50): Promise<NFTSaleRecord[]> {
    // Get creator's song IDs
    const { data: songs } = await supabase
        .from('songs')
        .select('id, title')
        .eq('creator_id', profileId);

    const songList = songs || [];
    if (songList.length === 0) return [];

    const songIds = songList.map((s) => s.id);
    const songTitleMap = new Map(songList.map((s) => [s.id, s.title]));

    // Get NFT releases for these songs
    const { data: releases } = await supabase
        .from('nft_releases')
        .select('id, song_id')
        .in('song_id', songIds);

    const releaseList = releases || [];
    if (releaseList.length === 0) return [];

    const releaseIds = releaseList.map((r) => r.id);
    const releaseSongMap = new Map(releaseList.map((r) => [r.id, r.song_id]));

    // Get nft_tokens for these releases (primary sales)
    const { data: tokens } = await supabase
        .from('nft_tokens')
        .select('id, nft_release_id, owner_wallet_address, last_sale_price_eth, last_sale_tx_hash, minted_at')
        .in('nft_release_id', releaseIds)
        .order('minted_at', { ascending: false })
        .limit(limit);

    return (tokens || []).map((t: any) => {
        const songId = releaseSongMap.get(t.nft_release_id) || '';
        return {
            id: t.id,
            songTitle: songTitleMap.get(songId) || 'Unknown',
            buyerWallet: t.owner_wallet_address || '',
            pricePaidToken: parseFloat(t.last_sale_price_eth) || 0,
            pricePaidEurAtSale: 0, // Not stored directly in `nft_tokens` currently
            txHash: t.last_sale_tx_hash || null,
            purchasedAt: t.minted_at,
            editionNumber: 0, // Not stored directly in `nft_tokens` schema

            saleType: 'primary' as const,
        };
    });
}

// ────────────────────────────────────────────
// BANK DETAILS & PAYOUT REQUESTS
// ────────────────────────────────────────────

export interface BankDetails {
    paymentMethod?: string;
    accountHolderName?: string;
    ibanOrAddress?: string;
    taxId?: string;
    payoutCountry?: string;
    // Fallbacks just in case
    bankName?: string;
    accountNumber?: string;
    routingCode?: string;
}

export interface PayoutRequest {
    id: string;
    profileId: string;
    amountEur: number;
    paymentMethod: string;
    paymentDetails: BankDetails | null;
    status: string;
    requestedAt: string;
    processedAt: string | null;
    adminNotes: string | null;
}

/** Get bank details from a user's profile */
export async function getBankDetails(profileId: string): Promise<BankDetails | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('bank_details')
        .eq('id', profileId)
        .maybeSingle();

    if (error || !data?.bank_details) return null;
    return data.bank_details as BankDetails;
}

/** Save bank details to a user's profile */
export async function saveBankDetails(
    profileId: string,
    bankDetails: BankDetails,
): Promise<boolean> {
    const { error } = await supabase
        .from('profiles')
        .update({ bank_details: bankDetails })
        .eq('id', profileId);

    if (error) {
        console.error('[db] saveBankDetails error:', error);
        return false;
    }
    return true;
}

/** Get artist's available balance (total earned - total paid out) */
export async function getArtistBalance(profileId: string): Promise<{
    totalEarned: number;
    totalPaidOut: number;
    availableBalance: number;
}> {
    const { data, error } = await supabase
        .rpc('get_artist_balance', { p_profile_id: profileId })
        .maybeSingle();

    if (error || !data) {
        console.warn('[db] getArtistBalance rpc error, falling back to manual calc:', error);
        // Fallback: manual calculation — only count streaming royalties
        const { data: shares } = await supabase
            .from('royalty_shares')
            .select('amount_eur, royalty_event_id')
            .eq('linked_profile_id', profileId);

        // Filter to streaming-only: fetch royalty_events with source_type='stream'
        let streamShares = shares || [];
        if (streamShares.length > 0) {
            const eventIds = [...new Set(streamShares.map(s => s.royalty_event_id))];
            const { data: events } = await supabase
                .from('royalty_events')
                .select('id')
                .in('id', eventIds)
                .eq('source_type', 'stream');
            const streamEventIds = new Set((events || []).map(e => e.id));
            streamShares = streamShares.filter(s => streamEventIds.has(s.royalty_event_id));
        }
        const totalEarned = streamShares.reduce((sum, s) => sum + (parseFloat(s.amount_eur) || 0), 0);

        const { data: payouts } = await supabase
            .from('payout_requests')
            .select('amount_eur')
            .eq('profile_id', profileId)
            .in('status', ['completed', 'pending']);
        const totalPaidOut = (payouts || []).reduce((sum, p) => sum + (parseFloat(p.amount_eur) || 0), 0);

        return { totalEarned, totalPaidOut, availableBalance: totalEarned - totalPaidOut };
    }

    return {
        totalEarned: parseFloat(data.total_earned) || 0,
        totalPaidOut: parseFloat(data.total_paid_out) || 0,
        availableBalance: parseFloat(data.available_balance) || 0,
    };
}

// ─────────────────────────────────────────────────────────────
// NFT LISTING LIMITS (PDF Fix #9)
// ─────────────────────────────────────────────────────────────

export type NftRarity = 'common' | 'rare' | 'legendary';

export interface ArtistNFTLimits {
    listingLimit: number;        // how many active releases this artist may have
    allowedRarities: NftRarity[]; // which rarities they may create
    activeListings: number;      // how many active releases they currently have
}

export interface NFTLimitRequest {
    id: string;
    profileId: string;
    requestedListingLimit: number | null;
    requestedRarities: NftRarity[] | null;
    reason: string | null;
    status: 'pending' | 'approved' | 'rejected';
    adminNotes: string | null;
    requestedAt: string;
    processedAt: string | null;
    processedBy: string | null;
    // Optional enrichments (admin view):
    artistName?: string;
    currentListingLimit?: number | null;
    currentAllowedRarities?: NftRarity[] | null;
}

/** Fetch an artist's current NFT listing limits + their active listing count. */
export async function getArtistNFTLimits(profileId: string): Promise<ArtistNFTLimits> {
    const { data: profile } = await supabase
        .from('profiles')
        .select('nft_listing_limit, allowed_nft_rarities')
        .eq('id', profileId)
        .maybeSingle();

    // Count active releases across all of this artist's songs.
    const { data: songs } = await supabase
        .from('songs')
        .select('id')
        .eq('creator_id', profileId);
    const songIds = (songs || []).map((s: any) => s.id);

    let activeListings = 0;
    if (songIds.length > 0) {
        const { count } = await supabase
            .from('nft_releases')
            .select('id', { count: 'exact', head: true })
            .in('song_id', songIds)
            .eq('is_active', true);
        activeListings = count ?? 0;
    }

    return {
        listingLimit: profile?.nft_listing_limit ?? 5,
        allowedRarities: (profile?.allowed_nft_rarities ?? ['common']) as NftRarity[],
        activeListings,
    };
}

/** Submit a "Request Higher Limit" petition. Fails if one is already pending. */
export async function submitNFTLimitRequest(
    profileId: string,
    requestedListingLimit: number | null,
    requestedRarities: NftRarity[] | null,
    reason: string | null,
): Promise<{ id: string | null; error?: string }> {
    if (requestedListingLimit === null && (!requestedRarities || requestedRarities.length === 0)) {
        return { id: null, error: 'You must request either a new listing limit or additional tier access.' };
    }

    // Block if there is already a pending request.
    const { count } = await supabase
        .from('nft_limit_requests')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('status', 'pending');
    if ((count ?? 0) > 0) {
        return {
            id: null,
            error: 'You already have a pending limit-increase request. Please wait for admin review.',
        };
    }

    const { data, error } = await supabase
        .from('nft_limit_requests')
        .insert({
            profile_id: profileId,
            requested_listing_limit: requestedListingLimit,
            requested_rarities: requestedRarities,
            reason,
            status: 'pending',
        })
        .select('id')
        .single();

    if (error || !data) {
        return { id: null, error: error?.message || 'Failed to submit request' };
    }
    return { id: data.id };
}

/** List NFT limit requests for a specific profile (artist view). */
export async function getMyNFTLimitRequests(profileId: string): Promise<NFTLimitRequest[]> {
    const { data, error } = await supabase
        .from('nft_limit_requests')
        .select('*')
        .eq('profile_id', profileId)
        .order('requested_at', { ascending: false });
    if (error) {
        console.error('[db] getMyNFTLimitRequests error:', error);
        return [];
    }
    return (data || []).map(mapNFTLimitRequest);
}

/** List all NFT limit requests (admin view). Enriched with artist display name + current limits. */
export async function getAllNFTLimitRequests(statusFilter?: 'pending' | 'approved' | 'rejected'): Promise<NFTLimitRequest[]> {
    let query = supabase
        .from('nft_limit_requests')
        .select(`*, profile:profiles!profile_id ( id, display_name, nft_listing_limit, allowed_nft_rarities )`)
        .order('requested_at', { ascending: false });
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (error) {
        console.error('[db] getAllNFTLimitRequests error:', error);
        return [];
    }
    return (data || []).map((row: any) => ({
        ...mapNFTLimitRequest(row),
        artistName: row.profile?.display_name ?? 'Unknown',
        currentListingLimit: row.profile?.nft_listing_limit ?? null,
        currentAllowedRarities: row.profile?.allowed_nft_rarities ?? null,
    }));
}

function mapNFTLimitRequest(row: any): NFTLimitRequest {
    return {
        id: row.id,
        profileId: row.profile_id,
        requestedListingLimit: row.requested_listing_limit,
        requestedRarities: row.requested_rarities,
        reason: row.reason,
        status: row.status,
        adminNotes: row.admin_notes,
        requestedAt: row.requested_at,
        processedAt: row.processed_at,
        processedBy: row.processed_by,
    };
}

/** Admin: directly set an artist's NFT limit & allowed rarities. */
export async function adminSetArtistNFTLimits(
    profileId: string,
    newLimit: number | null,
    newRarities: NftRarity[] | null,
): Promise<{ success: boolean; error?: string }> {
    const patch: Record<string, any> = {};
    if (newLimit !== null) patch.nft_listing_limit = newLimit;
    if (newRarities !== null) patch.allowed_nft_rarities = newRarities;
    if (Object.keys(patch).length === 0) return { success: true };

    const { error } = await supabase.from('profiles').update(patch).eq('id', profileId);
    if (error) return { success: false, error: error.message };
    return { success: true };
}

/** Admin: approve a pending limit request — applies the requested changes to the profile. */
export async function adminApproveNFTLimitRequest(
    requestId: string,
    adminProfileId: string,
    adminNotes?: string,
): Promise<{ success: boolean; error?: string }> {
    const { data: req, error: reqErr } = await supabase
        .from('nft_limit_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();
    if (reqErr || !req) return { success: false, error: 'Request not found' };
    if (req.status !== 'pending') return { success: false, error: 'Request is not pending' };

    // Merge existing allowed rarities with requested ones (add, don't replace).
    let newRarities: NftRarity[] | null = null;
    if (req.requested_rarities && req.requested_rarities.length > 0) {
        const { data: profile } = await supabase
            .from('profiles').select('allowed_nft_rarities').eq('id', req.profile_id).maybeSingle();
        const existing = (profile?.allowed_nft_rarities ?? ['common']) as NftRarity[];
        const combined = Array.from(new Set([...existing, ...req.requested_rarities])) as NftRarity[];
        newRarities = combined;
    }

    const setResult = await adminSetArtistNFTLimits(
        req.profile_id,
        req.requested_listing_limit ?? null,
        newRarities,
    );
    if (!setResult.success) return setResult;

    const { error: updErr } = await supabase
        .from('nft_limit_requests')
        .update({
            status: 'approved',
            admin_notes: adminNotes || null,
            processed_at: new Date().toISOString(),
            processed_by: adminProfileId,
        })
        .eq('id', requestId);
    if (updErr) return { success: false, error: updErr.message };
    return { success: true };
}

/** Admin: reject a pending limit request. */
export async function adminRejectNFTLimitRequest(
    requestId: string,
    adminProfileId: string,
    adminNotes?: string,
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from('nft_limit_requests')
        .update({
            status: 'rejected',
            admin_notes: adminNotes || 'Rejected by admin',
            processed_at: new Date().toISOString(),
            processed_by: adminProfileId,
        })
        .eq('id', requestId)
        .eq('status', 'pending');
    if (error) return { success: false, error: error.message };
    return { success: true };
}

// ============================================================
// PDF Fix #10 — Split Sheet Revenue: unregistered accrued revenue
// ============================================================

export interface UnregisteredAccruedRow {
    email: string;
    partyNameHint: string | null;
    songId: string;
    songTitle: string;
    songCreatorId: string;
    totalAccruedEur: number;
    shareCount: number;
    firstAccruedAt: string;
    lastAccruedAt: string;
    isRegistered: boolean;
    linkedProfileId: string | null;
}

/**
 * Admin: list streaming royalty revenue that has accrued for non-registered
 * split-sheet parties. NFT sales do not appear here (they go to the primary
 * creator only per PDF Fix #10).
 *
 * Pass `onlyRegistered`:
 *   - null/undefined — all rows
 *   - true  — only those whose email has since registered (ready to claim)
 *   - false — only those still unregistered
 */
export async function getUnregisteredAccruedRevenue(
    onlyRegistered?: boolean | null,
): Promise<UnregisteredAccruedRow[]> {
    const { data, error } = await supabase.rpc('get_unregistered_accrued_revenue', {
        only_registered: onlyRegistered ?? null,
    });
    if (error) {
        console.error('[db] getUnregisteredAccruedRevenue error:', error);
        return [];
    }
    return (data || []).map((row: any) => ({
        email: row.email,
        partyNameHint: row.party_name_hint,
        songId: row.song_id,
        songTitle: row.song_title,
        songCreatorId: row.song_creator_id,
        totalAccruedEur: parseFloat(row.total_accrued_eur) || 0,
        shareCount: Number(row.share_count) || 0,
        firstAccruedAt: row.first_accrued_at,
        lastAccruedAt: row.last_accrued_at,
        isRegistered: !!row.is_registered,
        linkedProfileId: row.linked_profile_id ?? null,
    }));
}

/** Does this profile have a pending (active) payout request? */
export async function hasPendingPayout(profileId: string): Promise<boolean> {
    const { count, error } = await supabase
        .from('payout_requests')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('status', 'pending');
    if (error) {
        console.warn('[db] hasPendingPayout error:', error);
        return false;
    }
    return (count ?? 0) > 0;
}

/** Create a payout request with balance validation */
export async function createPayoutRequest(
    profileId: string,
    amountEur: number,
    bankDetails: BankDetails,
    paymentMethod: string = 'bank_transfer',
): Promise<{ id: string | null; error?: string }> {
    // PDF Fix #8: reject if an active (pending) request already exists.
    // The edge function + DB unique index also enforce this; we check here
    // first for a fast client-side error.
    if (await hasPendingPayout(profileId)) {
        return {
            id: null,
            error: 'You already have a pending payout request. Please wait for admin approval or rejection before submitting a new one.',
        };
    }

    // Validate against available balance locally
    const balance = await getArtistBalance(profileId);
    if (amountEur > balance.availableBalance) {
        return {
            id: null,
            error: `Insufficient balance. Available: €${balance.availableBalance.toFixed(2)}, requested: €${amountEur.toFixed(2)}`,
        };
    }

    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/payout-request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                profileId,
                amountEur,
                paymentMethod,
                bankDetails,
            }),
        });

        let result: any;
        try {
            result = await response.json();
        } catch (parseErr) {
            console.error('[db] createPayoutRequest: non-JSON response', parseErr);
            return {
                id: null,
                error: `Payout service returned an invalid response (HTTP ${response.status}). Please try again.`,
            };
        }

        if (!response.ok || !result?.success) {
            // Prefer the server-sent error, then a status-specific fallback.
            const serverErr = result?.error || result?.message;
            if (serverErr) {
                return { id: null, error: serverErr };
            }
            if (response.status === 404) {
                return { id: null, error: 'Artist profile not found. Please sign out and back in.' };
            }
            if (response.status === 409) {
                return { id: null, error: 'You already have a pending payout request. Please wait for it to be approved or rejected.' };
            }
            if (response.status >= 500) {
                return { id: null, error: 'Payout service is temporarily unavailable. Please try again in a moment.' };
            }
            return { id: null, error: `Payout request failed (HTTP ${response.status}).` };
        }

        return { id: result.id };
    } catch (err: any) {
        console.error('[db] createPayoutRequest edge error:', err);
        return { id: null, error: err?.message || 'Network error while contacting payout service.' };
    }
}

/** Get payout requests for a specific user */
export async function getPayoutRequests(profileId: string): Promise<PayoutRequest[]> {
    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/payout-list`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ profileId }),
        });

        const result = await response.json();
        if (!result.success || !result.payouts) {
            console.error('[db] getPayoutRequests edge error:', result.error);
            return [];
        }

        return result.payouts.map((row: any) => ({
            id: row.id,
            profileId: row.profile_id,
            amountEur: parseFloat(row.amount_eur) || 0,
            paymentMethod: row.payment_method,
            paymentDetails: row.payment_details,
            status: row.status,
            requestedAt: row.requested_at,
            processedAt: row.processed_at,
            adminNotes: row.admin_notes,
        }));
    } catch (err: any) {
        console.error('[db] getPayoutRequests error:', err);
        return [];
    }
}

// ────────────────────────────────────────────
// Utility
// ────────────────────────────────────────────

function camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// ────────────────────────────────────────────
// PLAYLISTS
// ────────────────────────────────────────────

export interface PlaylistRow {
    id: string;
    ownerId: string;
    name: string;
    description: string | null;
    coverPath: string | null;
    isPublic: boolean;
    createdAt: string;
    updatedAt: string;
    songCount?: number;
    songs?: Song[];
}

/** Get all playlists for a user with song counts */
export async function getPlaylists(ownerId: string): Promise<PlaylistRow[]> {
    const { data, error } = await supabase
        .from('playlists')
        .select('*')
        .eq('owner_id', ownerId)
        .order('updated_at', { ascending: false });

    if (error || !data) {
        console.error('[db] getPlaylists error:', error);
        return [];
    }

    // Get song counts
    const playlistIds = data.map((p: any) => p.id);
    const { data: songCounts } = await supabase
        .from('playlist_songs')
        .select('playlist_id')
        .in('playlist_id', playlistIds);

    const countMap = new Map<string, number>();
    (songCounts || []).forEach((row: any) => {
        countMap.set(row.playlist_id, (countMap.get(row.playlist_id) || 0) + 1);
    });

    return data.map((row: any) => ({
        id: row.id,
        ownerId: row.owner_id,
        name: row.name,
        description: row.description,
        coverPath: row.cover_path,
        isPublic: row.is_public,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        songCount: countMap.get(row.id) || 0,
    }));
}

/** Get a single playlist with its songs */
export async function getPlaylistById(playlistId: string): Promise<PlaylistRow | null> {
    const { data, error } = await supabase
        .from('playlists')
        .select('*')
        .eq('id', playlistId)
        .maybeSingle();

    if (error || !data) return null;

    // Get songs in order
    const { data: songRows } = await supabase
        .from('playlist_songs')
        .select(`
            position,
            song:songs!song_id (
                *,
                creator:profiles!creator_id (
                    id, wallet_address, display_name, bio, creator_type, role, avatar_path, cover_path, is_verified, country
                )
            )
        `)
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true });

    const songs = (songRows || [])
        .map((row: any) => row.song ? mapSongRow(row.song) : null)
        .filter(Boolean) as Song[];

    return {
        id: data.id,
        ownerId: data.owner_id,
        name: data.name,
        description: data.description,
        coverPath: data.cover_path,
        isPublic: data.is_public,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        songCount: songs.length,
        songs,
    };
}

/** Create a new playlist */
export async function createPlaylist(
    ownerId: string,
    name: string,
    description?: string,
): Promise<PlaylistRow | null> {
    const { data, error } = await supabase
        .from('playlists')
        .insert({
            owner_id: ownerId,
            name,
            description: description || null,
            is_public: false,
        })
        .select()
        .single();

    if (error || !data) {
        console.error('[db] createPlaylist error:', error);
        return null;
    }

    return {
        id: data.id,
        ownerId: data.owner_id,
        name: data.name,
        description: data.description,
        coverPath: data.cover_path,
        isPublic: data.is_public,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        songCount: 0,
    };
}

/** Update a playlist */
export async function updatePlaylist(
    playlistId: string,
    updates: { name?: string; description?: string; isPublic?: boolean },
): Promise<boolean> {
    const updateObj: any = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) updateObj.name = updates.name;
    if (updates.description !== undefined) updateObj.description = updates.description;
    if (updates.isPublic !== undefined) updateObj.is_public = updates.isPublic;

    const { error } = await supabase
        .from('playlists')
        .update(updateObj)
        .eq('id', playlistId);

    if (error) {
        console.error('[db] updatePlaylist error:', error);
        return false;
    }
    return true;
}

/** Delete a playlist */
export async function deletePlaylist(playlistId: string): Promise<boolean> {
    const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId);

    if (error) {
        console.error('[db] deletePlaylist error:', error);
        return false;
    }
    return true;
}

/** Add a song to a playlist */
export async function addSongToPlaylist(playlistId: string, songId: string): Promise<boolean> {
    // Get max position
    const { data: existing } = await supabase
        .from('playlist_songs')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1);

    const nextPosition = (existing?.[0]?.position ?? -1) + 1;

    const { error } = await supabase
        .from('playlist_songs')
        .upsert(
            { playlist_id: playlistId, song_id: songId, position: nextPosition },
            { onConflict: 'playlist_id,song_id' },
        );

    if (error) {
        console.error('[db] addSongToPlaylist error:', error);
        return false;
    }

    // Update playlist timestamp
    await supabase
        .from('playlists')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', playlistId);

    return true;
}

/** Remove a song from a playlist */
export async function removeSongFromPlaylist(playlistId: string, songId: string): Promise<boolean> {
    const { error } = await supabase
        .from('playlist_songs')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('song_id', songId);

    if (error) {
        console.error('[db] removeSongFromPlaylist error:', error);
        return false;
    }
    return true;
}
