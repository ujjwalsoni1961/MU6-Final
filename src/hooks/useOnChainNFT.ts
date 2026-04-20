/**
 * On-chain NFT read helpers (ERC-1155 only).
 *
 * DB is a cache; on-chain is source of truth. This module exposes a single
 * helper — `readErc1155Balance` — used to verify that a wallet actually holds
 * a given (contract, tokenId) pair before we display it as "owned".
 *
 * DropERC1155 `balanceOf(address account, uint256 id)` returns the number of
 * copies of `id` held by `account`. We fail-closed on any RPC error (return
 * 0n) so stale DB rows never leak through as owned.
 *
 * Implementation is a raw `eth_call` via the project RPC — no thirdweb
 * client needed for a simple static read.
 */

import { RPC_URL } from '../config/network';

type Erc1155BalanceCacheEntry = { balance: bigint; at: number };
const erc1155BalanceCache = new Map<string, Erc1155BalanceCacheEntry>();
const ERC1155_BALANCE_CACHE_MS = 30_000;

function uint256Hex(n: bigint): string {
    return n.toString(16).padStart(64, '0');
}

async function rpcCall(method: string, params: unknown[]): Promise<any> {
    const resp = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await resp.json();
    if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
    return json.result;
}

/**
 * Read the on-chain ERC-1155 balance of (wallet, tokenId) on a given contract.
 * Returns 0n on any error so the caller fails-closed (treat as "not owned").
 */
export async function readErc1155Balance(
    contract: string,
    wallet: string,
    tokenId: bigint,
): Promise<bigint> {
    const cacheKey = `${contract.toLowerCase()}:${wallet.toLowerCase()}:${tokenId.toString()}`;
    const cached = erc1155BalanceCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ERC1155_BALANCE_CACHE_MS) {
        return cached.balance;
    }

    // balanceOf(address account, uint256 id) selector = 0x00fdd58e
    const walletHex = wallet.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    const tokenHex = uint256Hex(tokenId);
    try {
        const res = await rpcCall('eth_call', [{
            to: contract,
            data: '0x00fdd58e' + walletHex + tokenHex,
        }, 'latest']);
        const bal = BigInt(res || '0x0');
        erc1155BalanceCache.set(cacheKey, { balance: bal, at: Date.now() });
        return bal;
    } catch (err: any) {
        console.warn('[useOnChainNFT] readErc1155Balance failed:', err?.message);
        erc1155BalanceCache.set(cacheKey, { balance: 0n, at: Date.now() });
        return 0n;
    }
}

/** Invalidate the ERC-1155 balance cache (call after buy/sell/transfer). */
export function invalidateErc1155BalanceCache() {
    erc1155BalanceCache.clear();
}

/**
 * Batch version of readErc1155Balance — queries many (wallet, tokenId) pairs
 * against the SAME contract in one `balanceOfBatch` RPC call.
 *
 * ERC-1155 selector `balanceOfBatch(address[],uint256[])` = `0x4e1273f4`.
 * Returns an array of balances aligned 1:1 with the input `tokenIds`.
 *
 * Fails-closed: on any error every entry returns 0n so callers treat the
 * wallet as not-owning and never surface ghost tokens.
 *
 * Why we need this: the chain-first collection view scans the entire universe
 * of releases for a given contract. Issuing N parallel `balanceOf` calls works
 * but wastes RPC budget; one `balanceOfBatch` is constant-cost regardless of N.
 */
export async function readErc1155BalanceBatch(
    contract: string,
    wallet: string,
    tokenIds: bigint[],
): Promise<bigint[]> {
    if (tokenIds.length === 0) return [];

    // Check cache — if EVERY entry is cached fresh, skip the RPC call entirely.
    const cacheKeys = tokenIds.map(
        (id) => `${contract.toLowerCase()}:${wallet.toLowerCase()}:${id.toString()}`,
    );
    const now = Date.now();
    const cachedResults: (bigint | null)[] = cacheKeys.map((k) => {
        const c = erc1155BalanceCache.get(k);
        return c && now - c.at < ERC1155_BALANCE_CACHE_MS ? c.balance : null;
    });
    if (cachedResults.every((v) => v !== null)) {
        return cachedResults as bigint[];
    }

    // balanceOfBatch(address[] accounts, uint256[] ids) selector = 0x4e1273f4
    // ABI encoding:
    //   offset to accounts (0x40), offset to ids, then each array encoded as
    //   [length, element, element, ...]. Two dynamic arrays of equal length N.
    //
    //   [0x00] offsetAccounts = 0x40
    //   [0x20] offsetIds      = 0x40 + 0x20 + N*0x20    (after accounts)
    //   [0x40] accounts.length = N
    //   [0x60] accounts[0..N-1]
    //   [..] ids.length = N
    //   [..] ids[0..N-1]
    const n = BigInt(tokenIds.length);
    const walletHex = wallet.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    const accountsOffset = uint256Hex(0x40n);
    const idsOffset = uint256Hex(0x40n + 0x20n + n * 0x20n);
    const accountsLen = uint256Hex(n);
    const accountsBody = tokenIds.map(() => walletHex).join('');
    const idsLen = uint256Hex(n);
    const idsBody = tokenIds.map((id) => uint256Hex(id)).join('');
    const data = '0x4e1273f4' + accountsOffset + idsOffset + accountsLen + accountsBody + idsLen + idsBody;

    try {
        const res: string = await rpcCall('eth_call', [{ to: contract, data }, 'latest']);
        // Decode: skip 0x, skip offset word (0x20), read length word, then N words.
        const hex = (res || '0x').replace(/^0x/, '');
        if (hex.length < 64 * 2) throw new Error('balanceOfBatch: response too short');
        // word 0 = offset (typically 0x20), word 1 = length, then N words.
        const length = Number(BigInt('0x' + hex.slice(64, 128)));
        const balances: bigint[] = [];
        for (let i = 0; i < length; i++) {
            const start = 128 + i * 64;
            const word = hex.slice(start, start + 64);
            balances.push(BigInt('0x' + word));
        }
        if (balances.length !== tokenIds.length) {
            throw new Error(`balanceOfBatch length mismatch: got ${balances.length}, expected ${tokenIds.length}`);
        }
        // Cache each individually.
        for (let i = 0; i < balances.length; i++) {
            erc1155BalanceCache.set(cacheKeys[i], { balance: balances[i], at: now });
        }
        return balances;
    } catch (err: any) {
        console.warn('[useOnChainNFT] readErc1155BalanceBatch failed:', err?.message);
        // Fail-closed: cache 0 for every requested key so the UI treats them as
        // not-owned instead of surfacing stale DB rows.
        for (const k of cacheKeys) {
            erc1155BalanceCache.set(k, { balance: 0n, at: now });
        }
        return tokenIds.map(() => 0n);
    }
}

