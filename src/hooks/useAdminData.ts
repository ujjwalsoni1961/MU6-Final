/**
 * Admin-specific data hooks
 *
 * Provides comprehensive data access for the admin portal.
 * Each hook queries Supabase directly for admin views.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import * as db from '../services/database';
import { readErc1155BalancesForPairs } from './useOnChainNFT';

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

/**
 * Chain-first admin view of NFT holdings.
 *
 * Mirrors the consumer-side `useOwnedNFTsWithStatus` pattern but enumerates
 * every wallet known to the platform (profiles ∪ nft_tokens owners ∪
 * marketplace sellers). For each (contract, tokenId) release the hook asks
 * the chain "which of these wallets actually holds a balance > 0?" and emits
 * exactly ONE row per live copy. DB is only consulted for enrichment
 * (song/tier/rarity/minted_at) and to carry the UUID for admin-only actions
 * like `voidToken` that operate on a DB ledger row.
 *
 * Why chain-first:
 *   The DB ledger records one row per claim, but on-chain ERC-1155 balances
 *   can diverge (burns, transfers outside the marketplace, legacy
 *   pre-production mints). The admin screen previously rendered 5 DB ghost
 *   rows for a token that has only 1 real copy on chain. After this change
 *   the UI reflects ground truth: one row per on-chain copy, not per DB
 *   record.
 *
 * Row shape matches the existing `useAdminNFTTokens` consumer in
 * app/(admin)/nft-tokens.tsx so the screen file needs no re-work beyond
 * swapping the hook import.
 */
export interface AdminNFTTokenRow {
    id: string;
    songTitle: string;
    tierName: string;
    rarity: string;
    ownerWallet: string;
    onChainTokenId: string;
    legacyEditionId: string;
    pricePaidEth: number;
    isVoided: boolean;
    mintedAt: string | null;
    onChainVerifiable: boolean;
    /** True when this row maps to a real nft_tokens UUID (admin actions enabled). */
    hasDbRow: boolean;
    contractAddress: string;
}

