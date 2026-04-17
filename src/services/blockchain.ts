/**
 * MU6 Blockchain Service
 *
 * Handles on-chain operations via Thirdweb SDK v5, wired to:
 *   - DropERC721 "MU6 Songs" (lazy mint + claim)
 *   - MarketplaceV3 (direct listings, offers)
 *   - Split (revenue distribution)
 *
 * Chain: Polygon Amoy testnet (80002) → Polygon mainnet (137) for production.
 */

import { prepareContractCall, prepareTransaction, readContract, sendTransaction, waitForReceipt, getContract } from 'thirdweb';
import type { Account } from 'thirdweb/wallets';
import {
    setClaimConditions as sdkSetClaimConditions,
    getActiveClaimCondition as sdkGetActiveClaimCondition
} from 'thirdweb/extensions/erc721';
import {
    CONTRACTS,
    getSongNFTContract,
    getMarketplaceContract,
    getSplitContract,
    thirdwebClient,
    activeChain,
} from '../lib/thirdweb';
import { supabase } from '../lib/supabase';
import { sendNftMintedEmail, sendNftPurchaseConfirmEmail } from './email';
import { getTokenToEurRate } from './fxRate';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface MintConfig {
    songId: string;
    tierName: string;
    rarity: 'common' | 'rare' | 'legendary';
    totalSupply: number;
    allocatedRoyaltyPercent: number;
    priceEth: number;
    /** IPFS URI for the token metadata (uploaded before calling this) */
    metadataUri: string;
    /** Optional release description */
    description?: string;
    /** Optional custom cover image path (Supabase storage) */
    coverImagePath?: string;
    /** Optional benefits/perks list */
    benefits?: { title: string; description: string }[];
}

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
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * max uint256 – used as "unlimited" maxClaimableSupply.
 * DropERC721 already enforces nextTokenIdToClaim < nextTokenIdToMint,
 * so setting maxClaimable to this value is safe and avoids stale caps
 * that cause the "!Tokens" revert.
 */
