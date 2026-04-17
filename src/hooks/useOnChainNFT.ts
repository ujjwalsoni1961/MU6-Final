/**
 * On-chain NFT read hooks (PDF bug #17 — force on-chain ownership reads)
 *
 * DB is a cache; on-chain is source of truth. These hooks read ownership &
 * balance DIRECTLY from the ERC-721 contract via thirdweb's readContract.
 *
 * Use these anywhere you need to display "who owns this NFT right now?" or
 * "how many NFTs does this wallet own on-chain?" — never trust the DB
 * `owner_wallet_address` column for display; it's a lagging index.
 *
 * Simple in-memory cache (per-session) to keep perf decent: same tokenId
 * won't refetch within 30s. Bypass with `refreshKey`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { readContract } from 'thirdweb';
import { getSongNFTContract } from '../lib/thirdweb';

const OWNER_CACHE_MS = 30_000;
const BALANCE_CACHE_MS = 30_000;

type OwnerCacheEntry = { owner: string | null; at: number };
type BalanceCacheEntry = { balance: bigint; at: number };

const ownerCache = new Map<string, OwnerCacheEntry>();
const balanceCache = new Map<string, BalanceCacheEntry>();

/**
 * Read the on-chain owner of a specific token ID.
 *
 * Returns lowercased address or null (unminted / errored).
 * Pass `refreshKey` and increment it to force a refetch (e.g. after a
 * marketplace buy completes).
 */
export function useOnChainOwnership(tokenId: string | null | undefined, refreshKey = 0) {
    const [owner, setOwner] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const cancelled = useRef(false);

    useEffect(() => {
        cancelled.current = false;
        if (!tokenId || !/^\d+$/.test(tokenId)) {
            setOwner(null);
            return () => { cancelled.current = true; };
        }

        const cacheKey = tokenId;
        const cached = ownerCache.get(cacheKey);
        if (cached && Date.now() - cached.at < OWNER_CACHE_MS && refreshKey === 0) {
            setOwner(cached.owner);
            return () => { cancelled.current = true; };
        }

        setLoading(true);
        setError(null);

        (async () => {
            try {
                const result = await readContract({
                    contract: getSongNFTContract(),
                    method: 'function ownerOf(uint256 tokenId) view returns (address)',
                    params: [BigInt(tokenId)],
                });
                const ownerAddr = (result as string).toLowerCase();
                ownerCache.set(cacheKey, { owner: ownerAddr, at: Date.now() });
                if (!cancelled.current) setOwner(ownerAddr);
            } catch (err: any) {
                // ownerOf reverts if the token isn't minted — treat as null
                ownerCache.set(cacheKey, { owner: null, at: Date.now() });
                if (!cancelled.current) {
                    setOwner(null);
                    setError(err?.message || 'Failed to read owner');
                }
            } finally {
                if (!cancelled.current) setLoading(false);
            }
        })();

        return () => { cancelled.current = true; };
    }, [tokenId, refreshKey]);

    return { owner, loading, error };
}

/**
 * Read the on-chain ERC-721 balance of a wallet.
 * Returns bigint (0n when wallet has no NFTs).
 */
export function useOnChainBalance(walletAddress: string | null | undefined, refreshKey = 0) {
    const [balance, setBalance] = useState<bigint>(BigInt(0));
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const cancelled = useRef(false);

    useEffect(() => {
        cancelled.current = false;
        if (!walletAddress) {
            setBalance(BigInt(0));
            return () => { cancelled.current = true; };
        }

        const cacheKey = walletAddress.toLowerCase();
        const cached = balanceCache.get(cacheKey);
        if (cached && Date.now() - cached.at < BALANCE_CACHE_MS && refreshKey === 0) {
            setBalance(cached.balance);
            return () => { cancelled.current = true; };
        }

        setLoading(true);
        setError(null);

        (async () => {
            try {
                const result = await readContract({
                    contract: getSongNFTContract(),
                    method: 'function balanceOf(address owner) view returns (uint256)',
                    params: [walletAddress as `0x${string}`],
                });
                const bal = result as bigint;
                balanceCache.set(cacheKey, { balance: bal, at: Date.now() });
                if (!cancelled.current) setBalance(bal);
            } catch (err: any) {
                if (!cancelled.current) {
                    setBalance(BigInt(0));
                    setError(err?.message || 'Failed to read balance');
                }
            } finally {
                if (!cancelled.current) setLoading(false);
            }
        })();

        return () => { cancelled.current = true; };
    }, [walletAddress, refreshKey]);

    return { balance, loading, error };
}

/**
 * Batch verify on-chain ownership for a list of (tokenId, expectedOwner) pairs.
 * Useful on the Collection page to filter out NFTs the DB thinks the user owns
 * but have actually been transferred out (e.g. direct wallet-to-wallet sends).
 *
 * Returns a Set of tokenIds that ARE still owned by `expectedOwner` on-chain.
 */
export async function filterOnChainOwned(
    tokenIds: string[],
    expectedOwner: string,
): Promise<Set<string>> {
    const expected = expectedOwner.toLowerCase();
    const results = await Promise.all(
        tokenIds.map(async (tokenId) => {
            if (!/^\d+$/.test(tokenId)) return null;
            try {
                const result = await readContract({
                    contract: getSongNFTContract(),
                    method: 'function ownerOf(uint256 tokenId) view returns (address)',
                    params: [BigInt(tokenId)],
                });
                return (result as string).toLowerCase() === expected ? tokenId : null;
            } catch {
                return null; // unminted or errored
            }
        }),
    );
    return new Set(results.filter((x): x is string => x !== null));
}

/** Invalidate all on-chain caches (call after a buy/sell/transfer). */
export function invalidateOnChainCaches() {
    ownerCache.clear();
    balanceCache.clear();
}