// ────────────────────────────────────────────
// On-chain metadata (ERC-1155 uri(tokenId) → IPFS JSON)
// ────────────────────────────────────────────

export interface OnChainNFTMetadata {
    name?: string;
    description?: string;
    /** Resolved HTTPS image URL (ipfs:// → gateway). */
    image?: string;
    /** Resolved HTTPS animation / audio URL. */
    animationUrl?: string;
    /** Original (unresolved) token URI. */
    tokenUri?: string;
    /** Raw JSON for debugging / advanced fields. */
    raw?: Record<string, any>;
}

type MetadataCacheEntry = { metadata: OnChainNFTMetadata; at: number };
const metadataCache = new Map<string, MetadataCacheEntry>();
// Metadata is immutable per tokenId for DropERC1155 (uri is fixed at lazy-mint),
// so we can cache it aggressively. 1 hour is a reasonable balance between
// freshness (if someone re-mints with new metadata in dev) and request volume.
const METADATA_CACHE_MS = 60 * 60 * 1000;

/** Default IPFS gateway used to resolve ipfs:// URIs. */
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

/**
 * Convert `ipfs://<cid>/<path>` to an HTTPS gateway URL.
 * Passes through already-HTTPS URLs unchanged.
 * Returns empty string for empty input.
 */
export function resolveIpfsUrl(uri: string | undefined | null): string {
    if (!uri) return '';
    if (uri.startsWith('ipfs://')) return IPFS_GATEWAY + uri.slice('ipfs://'.length);
    return uri;
}

/**
 * Read `uri(tokenId)` from a DropERC1155 contract and fetch the JSON metadata
 * at that URI (resolving ipfs:// via a public gateway).
 *
 * DropERC1155 `uri(uint256)` selector = `0x0e89341c`. Returns a token URI;
 * thirdweb’s DropERC1155 substitutes `{id}` with the 64-char hex tokenId per
 * the ERC-1155 metadata URI spec when rendered off-chain. We handle that
 * substitution here.
 *
 * Returns `null` on any error so callers can fall back to DB cache or skip.
 */
export async function fetchTokenMetadataFromChain(
    contract: string,
    tokenId: bigint,
): Promise<OnChainNFTMetadata | null> {
    const cacheKey = `${contract.toLowerCase()}:${tokenId.toString()}`;
    const cached = metadataCache.get(cacheKey);
    if (cached && Date.now() - cached.at < METADATA_CACHE_MS) {
        return cached.metadata;
    }

    try {
        // 1) eth_call uri(tokenId)
        const tokenHex = uint256Hex(tokenId);
        const res: string = await rpcCall('eth_call', [{
            to: contract,
            data: '0x0e89341c' + tokenHex,
        }, 'latest']);
        // Decode ABI string: [offset(32)] [length(32)] [bytes...]
        const hex = (res || '0x').replace(/^0x/, '');
        if (hex.length < 64 * 2) throw new Error('uri: response too short');
        const length = Number(BigInt('0x' + hex.slice(64, 128)));
        const strBytes = hex.slice(128, 128 + length * 2);
        let uri = '';
        for (let i = 0; i < strBytes.length; i += 2) {
            uri += String.fromCharCode(parseInt(strBytes.slice(i, i + 2), 16));
        }
        if (!uri) return null;

        // 2) Per ERC-1155, clients substitute {id} with the lowercase 64-char hex tokenId.
        const substituted = uri.replace('{id}', tokenHex);
        const httpUri = resolveIpfsUrl(substituted);

        // 3) Fetch the JSON.
        const resp = await fetch(httpUri);
        if (!resp.ok) throw new Error(`metadata fetch: HTTP ${resp.status}`);
        const json = await resp.json();

        const metadata: OnChainNFTMetadata = {
            name: typeof json?.name === 'string' ? json.name : undefined,
            description: typeof json?.description === 'string' ? json.description : undefined,
            image: resolveIpfsUrl(json?.image) || undefined,
            animationUrl: resolveIpfsUrl(json?.animation_url) || undefined,
            tokenUri: substituted,
            raw: json,
        };
        metadataCache.set(cacheKey, { metadata, at: Date.now() });
        return metadata;
    } catch (err: any) {
        console.warn('[useOnChainNFT] fetchTokenMetadataFromChain failed:', err?.message);
        return null;
    }
}

/** Invalidate the on-chain metadata cache (rarely needed). */
export function invalidateOnChainMetadataCache() {
    metadataCache.clear();
}
