import { createThirdwebClient, getContract, defineChain } from 'thirdweb';
import { inAppWallet } from 'thirdweb/wallets';
import { Platform } from 'react-native';
import { CHAIN_ID, CONTRACT_ADDRESSES } from '../config/network';

// ── Client ──
const clientId = process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID!;

export const thirdwebClient = createThirdwebClient({ clientId });

// ── Chain ──
// Sourced from src/config/network.ts (single source of truth).
// Mainnet switch: set EXPO_PUBLIC_NETWORK=mainnet (no code changes here).
export const activeChain = defineChain(CHAIN_ID);

// ── Wallets ──
// Product decision (2026-04): MU6 supports ONLY the Thirdweb in-app wallet.
//   • Email (OTP) — universal
//   • Google      — universal
//   • Apple       — iOS only (Android users don't have a native Apple sign-in
//                   flow; the web redirect UX is poor, and we want a clean
//                   two-button mobile surface)
// Removed: Facebook, passkey, MetaMask, Rabby (and Coinbase, previously).
// Rationale: fewer auth surfaces → fewer support tickets, less OAuth config drift,
// and the thirdweb in-app wallet already produces a real smart-account per user.

// Decide whether to show Apple:
//   • iOS native app  → always show
//   • Web on Apple device (macOS / iOS / iPadOS browser) → show
//   • Android native / non-Apple web  → hide
function shouldShowApple(): boolean {
    if (Platform.OS === 'ios') return true;
    if (Platform.OS !== 'web') return false;
    if (typeof navigator === 'undefined') return false;
    const ua = (navigator.userAgent || '').toLowerCase();
    const platform = (
        (navigator as any).userAgentData?.platform ||
        (navigator as any).platform ||
        ''
    ).toLowerCase();
    // macOS, iPhone, iPad, iPod — covers both mac Safari/Chrome and iOS/iPadOS browsers
    return (
        /mac|iphone|ipad|ipod/.test(platform) ||
        /iphone|ipad|ipod|macintosh/.test(ua)
    );
}

const inAppAuthOptions: Array<'email' | 'google' | 'apple'> = shouldShowApple()
    ? ['email', 'google', 'apple']
    : ['email', 'google'];

export const appWallet = inAppWallet({
    auth: {
        mode: 'popup',
        options: inAppAuthOptions,
    },
    metadata: {
        name: 'MU6 Wallet',
    },
});

// Only the thirdweb in-app wallet is exposed to users.
// ConnectEmbed and AutoConnect consume this array directly — keeping it as a
// single-element array preserves the existing call sites without changes.
export const supportedWallets = [appWallet];

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
