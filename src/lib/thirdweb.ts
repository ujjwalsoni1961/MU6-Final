import { createThirdwebClient, getContract, defineChain } from 'thirdweb';
import { inAppWallet, createWallet } from 'thirdweb/wallets';
import { CHAIN_ID, CONTRACT_ADDRESSES } from '../config/network';

// ── Client ──
const clientId = process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID!;

export const thirdwebClient = createThirdwebClient({ clientId });

// ── Chain ──
// Sourced from src/config/network.ts (single source of truth).
// Mainnet switch: set EXPO_PUBLIC_NETWORK=mainnet (no code changes here).
export const activeChain = defineChain(CHAIN_ID);

// ── Wallets ──
// In-app wallet: email, Google, Apple (embedded wallet – no extension needed)
export const appWallet = inAppWallet({
    auth: {
        mode: 'popup',
        options: ['email', 'google', 'apple', 'facebook', 'passkey'],
    },
    metadata: {
        name: 'MU6 Wallet',
    },
});

// External wallets for power users
// Note: Coinbase wallet removed — requires @coinbase/wallet-mobile-sdk
// which causes crashes on iOS/Android. Can re-add after installing the native module.
export const supportedWallets = [
    appWallet,
    createWallet('io.metamask'),
    createWallet('io.rabby'),
];

// ── Contract Addresses ──
// Re-exported from src/config/network.ts for backwards compatibility.
// New code should import directly from '../config/network'.
export const CONTRACTS = CONTRACT_ADDRESSES;

// ── Contract instances ──
export function getContractInstance(contractAddress: string) {
    return getContract({
        client: thirdwebClient,
        chain: activeChain,
        address: contractAddress,
    });
}

// Pre-built contract handles (lazy – only created when first accessed)
let _songNFT: ReturnType<typeof getContract> | null = null;
let _marketplace: ReturnType<typeof getContract> | null = null;
let _split: ReturnType<typeof getContract> | null = null;

export function getSongNFTContract() {
    if (!_songNFT) _songNFT = getContractInstance(CONTRACTS.SONG_NFT);
    return _songNFT;
}

export function getMarketplaceContract() {
    if (!_marketplace) _marketplace = getContractInstance(CONTRACTS.MARKETPLACE);
    return _marketplace;
}

export function getSplitContract() {
    if (!_split) _split = getContractInstance(CONTRACTS.SPLIT);
    return _split;
}
