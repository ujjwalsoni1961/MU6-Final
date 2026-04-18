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
