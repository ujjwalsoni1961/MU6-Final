/**
 * PDF #12 — Admin "Wallet & On-Chain Activity" hook.
 *
 * Aggregates every wallet known to the platform (profiles + distinct
 * owner_wallet_address from nft_tokens) with:
 *   - DB-recorded NFT tokens they own
 *   - DB-recorded marketplace activity (listings, sales)
 *   - Live on-chain ERC-1155 balance summed across all known tokenIds
 *   - Sync discrepancy flag when DB count ≠ on-chain count
 *
 * Administrators can then drill in to reconcile ghost rows vs real NFTs.
 *
 * On-chain reads are cached for 30s to keep the admin dashboard
 * responsive without hammering the RPC endpoint.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { readContract, getContract } from 'thirdweb';
import { thirdwebClient } from '../lib/thirdweb';
import { CHAIN, CONTRACT_ADDRESSES, EXPLORER_BASE } from '../config/network';
import { supabase } from '../lib/supabase';

export interface OnChainWalletRow {
    /** Lower-cased EVM address used as the stable key. */
    wallet: string;
    /** Matching profile (if the wallet is registered with MU6). */
    profileId: string | null;
    displayName: string | null;
    email: string | null;
    role: 'listener' | 'creator' | 'admin' | null;
    isBlocked: boolean;
    isActive: boolean;

    /** NFT tokens the DB believes this wallet owns (is_voided=false). */
    dbOwnedCount: number;

    /** Listings currently attributed to this wallet in the DB. */
    dbActiveListings: number;

    /** Aggregated POL spent on primary sales, per DB. */
    dbPrimarySpendPol: number;

    /**
     * On-chain ERC-1155 balance, summed across every known tokenId on
     * the MU6 song contract. `null` means we haven't fetched yet (or the
     * fetch failed — see `onChainError`).
     */
    onChainBalance: number | null;
    onChainError: string | null;
    onChainCheckedAt: number | null;

    /** Derived: true when dbOwnedCount !== onChainBalance. */
    outOfSync: boolean;

    /** Polygonscan link for quick audit. */
    explorerUrl: string;
}

interface RawCountResult {
    wallet: string;
    count: number;
}

const ON_CHAIN_CACHE = new Map<string, { balance: number; at: number }>();
const CACHE_TTL_MS = 30_000;

/**
 * ERC-1155 balanceOfBatch(accounts[], ids[]) sums the holdings of a single
 * wallet across every known tokenId. We pass [wallet, wallet, ...] and
 * [id0, id1, ...] because balanceOfBatch zips the two arrays pairwise.
 */
async function readOnChainBalance(wallet: string, tokenIds: bigint[]): Promise<number> {
    if (tokenIds.length === 0) return 0;

    const cached = ON_CHAIN_CACHE.get(wallet.toLowerCase());
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.balance;
    }

    const contract = getContract({
        client: thirdwebClient,
        chain: CHAIN,
        address: CONTRACT_ADDRESSES.SONG_NFT,
    });

    const accounts = tokenIds.map(() => wallet as `0x${string}`);
    const raw = await readContract({
        contract,
        method: 'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
        params: [accounts, tokenIds],
    }) as readonly bigint[];

    const balance = raw.reduce((sum, n) => sum + Number(n), 0);
    ON_CHAIN_CACHE.set(wallet.toLowerCase(), { balance, at: Date.now() });
    return balance;
}

