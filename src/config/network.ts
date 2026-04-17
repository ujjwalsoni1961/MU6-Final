/**
 * MU6 Network Configuration — Single Source of Truth
 * ====================================================
 *
 * All chain/network/contract/explorer values flow through this file.
 * Switching from Polygon Amoy testnet to Polygon mainnet is a ONE-LINE
 * change (set EXPO_PUBLIC_NETWORK=mainnet) plus deploying mainnet
 * contracts and updating their addresses.
 *
 * MAINNET TRANSITION CHECKLIST
 * ----------------------------
 *  1. Deploy DropERC721 + MarketplaceV3 on Polygon mainnet (chain 137).
 *  2. Set the following environment variables:
 *
 *      EXPO_PUBLIC_NETWORK=mainnet
 *      EXPO_PUBLIC_SONG_NFT_ADDRESS=<mainnet DropERC721 address>
 *      EXPO_PUBLIC_MARKETPLACE_ADDRESS=<mainnet Marketplace address>
 *      EXPO_PUBLIC_SPLIT_ADDRESS=<mainnet Split address (optional)>
 *
 *      (Edge functions also need the matching env:
 *       MU6_NETWORK=mainnet
 *       MU6_SONG_NFT_ADDRESS=...
 *       MU6_MARKETPLACE_ADDRESS=...)
 *
 *  3. Re-run `serverSetClaimConditions` on the mainnet drop contract.
 *  4. Re-run `setRoyaltyForSong` for each existing song.
 *  5. That's it — no code changes required. Every helper that needs the
 *     chain id, RPC, explorer URL or contract address reads from here.
 *
 * Why this matters: NFT primary + secondary sales must keep working
 * identically on mainnet. Hardcoding chain ids or explorer URLs in
 * dozens of files is the #1 source of broken-on-mainnet bugs in
 * Web3 apps. Centralising removes that risk.
 */

// ────────────────────────────────────────────
// Network selection
// ────────────────────────────────────────────

export type NetworkName = 'amoy' | 'mainnet';

const RAW_NETWORK = (process.env.EXPO_PUBLIC_NETWORK || 'amoy').toLowerCase();
export const NETWORK: NetworkName = RAW_NETWORK === 'mainnet' ? 'mainnet' : 'amoy';
export const IS_MAINNET = NETWORK === 'mainnet';
export const IS_TESTNET = !IS_MAINNET;

// ────────────────────────────────────────────
// Chain definitions
// ────────────────────────────────────────────

interface ChainConfig {
    id: number;
    name: string;
    /** Native currency symbol shown to users. */
    symbol: string;
    /** Block explorer base URL (no trailing slash). */
    explorer: string;
    /** Public RPC URL fallback (Thirdweb provides higher quality RPC via clientId). */
    rpc: string;
}

const CHAINS: Record<NetworkName, ChainConfig> = {
    amoy: {
        id: 80002,
        name: 'Polygon Amoy',
        symbol: 'POL',
        explorer: 'https://amoy.polygonscan.com',
        rpc: 'https://rpc-amoy.polygon.technology',
    },
    mainnet: {
        id: 137,
        name: 'Polygon',
        symbol: 'POL',
        explorer: 'https://polygonscan.com',
        rpc: 'https://polygon-rpc.com',
    },
};

export const CHAIN: ChainConfig = CHAINS[NETWORK];
export const CHAIN_ID = CHAIN.id;
export const CHAIN_NAME = CHAIN.name;
export const NATIVE_SYMBOL = CHAIN.symbol;
export const EXPLORER_BASE = CHAIN.explorer;
export const RPC_URL = CHAIN.rpc;

// ────────────────────────────────────────────
// Contract addresses
// ────────────────────────────────────────────
//
// Defaults below are the *Amoy testnet* deployments. Set the matching
// EXPO_PUBLIC_*_ADDRESS env vars to override (required for mainnet).

const AMOY_DEFAULTS = {
    SONG_NFT: '0xACF1145AdE250D356e1B2869E392e6c748c14C0E',
    MARKETPLACE: '0x141Fc79b7F1EB7b393A5DC5f257678c3cD30506a',
    SPLIT: '0xb757e188B8A126A6D975514F3a05049a87209c2D',
} as const;

export const CONTRACT_ADDRESSES = {
    SONG_NFT: process.env.EXPO_PUBLIC_SONG_NFT_ADDRESS
        || (IS_MAINNET ? '' : AMOY_DEFAULTS.SONG_NFT),
    MARKETPLACE: process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS
        || (IS_MAINNET ? '' : AMOY_DEFAULTS.MARKETPLACE),
    SPLIT: process.env.EXPO_PUBLIC_SPLIT_ADDRESS
        || (IS_MAINNET ? '' : AMOY_DEFAULTS.SPLIT),
} as const;

// EVM-standard placeholder address for the chain's native token
// (POL on both Amoy and Polygon mainnet). MarketplaceV3 expects this
// sentinel to denote "pay in native currency".
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Server (back-end) wallet that holds MINTER_ROLE on the drop contract
// and acts as platform-fee recipient on the marketplace.
export const SERVER_WALLET = '0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39';

// ────────────────────────────────────────────
// Explorer URL builders
// ────────────────────────────────────────────

export function txUrl(txHash: string): string {
    return `${EXPLORER_BASE}/tx/${txHash}`;
}

export function addressUrl(address: string): string {
    return `${EXPLORER_BASE}/address/${address}`;
}

/**
 * Build an explorer URL for a specific ERC-721 token instance.
 *  - With tokenId: deep-links to the token page (Polygonscan supports `?a=<id>`).
 *  - Without tokenId: links to the contract overview.
 */
export function tokenUrl(contractAddress: string, tokenId?: string | number | bigint): string {
    if (tokenId !== undefined && tokenId !== null && tokenId !== '') {
        return `${EXPLORER_BASE}/token/${contractAddress}?a=${tokenId.toString()}`;
    }
    return `${EXPLORER_BASE}/token/${contractAddress}`;
}

// ────────────────────────────────────────────
// Sanity logging (dev only)
// ────────────────────────────────────────────

if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[network] active network = ${NETWORK} (chain ${CHAIN_ID}, ${CHAIN_NAME})`);
    if (IS_MAINNET && (!CONTRACT_ADDRESSES.SONG_NFT || !CONTRACT_ADDRESSES.MARKETPLACE)) {
        // eslint-disable-next-line no-console
        console.warn('[network] MAINNET MODE but contract addresses are missing — set EXPO_PUBLIC_SONG_NFT_ADDRESS and EXPO_PUBLIC_MARKETPLACE_ADDRESS');
    }
}
