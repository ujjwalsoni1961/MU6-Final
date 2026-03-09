import { createThirdwebClient, getContract, defineChain } from 'thirdweb';
import { inAppWallet, createWallet } from 'thirdweb/wallets';

// ── Client ──
const clientId = process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID!;

export const thirdwebClient = createThirdwebClient({ clientId });

// ── Chain: Base Sepolia ──
export const baseSepolia = defineChain(84532);

// ── Wallets ──
// In-app wallet: email, Google, Apple (embedded wallet – no extension needed)
export const appWallet = inAppWallet({
    auth: { mode: 'popup' },
    metadata: {
        name: 'MU6 Wallet',
    },
});

// External wallets for power users
export const supportedWallets = [
    appWallet,
    createWallet('io.metamask'),
    createWallet('com.coinbase.wallet'),
    createWallet('io.rabby'),
];

// ── Contract helpers ──
// No contracts deployed yet; these helpers will be used once deployed.
export function getContractInstance(contractAddress: string) {
    return getContract({
        client: thirdwebClient,
        chain: baseSepolia,
        address: contractAddress,
    });
}

// Contract addresses – will be populated after deployment
export const CONTRACTS = {
    // NFT Collection (ERC-1155 for multi-tier song NFTs)
    SONG_NFT: process.env.EXPO_PUBLIC_SONG_NFT_ADDRESS || '',
    // Marketplace
    MARKETPLACE: process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS || '',
} as const;
