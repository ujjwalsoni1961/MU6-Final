/**
 * ERC-1155 claim state reader
 *
 * Reads on-chain claim condition data for a DropERC1155 token directly
 * via Thirdweb RPC (eth_call). This keeps the client in sync with on-chain
 * state without relying on the DB price column (on-chain is source of truth).
 *
 * Usage:
 *   const state = await fetchErc1155ClaimState(contractAddress, tokenId, chainId);
 *   // state.price, state.startTime, state.maxClaimableSupply, etc.
 */

import { CHAIN_ID } from '../../config/network';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Erc1155ClaimCondition {
    /** Condition index on-chain (from getActiveClaimConditionId) */
    conditionId: number;
    /** Unix timestamp (seconds) when this condition becomes active */
    startTime: number;
    /** Maximum total claimable supply (0 = not set / unlimited indicator) */
    maxClaimableSupply: bigint;
    /** Number of tokens claimed so far under this condition */
    supplyClaimed: bigint;
    /** Remaining supply (maxClaimableSupply - supplyClaimed); null if unlimited */
    supplyRemaining: bigint | null;
    /** Price per token in wei */
    pricePerToken: bigint;
    /** ERC-20 currency address (0xEeee...EEeE = native POL) */
    currency: string;
    /** Whether the condition is currently active (startTime <= now) */
    isActive: boolean;
}

export interface Erc1155ClaimStateResult {
    success: boolean;
    condition: Erc1155ClaimCondition | null;
    holderBalance: bigint | null;
    error?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

// Native token sentinel (thirdweb / EVM standard)
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Max uint256 — used by thirdweb to indicate "unlimited supply"
const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

// RPC URL — uses Thirdweb's high-quality endpoint with the client ID
const THIRDWEB_CLIENT_ID = process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID || '';
function getRpcUrl(chainId: number): string {
    if (THIRDWEB_CLIENT_ID) {
        return `https://${chainId}.rpc.thirdweb.com/${THIRDWEB_CLIENT_ID}`;
    }
    // Fallback: public Polygon Amoy RPC
    return chainId === 137
        ? 'https://polygon-rpc.com'
        : 'https://rpc-amoy.polygon.technology';
}

// ── Encoding helpers ───────────────────────────────────────────────────────

function toHex32(value: bigint | number): string {
    return value.toString(16).padStart(64, '0');
}

function encodeUint256(value: bigint | number): string {
    return toHex32(BigInt(value));
}

async function ethCall(
    rpcUrl: string,
    contractAddress: string,
    calldata: string,
): Promise<string> {
    const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [{ to: contractAddress, data: calldata }, 'latest'],
        }),
    });
    const json = await resp.json();
    if (json.error) throw new Error(`eth_call error: ${JSON.stringify(json.error)}`);
    return (json.result as string) || '0x';
}

// ── Function selectors ─────────────────────────────────────────────────────
// getActiveClaimConditionId(uint256 tokenId)  → bytes4: 0x2eb5cdb3 (DropERC1155)
const SEL_GET_ACTIVE_CONDITION_ID = '0x2eb5cdb3';
// getClaimConditionById(uint256 tokenId, uint256 conditionId) → bytes4: 0xa07bddf0
const SEL_GET_CLAIM_CONDITION_BY_ID = '0xa07bddf0';
// balanceOf(address account, uint256 id) → bytes4: 0x00fdd58e (ERC-1155)
const SEL_BALANCE_OF = '0x00fdd58e';

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Fetch the active claim condition for a specific ERC-1155 token on a
 * DropERC1155 contract. Optionally also fetches the holder's token balance.
 *
 * @param contractAddress  - DropERC1155 contract address (checksummed or lower)
 * @param tokenId          - On-chain token ID (number or bigint)
 * @param chainId          - Chain ID (defaults to EXPO_PUBLIC_NETWORK chain)
 * @param holderAddress    - Optional: wallet address to check balance for
 */