export function useAdminNFTTokensOnChain() {
    return useAsync<AdminNFTTokenRow[]>(
        async () => {
            // Step 1: universe of ERC-1155 (contract, tokenId) pairs + ghost filter.
            const [releases, ghostPairs] = await Promise.all([
                db.getAllErc1155ReleasesForScan(),
                db.getGhostTokenPairKeys(),
            ]);
            if (releases.length === 0) return [];

            const pairKey = (contract: string, tokenId: string | number) =>
                `${contract.toLowerCase()}:${String(tokenId)}`;

            type ReleaseInfo = {
                contract: string;
                tokenId: string;
                songTitle: string;
                tierName: string;
                rarity: string;
                priceEth: number;
            };
            const releaseByPair = new Map<string, ReleaseInfo>();
            for (const r of releases) {
                if (!r.contractAddress || r.tokenId == null) continue;
                const contract = r.contractAddress.toLowerCase();
                const tokenIdStr = String(r.tokenId);
                const key = pairKey(contract, tokenIdStr);
                if (ghostPairs.has(key)) continue;
                if (releaseByPair.has(key)) continue;
                releaseByPair.set(key, {
                    contract,
                    tokenId: tokenIdStr,
                    songTitle: r.song?.title || 'Unknown',
                    tierName: r.tierName || '',
                    rarity: r.rarity || '',
                    priceEth: r.priceEth || 0,
                });
            }
            if (releaseByPair.size === 0) return [];

            // Step 2: build candidate wallet union (profiles ∪ token owners ∪
            // marketplace sellers). Mirrors the pattern used in
            // useAdminOnChainActivity so the two admin views scan the same
            // wallet universe.
            const [profilesRes, tokenRowsRes, listingsRes] = await Promise.all([
                supabase.from('profiles').select('wallet_address').not('wallet_address', 'is', null),
                supabase.from('nft_tokens').select('id, owner_wallet_address, on_chain_token_id, price_paid_eth, minted_at, is_voided, nft_release_id'),
                supabase.from('marketplace_listings').select('seller_wallet').not('seller_wallet', 'is', null),
            ]);

            // Accept only real 0x-prefixed 20-byte hex addresses. Historic
            // test / seed data in `profiles` contains placeholder strings
            // like `0xluna000300...` that are not valid hex — they would
            // poison the ABI encoding for balanceOfBatch and cause the whole
            // call to fail, collapsing the admin view to 0 rows. Filter
            // them at the edge instead of inside the encoder.
            const VALID_ADDR = /^0x[0-9a-f]{40}$/i;
            const walletSet = new Set<string>();
            const addIfValid = (raw: unknown) => {
                if (typeof raw !== 'string') return;
                const addr = raw.trim().toLowerCase();
                if (VALID_ADDR.test(addr)) walletSet.add(addr);
            };
            for (const p of profilesRes.data || []) addIfValid(p.wallet_address);
            for (const t of tokenRowsRes.data || []) addIfValid(t.owner_wallet_address);
            for (const l of listingsRes.data || []) addIfValid(l.seller_wallet);
            const candidateWallets = Array.from(walletSet);
            if (candidateWallets.length === 0) return [];

            // Step 3: for each (contract, tokenId), read balance of every
            // candidate wallet via balanceOfBatch. We issue the batch once per
            // pair using length-N parallel arrays: all accounts, all repeated
            // with the same tokenId. On a pair-per-pair basis this is the
            // cheapest way to get the answer for many wallets in one RPC.
            const balanceQueries: Array<Promise<{ contract: string; tokenId: string; balances: bigint[] }>> = [];
            for (const r of releaseByPair.values()) {
                const tokenIdBig = BigInt(r.tokenId);
                const tokenIds = candidateWallets.map(() => tokenIdBig);
                balanceQueries.push(
                    readErc1155BalancesForPairs(r.contract, candidateWallets, tokenIds)
                        .then((balances) => ({ contract: r.contract, tokenId: r.tokenId, balances })),
                );
            }
            const balanceResults = await Promise.all(balanceQueries);

            // Step 4: build enrichment map keyed by (contract, tokenId, wallet)
            // so each on-chain copy can pull its DB ledger row if one exists.
            // We still need the UUID for admin actions (voidToken), minted_at
            // for display, and is_voided for the status pill.
            //
            // IMPORTANT: a wallet may have multiple DB rows for the same pair
            // (historically one row was written per claim). We pick the most
            // recent non-voided row when available; otherwise the most recent.
            const dbRowsByTriple = new Map<string, {
                id: string;
                pricePaidEth: number;
                mintedAt: string | null;
                isVoided: boolean;
                legacyEditionId: string;
            }>();

            // We also need the release_id → on_chain_token_id map so we can
            // join nft_tokens rows (which reference release_id, not tokenId)
            // back to the pair they belong to.
            const releaseIdToPair = new Map<string, { contract: string; tokenId: string }>();
            for (const r of releases) {
                if (!r.contractAddress || r.tokenId == null) continue;
                releaseIdToPair.set(r.id, {
                    contract: r.contractAddress.toLowerCase(),
                    tokenId: String(r.tokenId),
                });
            }

            for (const row of tokenRowsRes.data || []) {
                if (!row.owner_wallet_address || !row.nft_release_id) continue;
                const pair = releaseIdToPair.get(row.nft_release_id);
                if (!pair) continue;
                const wallet = String(row.owner_wallet_address).toLowerCase();
                const tripleKey = `${pair.contract}:${pair.tokenId}:${wallet}`;
                const existing = dbRowsByTriple.get(tripleKey);
                const candidate = {
                    id: row.id,
                    pricePaidEth: row.price_paid_eth ? parseFloat(row.price_paid_eth) : 0,
                    mintedAt: row.minted_at || null,
                    isVoided: row.is_voided === true,
                    legacyEditionId: row.on_chain_token_id ? String(row.on_chain_token_id) : '',
                };
                // Prefer non-voided over voided; among same-state, prefer the
                // most recently minted row. Ordering is best-effort since the
                // query above didn't sort — this keeps the preference
                // deterministic without an extra DB round-trip.
                if (!existing) {
                    dbRowsByTriple.set(tripleKey, candidate);
                } else if (existing.isVoided && !candidate.isVoided) {
                    dbRowsByTriple.set(tripleKey, candidate);
                } else if (existing.isVoided === candidate.isVoided) {
                    const a = existing.mintedAt ? Date.parse(existing.mintedAt) : 0;
                    const b = candidate.mintedAt ? Date.parse(candidate.mintedAt) : 0;
                    if (b > a) dbRowsByTriple.set(tripleKey, candidate);
                }
            }

            // Step 5: emit one row per on-chain copy. `quantity > 1` on
            // ERC-1155 means the wallet holds multiple copies of the same
            // tokenId; expand to N rows so the admin count matches chain
            // reality (5 wallets × 1 copy is different from 1 wallet × 5
            // copies — both render 5 rows but owner-distribution is visible).
            const out: AdminNFTTokenRow[] = [];
            for (const { contract, tokenId, balances } of balanceResults) {
                const release = releaseByPair.get(pairKey(contract, tokenId));
                if (!release) continue;
                for (let i = 0; i < candidateWallets.length; i++) {
                    const bal = balances[i];
                    if (bal <= 0n) continue;
                    const wallet = candidateWallets[i];
                    const dbRow = dbRowsByTriple.get(`${contract}:${tokenId}:${wallet}`);
                    const copies = Number(bal);
                    for (let c = 0; c < copies; c++) {
                        out.push({
                            id: dbRow && c === 0
                                ? dbRow.id
                                // Synthetic id for copies beyond what the DB
                                // ledger tracks. Still stable for React keys.
                                : `onchain-${contract}-${tokenId}-${wallet}-${c}`,
                            songTitle: release.songTitle,
                            tierName: release.tierName,
                            rarity: release.rarity,
                            ownerWallet: wallet,
                            onChainTokenId: tokenId,
                            legacyEditionId: dbRow?.legacyEditionId || '',
                            pricePaidEth: dbRow?.pricePaidEth ?? release.priceEth,
                            // Chain says the copy exists; DB's is_voided flag
                            // is a ledger-only status and does NOT reflect
                            // chain reality. Keep the pill for visibility but
                            // never hide a real on-chain copy behind it.
                            isVoided: dbRow?.isVoided === true,
                            mintedAt: dbRow?.mintedAt || null,
                            // This IS on-chain — by definition verifiable.
                            onChainVerifiable: true,
                            hasDbRow: !!(dbRow && c === 0),
                            contractAddress: contract,
                        });
                    }
                }
            }

            // Sort newest mint first (null mintedAt last).
            out.sort((a, b) => {
                const ta = a.mintedAt ? Date.parse(a.mintedAt) : 0;
                const tb = b.mintedAt ? Date.parse(b.mintedAt) : 0;
                return tb - ta;
            });

            return out;
        },
        [],
        [],
    );
}

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
                // Post-migration 028: on_chain_token_id is the ONLY source of
                // truth. Legacy `token_id` (per-release edition number) is
                // shown separately in a dedicated column and never used for
                // on-chain verification.
                onChainTokenId: row.on_chain_token_id || '',
                legacyEditionId: row.token_id || '',
                pricePaidEth: row.price_paid_eth ? parseFloat(row.price_paid_eth) : 0,
                isVoided: row.is_voided ?? false,
                mintedAt: row.minted_at,
                // Sync badge: a row is verifiable only if it has a real on-chain id.
                onChainVerifiable: !!row.on_chain_token_id,
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
const ADMIN_SECRET = process.env.EXPO_PUBLIC_ADMIN_SECRET || '';

