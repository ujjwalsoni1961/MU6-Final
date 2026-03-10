import { createThirdwebClient, getContract, defineChain } from 'thirdweb';
import { inAppWallet, createWallet } from 'thirdweb/wallets';

// ── Client ──
const clientId = process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID!;

export const thirdwebClient = createThirdwebClient({ clientId });

// ── Chain: Polygon Amoy Testnet (mainnet switch = just change to polygon 137) ──
export const activeChain = defineChain(80002);

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

// ── Contract Addresses (deployed on Polygon Amoy) ──
export const CONTRACTS = {
    // NFT Collection – DropERC721 "MU6 Songs"
    SONG_NFT: process.env.EXPO_PUBLIC_SONG_NFT_ADDRESS || '0xACF1145AdE250D356e1B2869E392e6c748c14C0E',
    // Revenue Split
    SPLIT: process.env.EXPO_PUBLIC_SPLIT_ADDRESS || '0xb757e188B8A126A6D975514F3a05049a87209c2D',
    // MarketplaceV3
    MARKETPLACE: process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS || '0x141Fc79b7F1EB7b393A5DC5f257678c3cD30506a',
} as const;

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