export async function fetchErc1155ClaimState(
    contractAddress: string,
    tokenId: number | bigint,
    chainId: number = CHAIN_ID,
    holderAddress?: string,
): Promise<Erc1155ClaimStateResult> {
    try {
        const rpcUrl = getRpcUrl(chainId);
        const tokenIdEncoded = encodeUint256(BigInt(tokenId));

        // Step 1: getActiveClaimConditionId(tokenId)
        const conditionIdHex = await ethCall(
            rpcUrl,
            contractAddress,
            SEL_GET_ACTIVE_CONDITION_ID + tokenIdEncoded,
        );
        const conditionId = parseInt(conditionIdHex, 16);

        // Step 2: getClaimConditionById(tokenId, conditionId)
        const conditionCalldata =
            SEL_GET_CLAIM_CONDITION_BY_ID +
            tokenIdEncoded +
            encodeUint256(conditionId);
        const conditionHex = await ethCall(rpcUrl, contractAddress, conditionCalldata);

        // Decode ClaimCondition struct (8 × 32-byte slots):
        // slot 0: startTimestamp (uint256)
        // slot 1: maxClaimableSupply (uint256)
        // slot 2: supplyClaimed (uint256)
        // slot 3: quantityLimitPerWallet (uint256)
        // slot 4: merkleRoot (bytes32)
        // slot 5: pricePerToken (uint256)
        // slot 6: currency (address — right-padded to 32 bytes, use last 20)
        // slot 7: metadata (string — ABI-encoded dynamic, ignore)
        const raw = conditionHex.replace(/^0x/, '');
        if (raw.length < 8 * 64) {
            return { success: false, condition: null, holderBalance: null, error: 'Unexpected response length from getClaimConditionById' };
        }

        const slot = (i: number) => raw.slice(i * 64, (i + 1) * 64);
        const startTime = parseInt(slot(0), 16);
        const maxClaimableSupply = BigInt('0x' + slot(1));
        const supplyClaimed = BigInt('0x' + slot(2));
        const pricePerToken = BigInt('0x' + slot(5));
        // Address is right-aligned in 32 bytes: take last 40 hex chars
        const currency = '0x' + slot(6).slice(24);

        const isUnlimited = maxClaimableSupply === MAX_UINT256;
        const supplyRemaining = isUnlimited
            ? null
            : maxClaimableSupply - supplyClaimed;

        const now = Math.floor(Date.now() / 1000);
        const isActive = startTime <= now;

        const condition: Erc1155ClaimCondition = {
            conditionId,
            startTime,
            maxClaimableSupply,
            supplyClaimed,
            supplyRemaining,
            pricePerToken,
            currency: currency.toLowerCase() === NATIVE_TOKEN.toLowerCase() ? NATIVE_TOKEN : currency,
            isActive,
        };

        // Step 3 (optional): balanceOf(holderAddress, tokenId)
        let holderBalance: bigint | null = null;
        if (holderAddress && /^0x[0-9a-fA-F]{40}$/.test(holderAddress)) {
            const balanceCalldata =
                SEL_BALANCE_OF +
                holderAddress.replace(/^0x/, '').padStart(64, '0') +
                tokenIdEncoded;
            const balanceHex = await ethCall(rpcUrl, contractAddress, balanceCalldata);
            holderBalance = BigInt(balanceHex);
        }

        return { success: true, condition, holderBalance };
    } catch (err: any) {
        console.warn('[erc1155] fetchErc1155ClaimState error:', err?.message || err);
        return {
            success: false,
            condition: null,
            holderBalance: null,
            error: err?.message || 'Unknown error',
        };
    }
}

/**
 * Format a wei price as a human-readable POL amount string.
 * e.g. 1000000000000000000n → "1.0"
 */
export function formatWeiAsPol(wei: bigint): string {
    const ethValue = Number(wei) / 1e18;
    if (ethValue === 0) return '0';
    if (ethValue < 0.001) return ethValue.toFixed(6);
    if (ethValue < 1) return ethValue.toFixed(4);
    return ethValue.toFixed(3);
}