const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

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
async function transferToArtistWallet(
    recipientAddress: string,
    amountWei: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const url = `${SUPABASE_URL}/functions/v1/nft-admin`;
        console.log('[blockchain] transferToArtistWallet:', { recipientAddress, amountWei });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
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

/** Read the active claim condition from the DropERC721 contract */
export async function getActiveClaimCondition(): Promise<{
    pricePerToken: bigint;
    currency: string;
    maxClaimableSupply: bigint;
    supplyClaimed: bigint;
    quantityLimitPerWallet: bigint;
}> {
    const conditionId = await readContract({
        contract: getSongNFTContract(),
        method: 'function getActiveClaimConditionId() view returns (uint256)',
        params: [],
    });
    const condition = await readContract({
        contract: getSongNFTContract(),
        method: 'function getClaimConditionById(uint256 _conditionId) view returns ((uint256 startTimestamp, uint256 maxClaimableSupply, uint256 supplyClaimed, uint256 quantityLimitPerWallet, bytes32 merkleRoot, uint256 pricePerToken, address currency, string metadata))',
        params: [conditionId],
    });
    return {
        pricePerToken: condition.pricePerToken,
        currency: condition.currency,
        maxClaimableSupply: condition.maxClaimableSupply,
        supplyClaimed: condition.supplyClaimed,
        quantityLimitPerWallet: condition.quantityLimitPerWallet,
    };
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
// WRITE: NFT Minting (DropERC721)
// ────────────────────────────────────────────

/**
 * Set claim conditions on the DropERC721 so that `claim()` does not revert
 * with "!Tokens".  DropERC721 requires at least one active claim-condition
 * phase before any tokens can be claimed.
 *
 * Uses the Thirdweb SDK v5 high-level `setClaimConditions` extension which
 * handles ABI encoding, price conversion, and currency resolution correctly.
 *
 * NOTE: DropERC721 has ONE global set of claim conditions (not per-token).
 * Every call here replaces the previous conditions (resetClaimEligibility = true).
 *
 * @param account        The admin/minter account that can set claim conditions
 * @param priceEth       Price in ETH/MATIC (human-readable, e.g. 0.01)
 * @param maxClaimable   Maximum number of tokens that can be claimed under this phase
 */
export async function setClaimConditionsForRelease(
    account: Account,
    priceEth: number,
    maxClaimable: bigint,
): Promise<{ success: boolean; error?: string }> {
    try {
        const tx = sdkSetClaimConditions({
            contract: getSongNFTContract(),
            phases: [
                {
                    maxClaimableSupply: maxClaimable,
                    maxClaimablePerWallet: maxClaimable, // no per-wallet limit
                    price: priceEth,
                    currencyAddress: NATIVE_TOKEN,
                    startTime: new Date(0), // active immediately
                },
            ],
            resetClaimEligibility: true,
        });

        const result = await sendTransaction({ account, transaction: tx });
        console.log('[blockchain] setClaimConditions tx:', result.transactionHash);
        return { success: true };
    } catch (err: any) {
        console.error('[blockchain] setClaimConditions error:', err);
        return { success: false, error: err.message };
    }
}

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
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
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
 * Server-side set claim conditions via the Supabase Edge Function `nft-admin`.
 * Sets the price and supply limits for claiming NFTs on the DropERC721 contract.
 * Uses the server wallet so the buyer doesn't need admin permissions.
 */
export async function serverSetClaimConditions(
    priceWei: string,
    contractAddress?: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const url = `${SUPABASE_URL}/functions/v1/nft-admin`;
        console.log('[blockchain] serverSetClaimConditions: calling edge function', { priceWei });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                action: 'setClaimConditions',
                priceWei,
                contractAddress: contractAddress || CONTRACTS.SONG_NFT,
            }),
        });

        const result = await response.json();
        console.log('[blockchain] serverSetClaimConditions response:', JSON.stringify(result));

        if (!response.ok || !result.success) {
            return { success: false, error: result.error || `HTTP ${response.status}` };
        }

        return { success: true };
    } catch (err: any) {
        console.error('[blockchain] serverSetClaimConditions error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Server-mediated NFT claim.
 * The server wallet (which has MINTER_ROLE) calls the contract's claim function
 * on behalf of the buyer. The NFT is minted directly to receiverAddress.
 * The server pays the on-chain claim price from its own balance.
 */
export async function serverClaim(
    receiverAddress: string,
    onChainPriceWei: string,
    contractAddress?: string,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
        const url = `${SUPABASE_URL}/functions/v1/nft-admin`;
        console.log('[blockchain] serverClaim: claiming NFT for', receiverAddress, 'at on-chain price', onChainPriceWei);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                action: 'serverClaim',
                receiverAddress,
                onChainPriceWei,
                contractAddress: contractAddress || CONTRACTS.SONG_NFT,
            }),
        });

        const result = await response.json();
        console.log('[blockchain] serverClaim response:', JSON.stringify(result));

        if (!response.ok || !result.success) {
            return { success: false, error: result.error || `HTTP ${response.status}` };
        }

        return { success: true, txHash: result.txHash };
    } catch (err: any) {
        console.error('[blockchain] serverClaim error:', err);
        return { success: false, error: err.message };
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

// ────────────────────────────────────────────
// HIGH-LEVEL: Combined on-chain + off-chain flows
// ────────────────────────────────────────────

/**
 * Create an NFT release tier for a song.
 * 1. Stores the release in Supabase
 * 2. If account provided, lazy-mints on-chain
 *
 * The DB trigger enforces SUM(allocated_royalty_percent) <= 50 per song.
 */
export async function createNFTRelease(
    config: MintConfig,
    account?: Account,
): Promise<{
    success: boolean;
    releaseId?: string;
    error?: string;
}> {
    try {
        // 1. Create the release record in Supabase
        const { data: release, error: dbError } = await supabase
            .from('nft_releases')
            .insert({
                song_id: config.songId,
                chain_id: '80002',
                contract_address: CONTRACTS.SONG_NFT,
                tier_name: config.tierName,
                rarity: config.rarity,
                total_supply: config.totalSupply,
                allocated_royalty_percent: config.allocatedRoyaltyPercent,
                price_eth: config.priceEth,
                minted_count: 0,
                is_active: true,
                description: config.description || null,
                cover_image_path: config.coverImagePath || null,
                // JSONB columns accept JS arrays/objects directly via supabase-js; double-stringifying
                // previously caused benefits to round-trip as an encoded string and not render.
                benefits: config.benefits && config.benefits.length > 0 ? config.benefits : [],
            })
            .select()
            .single();

        if (dbError) {
            // Pass through listing-limit + tier errors verbatim (set by the
            // enforce_nft_listing_limits trigger in migration 023).
            if (dbError.message?.includes('NFT listing limit reached')
                || dbError.message?.includes('NFT rarity')) {
                return { success: false, error: dbError.message };
            }
            if (dbError.message?.includes('50')) {
                return { success: false, error: 'Total NFT royalty allocation would exceed 50% for this song.' };
            }
            return { success: false, error: dbError.message };
        }

        // 2. Lazy-mint on-chain via server wallet (edge function)
        //    The server wallet has MINTER_ROLE on the contract, so it can
        //    lazy-mint tokens on behalf of any artist.
        if (isContractReady()) {
            const mintResult = await serverLazyMint(
                config.totalSupply,
                config.metadataUri,
            );
            if (!mintResult.success) {
                console.warn('[blockchain] Server lazy mint failed, rolling back DB record:', mintResult.error);
                // Rollback the DB record since the on-chain lazy mint failed
                await supabase.from('nft_releases').delete().eq('id', release.id);
                return { success: false, error: `On-chain lazy mint failed: ${mintResult.error}` };
            } else {
                console.log('[blockchain] Server lazy mint succeeded');
            }

            // 3. Set claim conditions with the correct price via server wallet.
            //    This ensures the buyer is charged when they claim.
            const priceWei = BigInt(Math.floor(config.priceEth * 1e18)).toString();
            const ccResult = await serverSetClaimConditions(priceWei);
            if (!ccResult.success) {
                console.warn('[blockchain] Failed to set claim conditions (non-blocking):', ccResult.error);
                // Don't roll back — the release exists, conditions can be set later
            } else {
                console.log('[blockchain] Claim conditions set with price:', config.priceEth, 'POL');
            }
        }

        return { success: true, releaseId: release.id };
    } catch (err: any) {
        console.error('[blockchain] createNFTRelease error:', err);
        return { success: false, error: err.message };
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

        let onChainTokenId: string | null = onChainSupply !== null ? onChainSupply.toString() : null;
        if (onChainTokenId) console.log('[blockchain] on-chain totalSupply for token ID:', onChainTokenId);

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
                to: '0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39' as `0x${string}`,
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

        // Token ID: use the current minted_count as the next sequential ID.
        // The DB trigger will increment minted_count after this insert.
        const tokenId = `${release.minted_count}`;
        let mintTxHash: string | null = paymentTxHash;

        // ── On-chain minting via server wallet (fire-and-forget) ──
        // After buyer pays, mint an actual on-chain ERC-721 token to their wallet.
        // The server wallet has MINTER_ROLE and pays the on-chain claim price from its balance.
        // This runs in the background so the user gets instant purchase confirmation.
        if (isContractReady() && paidOnChain) {
            // Fetch the current active claim condition price so `serverClaim` sends the EXACT matching value
            sdkGetActiveClaimCondition({
                contract: getContract({
                    client: thirdwebClient,
                    chain: activeChain,
                    address: release.contract_address || CONTRACTS.SONG_NFT
                })
            }).then((condition) => {
                const conditionPriceWei = condition.pricePerToken.toString();
                console.log('[blockchain] Read active condition price:', conditionPriceWei);
                return serverClaim(
                    buyerWallet,
                    conditionPriceWei, // Send EXACT price required by the contract
                    release.contract_address || CONTRACTS.SONG_NFT,
                );
            }).then((claimResult) => {
                if (claimResult.success && claimResult.txHash) {
                    console.log('[blockchain] Background on-chain mint succeeded, tx:', claimResult.txHash);
                    // Update the DB record with the mint tx hash
                    supabase
                        .from('nft_tokens')
                        .update({ mint_tx_hash: claimResult.txHash })
                        .eq('nft_release_id', releaseId)
                        .eq('token_id', tokenId)
                        .then(() => {});
                } else {
                    console.warn('[blockchain] Background on-chain mint failed:', claimResult.error);
                }
            }).catch((mintErr) => {
                console.warn('[blockchain] Background on-chain mint call failed:', mintErr);
            });
        }

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

        // Create token record in Supabase (with token + EUR price snapshots)
        const { data: token, error: tokenErr } = await supabase
            .from('nft_tokens')
            .insert({
                nft_release_id: releaseId,
                token_id: tokenId,
                owner_wallet_address: buyerWallet.toLowerCase(),
                mint_tx_hash: mintTxHash,
                price_paid_eth: pricePaidToken,
                price_paid_token: pricePaidToken,
                price_paid_eur_at_sale: pricePaidEurAtSale,
            })
            .select()
            .maybeSingle();

        if (tokenErr) {
            console.error('[blockchain] nft_tokens insert error:', tokenErr.message);
            // If it's a duplicate, the purchase was already recorded — still treat as success
            if (tokenErr.message?.includes('duplicate') || tokenErr.code === '23505') {
                console.log('[blockchain] Token already exists, treating as success');
            } else {
                return { success: false, error: `Purchase recorded but failed to save: ${tokenErr.message}` };
            }
        }

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
                        void sendNftPurchaseConfirmEmail(
                            buyerEmail,
                            songData2.title,
                            creatorProfile2?.display_name || 'Unknown Artist',
                            tierName,
                            release.royalty_percent?.toString() || '0',
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
            },
            account,
        );
    }

    // Fallback: DB-only listing (no wallet connected)
    try {
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
                to: '0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39' as `0x${string}`,
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