export function useAdminOnChainActivity() {
    const [rows, setRows] = useState<OnChainWalletRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [onChainFetching, setOnChainFetching] = useState(false);
    const [tokenIds, setTokenIds] = useState<bigint[]>([]);

    const loadBaseData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. All profiles with wallets
            const { data: profiles, error: profileErr } = await supabase
                .from('profiles')
                .select('id, wallet_address, display_name, email, role, is_blocked, is_active')
                .not('wallet_address', 'is', null);

            if (profileErr) throw profileErr;

            // 2. Active (non-voided) NFT tokens for a quick per-wallet count
            const { data: tokens, error: tokenErr } = await supabase
                .from('nft_tokens')
                .select('owner_wallet_address, price_paid_eth, is_voided, on_chain_token_id')
                .or('is_voided.is.null,is_voided.eq.false');

            if (tokenErr) throw tokenErr;

            // Collect distinct on-chain token IDs so we can query ERC-1155
            // balanceOfBatch for each wallet.
            const idSet = new Set<string>();
            for (const t of tokens || []) {
                if (t.on_chain_token_id !== null && t.on_chain_token_id !== undefined) {
                    idSet.add(String(t.on_chain_token_id));
                }
            }
            const distinctIds: bigint[] = Array.from(idSet).map((s) => {
                try { return BigInt(s); } catch { return null; }
            }).filter((x): x is bigint => x !== null);
            setTokenIds(distinctIds);

            // 3. Active marketplace listings per wallet.
            // NOTE: canonical schema (migration 001) uses `seller_wallet` and
            // `is_active` — not `seller_wallet_address` / `status`. Earlier
            // iteration of this hook referenced the wrong column names and
            // produced "column marketplace_listings.seller_wallet_address does
            // not exist" on the Wallet & On-Chain Activity screen.
            const { data: listings, error: listErr } = await supabase
                .from('marketplace_listings')
                .select('seller_wallet, is_active')
                .eq('is_active', true);

            if (listErr) throw listErr;

            const ownedMap = new Map<string, { count: number; spend: number }>();
            for (const t of tokens || []) {
                if (!t.owner_wallet_address) continue;
                const key = t.owner_wallet_address.toLowerCase();
                const cur = ownedMap.get(key) || { count: 0, spend: 0 };
                cur.count += 1;
                cur.spend += t.price_paid_eth ? parseFloat(t.price_paid_eth) : 0;
                ownedMap.set(key, cur);
            }

            const listingMap = new Map<string, number>();
            for (const l of listings || []) {
                if (!l.seller_wallet) continue;
                const key = l.seller_wallet.toLowerCase();
                listingMap.set(key, (listingMap.get(key) || 0) + 1);
            }

            // 4. Union of all known wallets — profiles ∪ token owners ∪ sellers.
            const walletSet = new Set<string>();
            for (const p of profiles || []) {
                if (p.wallet_address) walletSet.add(p.wallet_address.toLowerCase());
            }
            for (const k of ownedMap.keys()) walletSet.add(k);
            for (const k of listingMap.keys()) walletSet.add(k);

            const profileByWallet = new Map<string, any>();
            for (const p of profiles || []) {
                if (p.wallet_address) {
                    profileByWallet.set(p.wallet_address.toLowerCase(), p);
                }
            }

            const merged: OnChainWalletRow[] = Array.from(walletSet).map((wallet) => {
                const p = profileByWallet.get(wallet);
                const owned = ownedMap.get(wallet) || { count: 0, spend: 0 };
                return {
                    wallet,
                    profileId: p?.id || null,
                    displayName: p?.display_name || null,
                    email: p?.email || null,
                    role: p?.role || null,
                    isBlocked: p?.is_blocked === true,
                    isActive: p?.is_active !== false,
                    dbOwnedCount: owned.count,
                    dbActiveListings: listingMap.get(wallet) || 0,
                    dbPrimarySpendPol: owned.spend,
                    onChainBalance: null,
                    onChainError: null,
                    onChainCheckedAt: null,
                    outOfSync: false,
                    explorerUrl: `${EXPLORER_BASE}/address/${wallet}`,
                };
            });

            // Sort: unregistered wallets last, then by DB owned count desc.
            merged.sort((a, b) => {
                if (!!a.profileId !== !!b.profileId) return a.profileId ? -1 : 1;
                return b.dbOwnedCount - a.dbOwnedCount;
            });

            setRows(merged);
        } catch (e: any) {
            console.error('[admin/onchain] load error:', e);
            setError(e?.message || 'Failed to load wallet activity');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadBaseData();
    }, [loadBaseData]);

    /**
     * Fetch on-chain balances for the currently loaded rows.
     * Called explicitly by the screen (button / refresh) because we
     * don't want to auto-blast the RPC on every render.
     */
    const refreshOnChain = useCallback(async () => {
        if (rows.length === 0) return;
        setOnChainFetching(true);
        try {
            // Process in small batches of 5 to respect RPC rate limits.
            const batched: OnChainWalletRow[] = [...rows];
            const BATCH = 5;
            for (let i = 0; i < batched.length; i += BATCH) {
                const slice = batched.slice(i, i + BATCH);
                const results = await Promise.allSettled(
                    slice.map((r) => readOnChainBalance(r.wallet, tokenIds)),
                );
                results.forEach((res, idx) => {
                    const row = slice[idx];
                    if (res.status === 'fulfilled') {
                        row.onChainBalance = res.value;
                        row.onChainError = null;
                        row.onChainCheckedAt = Date.now();
                        row.outOfSync = res.value !== row.dbOwnedCount;
                    } else {
                        row.onChainError = res.reason?.message || 'RPC error';
                        row.onChainCheckedAt = Date.now();
                    }
                });
                // Progressive update so the UI fills in as we go.
                setRows([...batched]);
            }
        } finally {
            setOnChainFetching(false);
        }
    }, [rows, tokenIds]);

    const summary = useMemo(() => {
        const totalWallets = rows.length;
        const registered = rows.filter((r) => r.profileId).length;
        const checked = rows.filter((r) => r.onChainCheckedAt !== null).length;
        const outOfSync = rows.filter((r) => r.onChainCheckedAt !== null && r.outOfSync).length;
        return { totalWallets, registered, checked, outOfSync };
    }, [rows]);

    return {
        rows,
        loading,
        error,
        onChainFetching,
        summary,
        refresh: loadBaseData,
        refreshOnChain,
    };
}
