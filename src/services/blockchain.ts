/**
 * MU6 Blockchain Service
 *
 * Handles on-chain operations via Thirdweb SDK v5, wired to:
 *   - DropERC1155 "MU6 Songs" (lazy mint + per-token claim conditions)
 *   - MarketplaceV3 (direct listings, offers)
 *   - Split (revenue distribution)
 *
 * Chain: configured in src/config/network.ts (single source of truth).
 * Mainnet switch is just EXPO_PUBLIC_NETWORK=mainnet — no code changes here.
 */

import { prepareContractCall, prepareTransaction, readContract, sendTransaction, waitForReceipt, getContract } from 'thirdweb';
import type { Account } from 'thirdweb/wallets';
import {
    CONTRACTS,
    getSongNFTContract,
    getMarketplaceContract,
    getSplitContract,
    thirdwebClient,
    activeChain,
} from '../lib/thirdweb';
import { CHAIN_ID, NATIVE_TOKEN_ADDRESS, SERVER_WALLET } from '../config/network';
import { supabase } from '../lib/supabase';
import { sendNftMintedEmail, sendNftPurchaseConfirmEmail } from './email';
import { getTokenToEurRate } from './fxRate';
import { fetchErc1155ClaimState } from '../lib/thirdweb/erc1155';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface ListingConfig {
    nftTokenId: string; // DB UUID of the nft_token row
    onChainTokenId: string; // on-chain token ID
    pricePerToken: string; // price in wei
    sellerWallet: string;
}

export interface BuyConfig {
    listingId: string; // DB UUID
    onChainListingId: bigint; // on-chain listing ID
    buyerWallet: string;
    totalPrice: string; // price in wei
    currency: string; // ERC20 address or 0xEee...EEeE for native
}

// ────────────────────────────────────────────
// Shared constants
// ────────────────────────────────────────────

/** Native token address placeholder used by Thirdweb contracts */
const NATIVE_TOKEN = NATIVE_TOKEN_ADDRESS;

/** Supabase URL for edge function calls */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/** Check if an address is the native token (ETH/MATIC) */
function isNativeToken(addr: string): boolean {
    const lower = addr.toLowerCase();
    return lower === NATIVE_TOKEN.toLowerCase() || lower === '0x0000000000000000000000000000000000000000';
}

/**
 * Transfer native MATIC from the platform server wallet to an artist's wallet.
 * Uses the nft-admin edge function's `transferFunds` action.
 * This is a best-effort call — if it fails, the DB revenue is still recorded.
 */
/**
 * Build headers for calls to the `nft-admin` edge function.
 *
 * The MU6 app uses wallet-based auth (Thirdweb), not Supabase Auth, so there
 * is no user session JWT on the client. The edge function's verifyAuth()
 * accepts either a real user session token (future-proof) or the public anon
 * key (current path). If a Supabase session happens to exist (e.g. from a
 * future auth migration), prefer it; otherwise fall back to the anon key.
 *
 * The real authorization boundary lives inside the edge function via the
 * server-side THIRDWEB_SECRET_KEY — this header only identifies the caller
 * to the Supabase ingress.
 */
async function nftAdminHeaders(): Promise<Record<string, string>> {
    let authToken: string = SUPABASE_ANON_KEY;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
            authToken = session.access_token;
        }
    } catch (_e) {
        // No session available — fall through to anon key.
    }
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
    };
    // SEC-03: if the admin secret is present in the build (admin-web only),
    // forward it so admin-only nft-admin actions (setClaimConditionForToken,
    // transferFunds, deploySplit, deployMarketplace, …) are authorised. The
    // edge function ignores this header for user-callable actions, so it is
    // always safe to include when present.
    const adminSecret = process.env.EXPO_PUBLIC_ADMIN_SECRET || '';
    if (adminSecret) {
        headers['x-mu6-admin-secret'] = adminSecret;
    }
    return headers;
}

async function transferToArtistWallet(
    recipientAddress: string,
    amountWei: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const url = `${SUPABASE_URL}/functions/v1/nft-admin`;
        console.log('[blockchain] transferToArtistWallet:', { recipientAddress, amountWei });

        const response = await fetch(url, {
            method: 'POST',
            headers: await nftAdminHeaders(),
            body: JSON.stringify({
                action: 'transferFunds',
                recipientAddress,
                amountWei,
            }),
        });

        const result = await response.json();
        console.log('[blockchain] transferToArtistWallet response:', JSON.stringify(result));

        if (!response.ok || !result.success) {
            console.warn('[blockchain] Transfer failed (non-blocking):', result.error || `HTTP ${response.status}`);
            return { success: false, error: result.error || `HTTP ${response.status}` };
        }

        return { success: true };
    } catch (err: any) {
        console.warn('[blockchain] Transfer call failed (non-blocking):', err.message);
        return { success: false, error: err.message };
    }
}

// ────────────────────────────────────────────
// Contract status helpers
// ────────────────────────────────────────────

export function isContractReady(): boolean {
    return !!CONTRACTS.SONG_NFT && CONTRACTS.SONG_NFT.startsWith('0x') && CONTRACTS.SONG_NFT.length === 42;
}

export function isMarketplaceReady(): boolean {
    return !!CONTRACTS.MARKETPLACE && CONTRACTS.MARKETPLACE.startsWith('0x') && CONTRACTS.MARKETPLACE.length === 42;
}

// ────────────────────────────────────────────
// READ: On-chain state queries
// ────────────────────────────────────────────

/** Total NFTs lazy-minted so far */
export async function getNextTokenIdToMint(): Promise<bigint> {
    return readContract({
        contract: getSongNFTContract(),
        method: 'function nextTokenIdToMint() view returns (uint256)',
        params: [],
    });
}

/** Total NFTs claimed so far */
export async function getNextTokenIdToClaim(): Promise<bigint> {
    return readContract({
        contract: getSongNFTContract(),
        method: 'function nextTokenIdToClaim() view returns (uint256)',
        params: [],
    });
}

/** Total supply */
export async function getTotalSupply(): Promise<bigint> {
    return readContract({
        contract: getSongNFTContract(),
        method: 'function totalSupply() view returns (uint256)',
        params: [],
    });
}

/** Get token URI */
export async function getTokenURI(tokenId: bigint): Promise<string> {
    return readContract({
        contract: getSongNFTContract(),
        method: 'function tokenURI(uint256 _tokenId) view returns (string)',
        params: [tokenId],
    });
}

/** Get marketplace listing count */
export async function getTotalListings(): Promise<bigint> {
    return readContract({
        contract: getMarketplaceContract(),
        method: 'function totalListings() view returns (uint256)',
        params: [],
    });
}

// ────────────────────────────────────────────
// WRITE: NFT Minting (DropERC1155)
// ────────────────────────────────────────────

/**
 * Step 1: Lazy mint NFTs (creator uploads metadata, we register tokens on-chain).
 * Only the admin/minter role can call this.
 * Returns the batch ID.
 */