export function useAdminPayoutRequests(adminProfileId?: string | 'superadmin', limit = 50) {
    return useAsync(
        async () => {
            // Admin dashboard: we send profileId='superadmin' AND the admin secret
            // header. The edge function checks the secret first (SEC-04); profileId
            // value is only used for response debugging in that path.
            const targetProfile = adminProfileId || 'superadmin';

            try {
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                };
                if (ADMIN_SECRET) headers['x-mu6-admin-secret'] = ADMIN_SECRET;
                const response = await fetch(`${SUPABASE_URL}/functions/v1/payout-list`, {
                    method: 'POST',
                    headers,
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
// PRIMARY SALE PAYOUTS (Option B forwarding ledger)
// ────────────────────────────────────────────

export interface AdminPrimarySalePayout {
    id: string;
    createdAt: string;
    status: 'pending' | 'forwarded' | 'pending_retry' | 'failed' | string;
    chainId: string;
    contractAddress: string;
    nftTokenId: string;
    buyerWallet: string;
    artistWallet: string;
    grossWei: string;
    artistWei: string;
    platformWei: string;
    platformFeeBps: number;
    claimTxHash: string;
    forwardTxHash: string;
    attemptCount: number;
    lastError: string;
    forwardedAt: string | null;
    tierName: string;
    rarity: string;
    songTitle: string;
    artistName: string;
}

export function useAdminPrimarySalePayouts(limit = 100) {
    return useAsync<AdminPrimarySalePayout[]>(
        async () => {
            const { data, error } = await supabase
                .from('primary_sale_payouts_admin_view')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('[useAdminPrimarySalePayouts] query error:', error);
                return [];
            }
            return (data || []).map((row: any) => ({
                id: row.id,
                createdAt: row.created_at,
                status: row.status,
                chainId: row.chain_id,
                contractAddress: row.contract_address,
                nftTokenId: row.nft_token_id,
                buyerWallet: row.buyer_wallet,
                artistWallet: row.artist_wallet,
                grossWei: String(row.gross_wei ?? '0'),
                artistWei: String(row.artist_wei ?? '0'),
                platformWei: String(row.platform_wei ?? '0'),
                platformFeeBps: row.platform_fee_bps ?? 0,
                claimTxHash: row.claim_tx_hash || '',
                forwardTxHash: row.forward_tx_hash || '',
                attemptCount: row.attempt_count ?? 0,
                lastError: row.last_error || '',
                forwardedAt: row.forwarded_at,
                tierName: row.tier_name || '',
                rarity: row.rarity || '',
                songTitle: row.song_title || 'Unknown',
                artistName: row.artist_name || 'Unknown',
            }));
        },
        [],
        [limit],
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