export async function lazyMintSongNFT(
    account: Account,
    amount: number,
    baseURI: string,
): Promise<{ success: boolean; batchId?: string; error?: string }> {
    try {
        const tx = prepareContractCall({
            contract: getSongNFTContract(),
            method: 'function lazyMint(uint256 _amount, string _baseURIForTokens, bytes _data) returns (uint256 batchId)',
            params: [BigInt(amount), baseURI, '0x'],
        });
        const result = await sendTransaction({ account, transaction: tx });
        console.log('[blockchain] lazyMint tx:', result.transactionHash);
        return { success: true, batchId: result.transactionHash };
    } catch (err: any) {
        console.error('[blockchain] lazyMint error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Server-side lazy mint via the Supabase Edge Function `nft-admin`.
 * Uses the Thirdweb server wallet (0x76BCC…) which has MINTER_ROLE,
 * so it can lazy-mint on behalf of any artist without them needing
 * admin permissions on the contract.
 */
export async function serverLazyMint(
    amount: number,
    baseURI: string,
    contractAddress?: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const url = `${SUPABASE_URL}/functions/v1/nft-admin`;
        console.log('[blockchain] serverLazyMint: calling edge function', { amount, baseURI });

        const response = await fetch(url, {
            method: 'POST',
            headers: await nftAdminHeaders(),
            body: JSON.stringify({
                action: 'lazyMint',
                amount,
                baseURI,
                contractAddress: contractAddress || CONTRACTS.SONG_NFT,
            }),
        });

        const result = await response.json();
        console.log('[blockchain] serverLazyMint response:', JSON.stringify(result));

        if (!response.ok || !result.success) {
            return { success: false, error: result.error || `HTTP ${response.status}` };
        }

        return { success: true };
    } catch (err: any) {
        console.error('[blockchain] serverLazyMint error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Option B primary-sale forwarding payload returned alongside serverClaim.
 * The edge function atomically forwards the artist's share after claim()
 * confirms; this object reports the ledger state so the client can show a
 * confirmation (“artist paid”) or log a warning (“payout queued for retry”).
 */
export type PrimarySalePayoutResult = {
    status: 'forwarded' | 'forwarding' | 'pending_retry' | 'failed';
    payoutId?: string;
    forwardTxHash?: string;
    artistWei?: string;
    platformWei?: string;
    recipient?: string | null;
    releaseId?: string | null;
    error?: string;
};

/**
 * Server-mediated NFT claim.
 * The server wallet (which holds DEFAULT_ADMIN_ROLE and is the drop's
 * primarySaleRecipient) calls claim() on behalf of the buyer. The NFT is
 * minted directly to receiverAddress. The server receives the POL on-chain
 * and then atomically forwards the artist's share (Option B) before
 * returning. The forwarding result is surfaced in `primarySalePayout` —
 * failures there do NOT fail the mint (NFT is delivered; artist payout
 * queued via pending_retry).
 */
export async function serverClaim(
    receiverAddress: string,
    onChainPriceWei: string,
    contractAddress?: string,
    releaseId?: string,
): Promise<{
    success: boolean;
    txHash?: string;
    onChainTokenId?: string | null;
    pricePaidWei?: string;
    currency?: string;
    primarySalePayout?: PrimarySalePayoutResult | null;
    error?: string;
}> {
    try {
        const url = `${SUPABASE_URL}/functions/v1/nft-admin`;
        console.log('[blockchain] serverClaim: claiming NFT for', receiverAddress, 'at on-chain price', onChainPriceWei);

        const response = await fetch(url, {
            method: 'POST',
            headers: await nftAdminHeaders(),
            body: JSON.stringify({
                action: 'serverClaim',
                receiverAddress,
                onChainPriceWei,
                contractAddress: contractAddress || CONTRACTS.SONG_NFT,
                release_id: releaseId,
            }),
        });

        const result = await response.json();
        console.log('[blockchain] serverClaim response:', JSON.stringify(result));

        if (!response.ok || !result.success) {
            // result.error may be a string (preferred) or an object (from older
            // edge function paths that passed Thirdweb's raw response through).
            // Normalize to a human-readable string so the UI never shows '[object Object]'.
            const rawErr = result?.error ?? result;
            const errMsg = typeof rawErr === 'string'
                ? rawErr
                : (rawErr?.message || rawErr?.error?.message || JSON.stringify(rawErr));
            return { success: false, error: errMsg || `HTTP ${response.status}` };
        }

        return {
            success: true,
            txHash: result.txHash,
            onChainTokenId: result.onChainTokenId ?? null,
            pricePaidWei: result.pricePaidWei,
            currency: result.currency,
            primarySalePayout: (result.primarySalePayout ?? null) as PrimarySalePayoutResult | null,
        };
    } catch (err: any) {
        console.error('[blockchain] serverClaim error:', err);
        return { success: false, error: err?.message || String(err) };
    }
}

/**
 * Step 2: Claim (purchase) an NFT. Buyer calls this to claim from a lazy-minted batch.
 * Respects claim conditions (price, allowlist, supply limits).
 */
export async function claimSongNFT(
    account: Account,
    receiver: string,
    quantity: number,
    currency: string,
    pricePerToken: bigint,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
        // Default allowlist proof (no allowlist for public mint)
        const allowlistProof = {
            proof: [] as `0x${string}`[],
            quantityLimitPerWallet: BigInt(0),
            pricePerToken: BigInt(0),
            currency: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        };

        const tx = prepareContractCall({
            contract: getSongNFTContract(),
            method: 'function claim(address _receiver, uint256 _quantity, address _currency, uint256 _pricePerToken, (bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) _allowlistProof, bytes _data) payable',
            params: [
                receiver as `0x${string}`,
                BigInt(quantity),
                currency as `0x${string}`,
                pricePerToken,
                allowlistProof,
                '0x' as `0x${string}`,
            ],
            value: isNativeToken(currency) ? pricePerToken * BigInt(quantity) : BigInt(0), // only send native token value for ETH/MATIC payments
        });

        const result = await sendTransaction({ account, transaction: tx });
        console.log('[blockchain] claim tx:', result.transactionHash);
        return { success: true, txHash: result.transactionHash };
    } catch (err: any) {
        console.error('[blockchain] claim error:', err);
        return { success: false, error: err.message };
    }
}

// ────────────────────────────────────────────
// WRITE: Marketplace (MarketplaceV3)
// ────────────────────────────────────────────

/**
 * Check if a chain_listing_id is a valid numeric listing ID (not a tx hash).
 * Legacy listings stored a 0x-prefixed 66-char tx hash instead of a numeric ID.
 */
function isValidChainListingId(id: string): boolean {
    if (id.startsWith('0x') && id.length === 66) return false; // tx hash
    return /^\d+$/.test(id); // must be a purely numeric string
}

/**
 * Check if the marketplace is approved to transfer NFTs on behalf of the owner,
 * and approve if not. Required before creating a listing.
 */
export async function ensureMarketplaceApproval(
    account: Account,
): Promise<{ success: boolean; error?: string }> {
    try {
        const owner = account.address as `0x${string}`;
        const operator = CONTRACTS.MARKETPLACE as `0x${string}`;

        // Check current approval status
        const isApproved = await readContract({
            contract: getSongNFTContract(),
            method: 'function isApprovedForAll(address owner, address operator) view returns (bool)',
            params: [owner, operator],
        });

        if (isApproved) {
            console.log('[blockchain] Marketplace already approved for', owner);
            return { success: true };
        }

        // Approve the marketplace to transfer NFTs
        console.log('[blockchain] Approving marketplace for', owner);
        const tx = prepareContractCall({
            contract: getSongNFTContract(),
            method: 'function setApprovalForAll(address operator, bool approved)',
            params: [operator, true],
        });
        await sendTransaction({ account, transaction: tx });
        console.log('[blockchain] Marketplace approval granted');
        return { success: true };
    } catch (err: any) {
        console.error('[blockchain] ensureMarketplaceApproval error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Create a direct listing on the marketplace.
 */
export async function createListing(
    account: Account,
    params: {
        assetContract: string;
        tokenId: bigint;
        quantity: bigint;
        currency: string;
        pricePerToken: bigint;
        startTimestamp: bigint;
        endTimestamp: bigint;
        reserved: boolean;
    },
): Promise<{ success: boolean; listingId?: string; txHash?: string; error?: string }> {
    try {
        // Read totalListings BEFORE creating — MarketplaceV3 uses sequential 0-based IDs,
        // so the next listing will get this ID.
        const nextListingId = await readContract({
            contract: getMarketplaceContract(),
            method: 'function totalListings() view returns (uint256)',
            params: [],
        });

        const listingParams = {
            assetContract: params.assetContract as `0x${string}`,
            tokenId: params.tokenId,
            quantity: params.quantity,
            currency: (params.currency || NATIVE_TOKEN) as `0x${string}`,
            pricePerToken: params.pricePerToken,
            startTimestamp: params.startTimestamp,
            endTimestamp: params.endTimestamp,
            reserved: params.reserved,
        };

        const tx = prepareContractCall({
            contract: getMarketplaceContract(),
            method: 'function createListing((address assetContract, uint256 tokenId, uint256 quantity, address currency, uint256 pricePerToken, uint128 startTimestamp, uint128 endTimestamp, bool reserved) _params) returns (uint256 listingId)',
            params: [listingParams],
        });

        const result = await sendTransaction({ account, transaction: tx });
        console.log('[blockchain] createListing tx:', result.transactionHash, 'listingId:', nextListingId.toString());
        return { success: true, listingId: nextListingId.toString(), txHash: result.transactionHash };
    } catch (err: any) {
        console.error('[blockchain] createListing error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Buy from a direct listing.
 */
export async function buyFromListing(
    account: Account,
    listingId: bigint,
    buyFor: string,
    quantity: bigint,
    currency: string,
    totalPrice: bigint,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
        const tx = prepareContractCall({
            contract: getMarketplaceContract(),
            method: 'function buyFromListing(uint256 _listingId, address _buyFor, uint256 _quantity, address _currency, uint256 _expectedTotalPrice) payable',
            params: [
                listingId,
                buyFor as `0x${string}`,
                quantity,
                currency as `0x${string}`,
                totalPrice,
            ],
            value: currency.toLowerCase() === NATIVE_TOKEN.toLowerCase() ? totalPrice : BigInt(0),
        });

        const result = await sendTransaction({ account, transaction: tx });
        console.log('[blockchain] buyFromListing tx:', result.transactionHash);
        return { success: true, txHash: result.transactionHash };
    } catch (err: any) {
        console.error('[blockchain] buyFromListing error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Cancel a direct listing.
 */
export async function cancelListingOnChain(
    account: Account,
    listingId: bigint,
): Promise<{ success: boolean; error?: string }> {
    try {
        const tx = prepareContractCall({
            contract: getMarketplaceContract(),
            method: 'function cancelListing(uint256 _listingId)',
            params: [listingId],
        });
        await sendTransaction({ account, transaction: tx });
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

// ────────────────────────────────────────────
// WRITE: Split (revenue distribution)
// ────────────────────────────────────────────

/**
 * Distribute accumulated native token (MATIC) to all payees.
 */
export async function distributeSplitNative(
    account: Account,
): Promise<{ success: boolean; error?: string }> {
    try {
        const tx = prepareContractCall({
            contract: getSplitContract(),
            method: 'function distribute()',
            params: [],
        });
        await sendTransaction({ account, transaction: tx });
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Distribute accumulated ERC20 token to all payees.
 */
export async function distributeSplitERC20(
    account: Account,
    tokenAddress: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const tx = prepareContractCall({
            contract: getSplitContract(),
            method: 'function distribute(address token)',
            params: [tokenAddress as `0x${string}`],
        });
        await sendTransaction({ account, transaction: tx });
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}


// ────────────────────────────────────────────────────────────────────────────
// Per-artist contract resolver (Fix 4)
// ────────────────────────────────────────────────────────────────────────────
// Resolves the DropERC1155 contract address for an artist. If
// EXPO_PUBLIC_PER_ARTIST_CONTRACTS=true AND the artist has an active row in
// `artist_nft_contracts` for the current chain, returns that address.
// Otherwise returns the shared fallback contract.
//
// Safe & additive: never throws; on any error returns the fallback so minting
// continues. Logs the decision for audit.
export async function resolveArtistErc1155Contract(
    artistProfileId: string,
    fallbackContract: string,
): Promise<string> {
    const perArtistEnabled =
        (process.env.EXPO_PUBLIC_PER_ARTIST_CONTRACTS || 'false').toLowerCase() === 'true';
    if (!perArtistEnabled) {
        return fallbackContract;
    }
    try {
        const { data, error } = await supabase
            .from('artist_nft_contracts')
            .select('contract_address, is_active')
            .eq('profile_id', artistProfileId)
            .eq('chain_id', CHAIN_ID.toString())
            .maybeSingle();
        if (error) {
            console.warn('[blockchain] resolveArtistErc1155Contract query error:', error);
            return fallbackContract;
        }
        const row = data as any;
        if (row?.contract_address && row.is_active !== false) {
            console.log(
                '[blockchain] resolveArtistErc1155Contract: using per-artist contract',
                row.contract_address,
                'for profile',
                artistProfileId,
            );
            return row.contract_address as string;
        }
    } catch (err) {
        console.warn('[blockchain] resolveArtistErc1155Contract exception:', err);
    }
    return fallbackContract;
}

// ────────────────────────────────────────────────────────────────────────────
// ERC-1155 release creation
// ────────────────────────────────────────────────────────────────────────────

export interface Erc1155MintConfig {
    /** UUID of the song in the DB */
    songId: string;
    /** Tier / release name */
    tierName: string;
    /** Rarity tag */
    rarity: 'common' | 'rare' | 'legendary';
    /** Max claimable supply (0 = unlimited / 1_000_000 default) */
    maxSupply: number;
    /** Price in native token (POL) */
    pricePol: number;
    /** Unix timestamp (seconds) when claim goes live — 0 = now */
    startTime?: number;
    /** IPFS metadata base URI */
    metadataUri: string;
    /** Optional description */
    description?: string;
    /** Optional cover image path in Supabase storage */
    coverImagePath?: string;
    /** Optional benefits/perks */
    benefits?: { title: string; description: string }[];
    /** Artist royalty in bps (from profile) */
    royaltyBps?: number;
    /** Royalty recipient address (from profile) */
    royaltyRecipientWallet?: string | null;
}

/**
 * Read the next token ID to be minted on the shared DropERC1155 contract.
 * This is the token_id that the upcoming lazyMint will assign.
 * Uses eth_call directly so it works without a connected wallet.
 */
async function getErc1155NextTokenIdToMint(contractAddress: string): Promise<bigint> {
    const SUPABASE_URL_LOCAL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const THIRDWEB_CLIENT_ID = process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID || '';
    const chainId = CHAIN_ID;
    const rpcUrl = THIRDWEB_CLIENT_ID
        ? `https://${chainId}.rpc.thirdweb.com/${THIRDWEB_CLIENT_ID}`
        : (chainId === 137 ? 'https://polygon-rpc.com' : 'https://rpc-amoy.polygon.technology');

    // nextTokenIdToMint() → bytes4 selector 0x3b1475a7 (keccak256 of signature,
    // confirmed on DropERC1155). A prior version of this file used 0x5bc5da30
    // which is NOT this function and reverts — causing the fallback '0x0' to
    // mask the real on-chain counter. This resulted in DB rows being inserted
    // with token_id=0 for every release. Fixed: use the correct selector.
    const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'eth_call',
            params: [{ to: contractAddress, data: '0x3b1475a7' }, 'latest'],
        }),
    });
    const json = await resp.json();
    if (json?.error) {
        throw new Error(`nextTokenIdToMint eth_call reverted: ${json.error.message || JSON.stringify(json.error)}`);
    }
    if (!json?.result || json.result === '0x') {
        throw new Error('nextTokenIdToMint eth_call returned empty result');
    }
    return BigInt(json.result);
}

/**
 * Create a new ERC-1155 release on the shared DropERC1155 contract.
 *
 * Steps:
 *  1. Read nextTokenIdToMint (determines the token_id this release will get)
 *  2. Call nft-admin lazyMint (amount=1, baseURI=metadataUri) via server wallet
 *  3. Insert nft_releases row with token_id + contract_address (DropERC1155)
 *  4. Call setClaimConditionForToken with price/supply
 *  5. Call setRoyaltyInfoForToken with artist's bps + recipient
 *
 * Returns releaseId, tokenId on success.
 */
export async function createErc1155Release(
    config: Erc1155MintConfig,
    erc1155ContractAddress: string,
): Promise<{
    success: boolean;
    releaseId?: string;
    tokenId?: string;
    error?: string;
}> {
    // --- Step 1: Read next token ID before lazy-minting ---
    let nextTokenId: bigint;
    try {
        nextTokenId = await getErc1155NextTokenIdToMint(erc1155ContractAddress);
        console.log('[blockchain] ERC-1155 nextTokenIdToMint:', nextTokenId.toString());
    } catch (err: any) {
        console.error('[blockchain] getErc1155NextTokenIdToMint error:', err);
        return { success: false, error: `Could not read on-chain token counter: ${err.message}` };
    }

    const tokenId = nextTokenId.toString();

    // --- Step 2: Lazy mint 1 token on the shared DropERC1155 ---
    const lazyMintResult = await serverLazyMint(1, config.metadataUri, erc1155ContractAddress);
    if (!lazyMintResult.success) {
        return { success: false, error: `Lazy mint failed: ${lazyMintResult.error}` };
    }
    console.log('[blockchain] ERC-1155 lazyMint succeeded for tokenId', tokenId);

    // --- Step 3: Insert DB row ---
    const priceWei = BigInt(Math.round(config.pricePol * 1e18)).toString();
    const maxSupplyVal = config.maxSupply > 0 ? config.maxSupply : 1_000_000;

    const { data: release, error: dbError } = await supabase
        .from('nft_releases')
        .insert({
            song_id: config.songId,
            chain_id: CHAIN_ID.toString(),
            contract_address: erc1155ContractAddress,
            token_id: parseInt(tokenId, 10),
            tier_name: config.tierName,
            rarity: config.rarity,
            total_supply: maxSupplyVal,
            max_supply: maxSupplyVal,
            allocated_royalty_percent: 0,
            price_eth: config.pricePol,
            price_wei: priceWei,
            minted_count: 0,
            is_active: true,
            description: config.description || null,
            cover_image_path: config.coverImagePath || null,
            benefits: config.benefits && config.benefits.length > 0 ? config.benefits : [],
            thirdweb_fee_bps: 200,
        })
        .select()
        .single();

    if (dbError) {
        console.error('[blockchain] createErc1155Release DB insert error:', dbError);
        return { success: false, error: dbError.message };
    }

    const releaseId = release.id;
    console.log('[blockchain] ERC-1155 release row created:', releaseId);

    // --- Step 4: Set claim condition for this token ---
    const claimResult = await callNftAdminAction('setClaimConditionForToken', {
        tokenId,
        pricePerToken: priceWei,
        maxClaimableSupply: maxSupplyVal,
        currency: NATIVE_TOKEN,
        contractAddress: erc1155ContractAddress,
        resetEligibility: true,
    });

    if (!claimResult.success) {
        console.error('[blockchain] setClaimConditionForToken failed:', claimResult.error);
        // Best-effort rollback DB row
        await supabase.from('nft_releases').delete().eq('id', releaseId);
        return {
            success: false,
            error: `setClaimConditionForToken failed: ${claimResult.error}. Release rolled back.`,
        };
    }
    console.log('[blockchain] ERC-1155 setClaimConditionForToken succeeded, tokenId:', tokenId);

    // --- Step 5: Set royalty info for this token (non-blocking, log on error) ---
    if (config.royaltyBps !== undefined && config.royaltyBps >= 0) {
        const { data: profileData } = await supabase
            .from('profiles')
            .select('wallet_address, payout_wallet_address')
            .eq('id', release.creator_id ?? '')
            .maybeSingle();

        const royaltyRecipient =
            config.royaltyRecipientWallet ||
            (profileData as any)?.payout_wallet_address ||
            (profileData as any)?.wallet_address ||
            null;

        if (royaltyRecipient && /^0x[0-9a-fA-F]{40}$/.test(royaltyRecipient)) {
            const royaltyResult = await callNftAdminAction('setRoyaltyInfoForToken', {
                tokenId,
                recipient: royaltyRecipient,
                bps: config.royaltyBps,
                contractAddress: erc1155ContractAddress,
            });
            if (!royaltyResult.success) {
                // Non-blocking — release is live, royalty can be set later via admin
                console.warn('[blockchain] setRoyaltyInfoForToken failed (non-blocking):', royaltyResult.error);
            } else {
                console.log('[blockchain] ERC-1155 setRoyaltyInfoForToken succeeded');
            }
        } else {
            console.warn('[blockchain] No valid royalty recipient, skipping setRoyaltyInfoForToken');
        }
    }

    return { success: true, releaseId, tokenId };
}

/**
 * Generic helper to call any nft-admin edge action and return {success, error}.
 */
async function callNftAdminAction(
    action: string,
    params: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; data?: unknown }> {
    try {
        const url = `${SUPABASE_URL}/functions/v1/nft-admin`;
        const response = await fetch(url, {
            method: 'POST',
            headers: await nftAdminHeaders(),
            body: JSON.stringify({ action, ...params }),
        });
        const result = await response.json();
        if (!response.ok || result.success === false) {
            return { success: false, error: result.error || `HTTP ${response.status}` };
        }
        return { success: true, data: result };
    } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
    }
}

/**
 * Mint (claim) a specific NFT token from a release.
 * 1. Calls claim on-chain
 * 2. Creates nft_tokens record in Supabase
 */
export async function mintToken(
    releaseId: string,
    buyerWallet: string,
    account?: Account,
): Promise<{ success: boolean; tokenId?: string; error?: string }> {
    try {
        // Parallelize: fetch release data + supply check + on-chain totalSupply simultaneously
        const [releaseResult, supplyCheckResult, onChainSupply] = await Promise.all([
            supabase.from('nft_releases').select('*').eq('id', releaseId).maybeSingle(),
            supabase.rpc('check_nft_supply', { p_release_id: releaseId }),
            isContractReady() ? getTotalSupply().catch(() => null) : Promise.resolve(null),
        ]);

        const release = releaseResult.data;
        if (!release) return { success: false, error: 'Release not found' };

        // Supply check — RPC may return a single object or an array
        const { data: supplyData, error: supplyCheckErr } = supplyCheckResult;
        const canMint = Array.isArray(supplyData) ? supplyData[0] : supplyData;
        if (supplyCheckErr || !canMint?.can_mint) {
            if (supplyCheckErr) {
                console.warn('[blockchain] check_nft_supply RPC not available, using fallback:', supplyCheckErr.message);
                if (release.minted_count >= release.total_supply) {
                    return { success: false, error: 'Sold out' };
                }
            } else {
                return { success: false, error: 'Sold out' };
            }
        }

        // NOTE: this is a *predictive* tokenId derived from the pre-mint
        // totalSupply. It is logged for debugging only — the authoritative
        // on-chain tokenId is parsed from the Transfer log after the mint
        // transaction is confirmed (see `onChainTokenId` below).
        const predictedTokenId: string | null = onChainSupply !== null ? onChainSupply.toString() : null;
        if (predictedTokenId) console.log('[blockchain] predicted token ID from totalSupply:', predictedTokenId);

        let paidOnChain = false;
        let confirmedPriceWei: bigint = BigInt(0);
        let paymentTxHash: string | null = null;

        // ── PAYMENT-FIRST PURCHASE FLOW ──
        // Parse price safely (comes as string from Postgres numeric type)
        const pricePol = parseFloat(String(release.price_eth || '0'));
        const releasePriceWei = BigInt(Math.round(pricePol * 1e18));

        if (!account) {
            return {
                success: false,
                error: 'Wallet not connected. Please connect your wallet to purchase this NFT.',
            };
        }

        if (releasePriceWei <= BigInt(0)) {
            return {
                success: false,
                error: 'This NFT has no price set. Contact the artist.',
            };
        }

        // Buyer sends POL to the server wallet as payment
        console.log('[blockchain] Buyer paying', pricePol, 'POL to server wallet. Account:', account.address);
        try {
            const paymentTx = prepareTransaction({
                to: SERVER_WALLET as `0x${string}`,
                chain: activeChain,
                client: thirdwebClient,
                value: releasePriceWei,
            });
            const paymentResult = await sendTransaction({ account, transaction: paymentTx });
            console.log('[blockchain] Payment tx sent:', paymentResult.transactionHash);

            // Wait for on-chain confirmation before proceeding
            // This ensures the payment actually succeeded (wasn't reverted)
            try {
                const receipt = await waitForReceipt({
                    client: thirdwebClient,
                    chain: activeChain,
                    transactionHash: paymentResult.transactionHash,
                });
                if (receipt.status === 'reverted') {
                    return {
                        success: false,
                        error: 'Payment transaction was reverted on-chain. Your wallet was not charged.',
                    };
                }
                console.log('[blockchain] Payment confirmed on-chain, block:', receipt.blockNumber);
            } catch (receiptErr: any) {
                console.warn('[blockchain] Could not confirm receipt, proceeding:', receiptErr.message);
            }

            paidOnChain = true;
            confirmedPriceWei = releasePriceWei;
            paymentTxHash = paymentResult.transactionHash;
        } catch (payErr: any) {
            console.error('[blockchain] Buyer payment failed:', payErr);
            return {
                success: false,
                error: `Payment failed: ${payErr.message}. Your wallet was not charged.`,
            };
        }

        // ─────────────────────────────────────────────────────────────
        // ATOMIC PRIMARY SALE (PDF bug #14 — no more "ghost NFTs")
        // ─────────────────────────────────────────────────────────────
        // Protocol:
        //   1. Payment already confirmed above (paymentTxHash on-chain).
        //   2. Record a `mint_intents` row in state='paid'. This is our
        //      reconciliation anchor — if the process dies between here
        //      and the nft_tokens insert, a background job can retry.
        //   3. Await serverClaim(). The edge function blocks until the
        //      on-chain claim tx is confirmed AND parses the real on-chain
        //      tokenId from the Transfer event log.
        //   4. Only AFTER mint success do we insert nft_tokens (the row
        //      users see as "your NFT"). Before that point, the buyer
        //      owns an unresolved mint_intent — never a ghost token.
        //   5. On failure, mint_intents.status='failed' flags the row for
        //      operator refund. The buyer's POL is still in the server
        //      wallet, so refund is a single transferFunds call.

        // Resolve buyer profile for FK (best-effort — guest purchases allowed)
        const { data: buyerProfileRow } = await supabase
            .from('profiles')
            .select('id')
            .ilike('wallet_address', buyerWallet)
            .maybeSingle();

        // Step 1 of atomicity — record the intent in state 'paid'
        const { data: intentRow, error: intentErr } = await supabase
            .from('mint_intents')
            .insert({
                nft_release_id: releaseId,
                buyer_profile_id: buyerProfileRow?.id || null,
                buyer_wallet: buyerWallet.toLowerCase(),
                status: 'paid',
                price_wei: confirmedPriceWei.toString(),
                price_pol: pricePol,
                payment_tx_hash: paymentTxHash,
            })
            .select('id')
            .maybeSingle();

        if (intentErr) {
            // Log but don't abort — reconciler can't find the intent but payment
            // is still on-chain and recoverable via payment_tx_hash lookup.
            console.warn('[blockchain] mint_intents insert failed (non-blocking):', intentErr.message);
        }
        const intentId = intentRow?.id || null;

        // Step 2 — await on-chain mint (serverClaim blocks until CONFIRMED)
        let mintTxHash: string | null = null;
        let onChainTokenId: string | null = null;

        if (!isContractReady()) {
            // No contract configured — mark intent as failed and surface error.
            if (intentId) {
                await supabase
                    .from('mint_intents')
                    .update({ status: 'failed', error_message: 'NFT contract not configured', failed_at: new Date().toISOString() })
                    .eq('id', intentId);
            }
            return { success: false, error: 'NFT contract not configured. Contact support — your payment will be refunded.' };
        }

        try {
            // Mark as minting
            if (intentId) {
                await supabase.from('mint_intents').update({ status: 'minting' }).eq('id', intentId);
            }

            // Read the active claim-condition price so serverClaim sends the
            // EXACT matching value the contract requires. DropERC1155 stores
            // a per-token claim condition, so we look it up by tokenId.
            const contractAddrForClaim = release.contract_address || CONTRACTS.SONG_NFT;
            const tokenId = release.token_id;
            if (tokenId === null || tokenId === undefined) {
                throw new Error('Release missing token_id — release cannot be claimed');
            }
            const state = await fetchErc1155ClaimState(
                contractAddrForClaim,
                tokenId,
                release.chain_id || CHAIN_ID,
            );
            if (!state.success || !state.condition) {
                throw new Error(
                    state.error || 'Claim condition not found for ERC-1155 token ' + tokenId
                );
            }
            const conditionPriceWei = state.condition.pricePerToken.toString();
            console.log('[blockchain] ERC-1155 condition price for token', tokenId, ':', conditionPriceWei);

            // AWAITED — no more fire-and-forget
            const claimResult = await serverClaim(
                buyerWallet,
                conditionPriceWei,
                release.contract_address || CONTRACTS.SONG_NFT,
                releaseId,
            );

            if (!claimResult.success || !claimResult.txHash) {
                const errMsg = claimResult.error || 'Unknown mint error';
                if (intentId) {
                    await supabase
                        .from('mint_intents')
                        .update({ status: 'failed', error_message: errMsg, failed_at: new Date().toISOString() })
                        .eq('id', intentId);
                }
                // Do NOT create nft_tokens row. Buyer has a recorded intent that
                // operator will refund. Surface a clear error.
                return {
                    success: false,
                    error: `NFT mint failed: ${errMsg}. Your payment is safe and will be refunded shortly.`,
                };
            }

            mintTxHash = claimResult.txHash;
            onChainTokenId = claimResult.onChainTokenId || null;
            console.log('[blockchain] On-chain mint confirmed. txHash:', mintTxHash, 'tokenId:', onChainTokenId);

            // Surface Option B primary-sale forwarding outcome. The edge
            // function forwards atomically; a non-"forwarded" status here
            // means the NFT shipped but the artist payout is queued for the
            // retry sweep (buyer unaffected).
            const payout = claimResult.primarySalePayout;
            if (payout) {
                if (payout.status === 'forwarded') {
                    console.log('[blockchain] Primary-sale payout forwarded to artist:',
                        payout.recipient, 'artistWei:', payout.artistWei, 'tx:', payout.forwardTxHash);
                } else {
                    console.warn('[blockchain] Primary-sale payout not forwarded (status=' +
                        payout.status + '):', payout.error || '(queued for retry)');
                }
            }
        } catch (claimErr: any) {
            console.error('[blockchain] serverClaim threw:', claimErr);
            if (intentId) {
                await supabase
                    .from('mint_intents')
                    .update({
                        status: 'failed',
                        error_message: claimErr?.message || 'serverClaim exception',
                        failed_at: new Date().toISOString(),
                    })
                    .eq('id', intentId);
            }
            return {
                success: false,
                error: `Mint request failed: ${claimErr?.message || 'unknown'}. Your payment is safe and will be refunded shortly.`,
            };
        }

        // Step 3 — on-chain mint succeeded. Insert nft_tokens.
        // Use the REAL on-chain tokenId when available; fall back to
        // minted_count only if the Transfer log parse failed (rare).
        const dbTokenId = onChainTokenId || `${release.minted_count}`;

        // Snapshot the EUR rate at time of sale (best-effort, non-blocking)
        let eurRateAtSale = 0;
        try {
            eurRateAtSale = await getTokenToEurRate();
        } catch (fxErr) {
            console.warn('[blockchain] FX rate unavailable at sale time:', fxErr);
        }
        const pricePaidToken = paidOnChain ? Number(confirmedPriceWei) / 1e18 : null;
        const pricePaidEurAtSale = pricePaidToken != null && eurRateAtSale > 0
            ? pricePaidToken * eurRateAtSale
            : null;

        // The edge function (supabase/functions/nft-admin) already inserts
        // the nft_tokens ledger row for every DropERC1155 claim (self-healing
        // path). Skip the client-side insert to avoid a duplicate-key race;
        // just look up the row the edge function created and continue.
        let token: any = null;
        const tokenErr: any = null;

        {
            const { data: ledgerRow, error: ledgerErr } = await supabase
                .from('nft_tokens')
                .select('*')
                .eq('nft_release_id', releaseId)
                .eq('token_id', dbTokenId)
                .eq('owner_wallet_address', buyerWallet.toLowerCase())
                .maybeSingle();
            if (ledgerErr) {
                console.warn('[blockchain] post-mint ledger lookup failed:', ledgerErr.message);
            }
            token = ledgerRow || null;

            // Backfill price fields if the edge function didn't write them.
            if (token && token.price_paid_eur_at_sale == null && pricePaidEurAtSale != null) {
                await supabase
                    .from('nft_tokens')
                    .update({ price_paid_eur_at_sale: pricePaidEurAtSale })
                    .eq('id', token.id);
            }
        }

        if (tokenErr) {
            console.error('[blockchain] nft_tokens insert error:', tokenErr.message);
            // Duplicate → purchase already recorded (retry / double-submit)
            if (tokenErr.message?.includes('duplicate') || tokenErr.code === '23505') {
                console.log('[blockchain] Token already exists, treating as success');
            } else {
                // On-chain mint succeeded but DB write failed — operator must
                // manually reconcile. Mark intent as confirmed anyway since
                // the NFT is on-chain and the buyer owns it.
                if (intentId) {
                    await supabase.from('mint_intents').update({
                        status: 'confirmed',
                        mint_tx_hash: mintTxHash,
                        on_chain_token_id: onChainTokenId,
                        error_message: `DB insert failed: ${tokenErr.message}`,
                        confirmed_at: new Date().toISOString(),
                    }).eq('id', intentId);
                }
                return {
                    success: false,
                    error: `NFT minted on-chain but failed to save: ${tokenErr.message}. Support will reconcile.`,
                };
            }
        }

        // Step 4 — mark intent as confirmed
        if (intentId) {
            await supabase.from('mint_intents').update({
                status: 'confirmed',
                mint_tx_hash: mintTxHash,
                on_chain_token_id: onChainTokenId,
                nft_token_id: token?.id || null,
                confirmed_at: new Date().toISOString(),
            }).eq('id', intentId);
        }

        // Alias for downstream code that referenced `tokenId` before the refactor
        const tokenId = dbTokenId;

        const tokenRecord = token || (await supabase
            .from('nft_tokens')
            .select('id')
            .eq('nft_release_id', releaseId)
            .eq('token_id', tokenId)
            .maybeSingle()).data;

        // NOTE: minted_count is auto-incremented by the DB trigger `trg_increment_minted`
        // on nft_tokens INSERT. No explicit increment needed here — doing so would
        // double-count. The trigger in 001_initial_schema.sql handles it atomically.

        // ── Distribute Primary Sale Revenue (On-Chain) ──
        // PDF Fix #10 — Split Sheet Revenue rework:
        //   NFT sale revenue is restricted exclusively to the primary creator.
        //   Split-sheet partners (e.g. external producers) only receive streaming
        //   revenue; they are NOT included in on-chain NFT distributions.
        //
        // Distribution:
        //   -  5% platform fee stays in the server wallet
        //   - 95% artist pool → primary creator's wallet (always, regardless of any
        //     split_contract_address that may exist from legacy flows).
        if (paidOnChain && confirmedPriceWei > BigInt(0)) {
            const salePricePol = Number(confirmedPriceWei) / 1e18;
            try {
                const { data: songData } = await supabase
                    .from('songs')
                    .select('id, creator_id')
                    .eq('id', release.song_id)
                    .maybeSingle();

                const artistPoolPol = salePricePol * 0.95;

                if (songData && artistPoolPol > 0) {
                    const artistPoolWei = BigInt(Math.floor(artistPoolPol * 1e18)).toString();

                    const { data: creatorProfile } = await supabase
                        .from('profiles')
                        .select('wallet_address, display_name')
                        .eq('id', songData.creator_id)
                        .maybeSingle();

                    if (creatorProfile?.wallet_address) {
                        console.log('[blockchain] Primary sale (creator-only): sending', artistPoolPol, 'POL to creator', creatorProfile.display_name, creatorProfile.wallet_address);
                        try {
                            await transferToArtistWallet(creatorProfile.wallet_address, artistPoolWei);
                        } catch (err) {
                            console.error('[blockchain] Creator payment failed (non-blocking):', err);
                        }
                    } else {
                        console.warn('[blockchain] Primary sale: creator has no wallet address — funds remain in server wallet for manual reconciliation');
                    }
                    console.log('[blockchain] Primary sale on-chain distribution complete for release:', releaseId);
                }
            } catch (revErr) {
                console.warn('[blockchain] Failed to distribute primary sale revenue (non-blocking):', revErr);
            }
        }

        // ── Fire-and-forget email notifications ──
        try {
            const { data: songData2 } = await supabase
                .from('songs')
                .select('title, creator_id')
                .eq('id', release.song_id)
                .maybeSingle();

            if (songData2) {
                const tierName = release.tier_name || 'Standard';
                const price = release.price_eth?.toString() || '0';
                const newMintedCount = (release.minted_count || 0) + 1;

                // Notify song creator
                const { data: creatorProfile2 } = await supabase
                    .from('profiles')
                    .select('display_name, id')
                    .eq('id', songData2.creator_id)
                    .maybeSingle();

                // Look up creator's email from auth
                const { data: { users: creatorUsers } } = await supabase.auth.admin.listUsers();
                const creatorAuthUser = creatorUsers?.find((u: any) => u.id === songData2.creator_id);
                const creatorEmail = creatorAuthUser?.email;

                if (creatorEmail) {
                    void sendNftMintedEmail(
                        creatorEmail,
                        songData2.title,
                        tierName,
                        price,
                        newMintedCount,
                        release.total_supply || 0,
                    ).catch(() => {});
                }

                // Notify buyer — look up by wallet
                const { data: buyerProfile } = await supabase
                    .from('profiles')
                    .select('id, display_name')
                    .ilike('wallet_address', buyerWallet)
                    .maybeSingle();

                if (buyerProfile) {
                    const buyerAuthUser = creatorUsers?.find((u: any) => u.id === buyerProfile.id);
                    const buyerEmail = buyerAuthUser?.email;
                    if (buyerEmail) {
                        // Royalty-share argument removed — NFT-holder streaming
                        // revenue share is temporarily disabled for first launch.
                        void sendNftPurchaseConfirmEmail(
                            buyerEmail,
                            songData2.title,
                            creatorProfile2?.display_name || 'Unknown Artist',
                            tierName,
                        ).catch(() => {});
                    }
                }
            }
        } catch (emailErr) {
            console.warn('[blockchain] Email notification failed (non-blocking):', emailErr);
        }

        return { success: true, tokenId: tokenRecord?.id || tokenId };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * List an NFT for sale on the marketplace.
 * Delegates to the on-chain marketplace service (MarketplaceV3).
 * If no wallet account is available, falls back to DB-only listing for backward compatibility.
 */
export async function listForSale(
    config: {
        nftTokenId: string;
        priceEth: number;
        sellerWallet: string;
        /**
         * Chain-first fallback: when the DB `nft_tokens` UUID is missing
         * (user discovered their copy on-chain but no ledger row was ever
         * written — or the one we knew about just got reshuffled), the
         * listing flow resolves by this (contract, tokenId) pair and
         * self-heals the ledger.
         */
        contractAddress?: string;
        onChainTokenId?: string;
    },
    account?: Account,
): Promise<{ success: boolean; listingId?: string; error?: string }> {
    // On-chain listing via MarketplaceV3 when account is available
    if (account && isMarketplaceReady()) {
        const { createMarketplaceListing } = await import('./marketplace');
        return createMarketplaceListing(
            {
                nftTokenId: config.nftTokenId,
                pricePol: config.priceEth,
                sellerWallet: config.sellerWallet,
                contractAddress: config.contractAddress,
                onChainTokenId: config.onChainTokenId,
            },
            account,
        );
    }

    // Fallback: DB-only listing (no wallet connected)
    try {
        // Guard: without a wallet we can't create on-chain listings, and
        // without a valid UUID Postgres throws 22P02. Surface a clean error
        // instead of an opaque DB message.
        if (!config.nftTokenId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.nftTokenId)) {
            return { success: false, error: 'Connect your wallet to list this NFT for sale.' };
        }

        const { data: token } = await supabase
            .from('nft_tokens')
            .select('id, owner_wallet_address, token_id')
            .eq('id', config.nftTokenId)
            .maybeSingle();

        if (!token) return { success: false, error: 'Token not found' };
        if (token.owner_wallet_address.toLowerCase() !== config.sellerWallet.toLowerCase()) {
            return { success: false, error: 'Not the token owner' };
        }

        const { data: existingListing } = await supabase
            .from('marketplace_listings')
            .select('id')
            .eq('nft_token_id', config.nftTokenId)
            .eq('is_active', true)
            .maybeSingle();

        if (existingListing) {
            return { success: false, error: 'This NFT already has an active listing.' };
        }

        let eurRate = 0;
        try { eurRate = await getTokenToEurRate(); } catch { /* non-blocking */ }

        const { data: listing, error } = await supabase
            .from('marketplace_listings')
            .insert({
                nft_token_id: config.nftTokenId,
                seller_wallet: config.sellerWallet.toLowerCase(),
                price_eth: config.priceEth,
                price_token: config.priceEth,
                price_eur_at_list: eurRate > 0 ? config.priceEth * eurRate : null,
                is_active: true,
                chain_listing_id: null,
            })
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        return { success: true, listingId: listing.id };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Buy an NFT from a marketplace listing (secondary sale).
 *
 * On-chain flow via MarketplaceV3:
 *   - MarketplaceV3 handles payment distribution:
 *     90% to seller, 5% platform fee, 5% artist royalty (EIP-2981)
 *   - NO royalty_events/royalty_shares created for NFT sales
 *     (the Split contract handles artist royalties on-chain)
 *
 * Falls back to payment-first server-mediated flow for legacy DB-only listings.
 */
export async function buyListingFlow(
    config: { listingId: string; buyerWallet: string },
    account?: Account,
): Promise<{ success: boolean; error?: string }> {
    if (!account) {
        return { success: false, error: 'Wallet not connected. Please connect your wallet to purchase.' };
    }

    try {
        // Check if listing has an on-chain ID → use on-chain marketplace flow
        const { data: listing } = await supabase
            .from('marketplace_listings')
            .select('chain_listing_id, price_token, price_eth')
            .eq('id', config.listingId)
            .eq('is_active', true)
            .maybeSingle();

        if (!listing) return { success: false, error: 'Listing not found or inactive' };

        // On-chain flow: listing has a valid chain_listing_id
        if (listing.chain_listing_id && /^\d+$/.test(listing.chain_listing_id)) {
            const { buyMarketplaceListing } = await import('./marketplace');
            return buyMarketplaceListing(config, account);
        }

        // Legacy fallback: DB-only listing (no on-chain listing)
        // Buyer pays server wallet, server distributes to seller
        const salePricePol = parseFloat(listing.price_token || listing.price_eth);
        const priceWei = BigInt(Math.floor(salePricePol * 1e18));

        let saleTxHash: string | null = null;
        if (priceWei > BigInt(0)) {
            console.log('[blockchain] Secondary sale (legacy): buyer paying', salePricePol, 'POL to server wallet');
            const paymentTx = prepareTransaction({
                to: SERVER_WALLET as `0x${string}`,
                chain: activeChain,
                client: thirdwebClient,
                value: priceWei,
            });
            const paymentResult = await sendTransaction({ account, transaction: paymentTx });
            saleTxHash = paymentResult.transactionHash;
        }

        // Snapshot EUR rate
        let eurRate = 0;
        try { eurRate = await getTokenToEurRate(); } catch { /* non-blocking */ }
        const salePriceEur = eurRate > 0 ? salePricePol * eurRate : null;

        const now = new Date().toISOString();

        // Mark listing as sold
        await supabase
            .from('marketplace_listings')
            .update({
                is_active: false,
                sold_at: now,
                buyer_wallet: config.buyerWallet.toLowerCase(),
            })
            .eq('id', config.listingId);

        // Transfer token ownership in DB
        await supabase
            .from('nft_tokens')
            .update({
                owner_wallet_address: config.buyerWallet.toLowerCase(),
                last_transferred_at: now,
                last_sale_price_token: salePricePol,
                last_sale_price_eur: salePriceEur,
                last_sale_tx_hash: saleTxHash,
            })
            .eq('id', (await supabase
                .from('marketplace_listings')
                .select('nft_token_id')
                .eq('id', config.listingId)
                .maybeSingle()).data?.nft_token_id);

        // Transfer 90% to seller via server wallet (legacy flow)
        const sellerAmountPol = salePricePol * 0.90;
        if (sellerAmountPol > 0) {
            const { data: listingFull } = await supabase
                .from('marketplace_listings')
                .select('seller_wallet')
                .eq('id', config.listingId)
                .maybeSingle();

            if (listingFull?.seller_wallet) {
                const sellerAmountWei = BigInt(Math.floor(sellerAmountPol * 1e18)).toString();
                transferToArtistWallet(listingFull.seller_wallet, sellerAmountWei).catch(() => {});
            }
        }

        // NOTE: No royalty_events/royalty_shares for secondary sales.
        // Artist royalties are handled on-chain via EIP-2981 + Split contract.

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Cancel a marketplace listing.
 * Delegates to on-chain marketplace service when account is available.
 */
export async function cancelListingFlow(
    listingId: string,
    sellerWallet: string,
    account?: Account,
): Promise<{ success: boolean; error?: string }> {
    // On-chain cancel via MarketplaceV3
    if (account && isMarketplaceReady()) {
        const { cancelMarketplaceListing } = await import('./marketplace');
        return cancelMarketplaceListing(listingId, sellerWallet, account);
    }

    // Fallback: DB-only cancel
    const { data: listing } = await supabase
        .from('marketplace_listings')
        .select('chain_listing_id')
        .eq('id', listingId)
        .eq('seller_wallet', sellerWallet.toLowerCase())
        .eq('is_active', true)
        .maybeSingle();

    if (!listing) return { success: false, error: 'Listing not found' };

    const { error } = await supabase
        .from('marketplace_listings')
        .update({ is_active: false })
        .eq('id', listingId);

    if (error) return { success: false, error: error.message };
    return { success: true };
}

/**
 * Update a direct listing price on-chain.
 * MarketplaceV3 doesn't support price-only updates, so we cancel + recreate.
 */
export async function updateListingOnChain(
    account: Account,
    oldChainListingId: bigint,
    tokenId: bigint,
    newPricePerToken: bigint,
): Promise<{ success: boolean; newListingId?: string; txHash?: string; error?: string }> {
    try {
        // Cancel the old listing
        const cancelResult = await cancelListingOnChain(account, oldChainListingId);
        if (!cancelResult.success) {
            return { success: false, error: `Failed to cancel old listing: ${cancelResult.error}` };
        }

        // Create new listing with updated price
        const now = BigInt(Math.floor(Date.now() / 1000));
        const oneYear = now + BigInt(365 * 24 * 60 * 60);

        const result = await createListing(account, {
            assetContract: CONTRACTS.SONG_NFT,
            tokenId,
            quantity: BigInt(1),
            currency: NATIVE_TOKEN,
            pricePerToken: newPricePerToken,
            startTimestamp: now,
            endTimestamp: oneYear,
            reserved: false,
        });

        if (!result.success) {
            return { success: false, error: `Failed to create updated listing: ${result.error}` };
        }
        return { success: true, newListingId: result.listingId, txHash: result.txHash };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Update listing price: on-chain cancel+recreate + DB update.
 */
export async function updateListingFlow(
    config: {
        listingId: string;
        newPriceEth: number;
        sellerWallet: string;
        chainListingId?: string;
        onChainTokenId?: string;
    },
    account?: Account,
): Promise<{ success: boolean; newChainListingId?: string; error?: string }> {
    try {
        let newChainListingId: string | undefined;

        // On-chain update if we have chain listing info
        if (account && config.chainListingId && config.onChainTokenId && isMarketplaceReady()) {
            if (!isValidChainListingId(config.chainListingId)) {
                console.warn('[blockchain] updateListingFlow: chain_listing_id is a legacy tx hash, skipping on-chain update:', config.chainListingId);
            } else {
                const priceWei = BigInt(Math.floor(config.newPriceEth * 1e18));
                const result = await updateListingOnChain(
                    account,
                    BigInt(config.chainListingId),
                    BigInt(config.onChainTokenId),
                    priceWei,
                );
                if (!result.success) {
                    return { success: false, error: result.error };
                }
                newChainListingId = result.newListingId;
            }
        }

        // DB update — also update chain_listing_id if a new one was created
        const updatePayload: Record<string, any> = { price_eth: config.newPriceEth };
        if (newChainListingId) {
            updatePayload.chain_listing_id = newChainListingId;
        }

        const { error } = await supabase
            .from('marketplace_listings')
            .update(updatePayload)
            .eq('id', config.listingId)
            .eq('seller_wallet', config.sellerWallet.toLowerCase())
            .eq('is_active', true);

        if (error) return { success: false, error: error.message };
        return { success: true, newChainListingId };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
