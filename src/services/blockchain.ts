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

import { prepareContractCall, prepareTransaction, readContract, sendTransaction } from 'thirdweb';
import type { Account } from 'thirdweb/wallets';
import {
    setClaimConditions as sdkSetClaimConditions,
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
            })
            .select()
            .single();

        if (dbError) {
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
        const { data: release } = await supabase
            .from('nft_releases')
            .select('*')
            .eq('id', releaseId)
            .maybeSingle();

        if (!release) return { success: false, error: 'Release not found' };
        if (release.minted_count >= release.total_supply) {
            return { success: false, error: 'Sold out' };
        }

        // The on-chain token ID is determined by totalSupply() BEFORE claiming.
        // DropERC721 uses 0-based sequential IDs: first claimed = 0, second = 1, etc.
        // We read it before claim so we know exactly which token ID was assigned.
        let onChainTokenId: string | null = null;
        let paidOnChain = false;           // Only true if buyer actually paid
        let confirmedPriceWei: bigint = BigInt(0);
        let paymentTxHash: string | null = null;

        // ── PAYMENT-FIRST PURCHASE FLOW ──
        // The on-chain `claim` function requires admin-set claim conditions which
        // we cannot modify (server wallet lacks DEFAULT_ADMIN_ROLE). Instead:
        // 1. Buyer sends the NFT price (from DB) directly to the server wallet
        // 2. NFT ownership is recorded in the database
        // 3. Server wallet transfers the artist's share to their wallet
        // On-chain NFT claiming can be re-enabled once admin access is restored.
        const releasePriceWei = BigInt(Math.floor((release.price_eth || 0) * 1e18));

        if (releasePriceWei > BigInt(0) && !account) {
            return {
                success: false,
                error: 'Wallet not connected. Please connect your wallet to purchase this NFT.',
            };
        }

        // Read on-chain totalSupply for token ID assignment (read-only, always works)
        if (isContractReady()) {
            try {
                const supply = await getTotalSupply();
                onChainTokenId = supply.toString();
                console.log('[blockchain] on-chain totalSupply for token ID:', onChainTokenId);
            } catch (supplyErr) {
                console.warn('[blockchain] Could not read totalSupply:', supplyErr);
            }
        }

        // Buyer sends POL to the server wallet as payment
        if (account && releasePriceWei > BigInt(0)) {
            console.log('[blockchain] Buyer paying', release.price_eth, 'POL to server wallet');
            try {
                const paymentTx = prepareTransaction({
                    to: '0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39' as `0x${string}`,
                    chain: activeChain,
                    client: thirdwebClient,
                    value: releasePriceWei,
                });
                const paymentResult = await sendTransaction({ account, transaction: paymentTx });
                console.log('[blockchain] Buyer payment confirmed, tx:', paymentResult.transactionHash);
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
        }

        // ── On-chain minting via server wallet ──
        // After buyer pays, mint an actual on-chain ERC-721 token to their wallet.
        // The server wallet has MINTER_ROLE and pays the on-chain claim price from its balance.
        // This is best-effort: if it fails, DB record still gets created.
        let mintTxHash: string | null = paymentTxHash;
        if (isContractReady() && paidOnChain) {
            try {
                console.log('[blockchain] Minting on-chain token to', buyerWallet);
                const claimResult = await serverClaim(
                    buyerWallet,
                    '0', // on-chain price = 0 since buyer already paid the server wallet
                    release.contract_address || CONTRACTS.SONG_NFT,
                );
                if (claimResult.success && claimResult.txHash) {
                    mintTxHash = claimResult.txHash;
                    console.log('[blockchain] On-chain mint succeeded, tx:', mintTxHash);
                    // Re-read totalSupply to get the actual minted token ID
                    try {
                        const newSupply = await getTotalSupply();
                        onChainTokenId = (newSupply - BigInt(1)).toString();
                        console.log('[blockchain] On-chain token ID after mint:', onChainTokenId);
                    } catch {}
                } else {
                    console.warn('[blockchain] On-chain mint failed (non-blocking):', claimResult.error);
                }
            } catch (mintErr) {
                console.warn('[blockchain] On-chain mint call failed (non-blocking):', mintErr);
            }
        }

        // Use on-chain token ID if available, otherwise fall back to minted_count (0-based)
        const tokenId = onChainTokenId || `${release.minted_count}`;

        // Create token record in Supabase (idempotent: ON CONFLICT DO NOTHING)
        // If a previous attempt already created the row (e.g. on-chain succeeded,
        // app crashed before DB write confirmation), we skip the duplicate.
        const { data: token, error: tokenErr } = await supabase
            .from('nft_tokens')
            .upsert(
                {
                    nft_release_id: releaseId,
                    token_id: tokenId,
                    owner_wallet_address: buyerWallet.toLowerCase(),
                    mint_tx_hash: mintTxHash,
                    price_paid_eth: paidOnChain ? Number(confirmedPriceWei) / 1e18 : null,
                },
                { onConflict: 'nft_release_id,token_id', ignoreDuplicates: true },
            )
            .select()
            .single();

        if (tokenErr && !tokenErr.message?.includes('duplicate')) {
            return { success: false, error: tokenErr.message };
        }

        // If upsert skipped (duplicate), fetch the existing token
        const tokenRecord = token || (await supabase
            .from('nft_tokens')
            .select('id')
            .eq('nft_release_id', releaseId)
            .eq('token_id', tokenId)
            .maybeSingle()).data;

        // Increment minted_count on the release so supply tracking is accurate
        const { error: countError } = await supabase.rpc('increment_minted_count', { release_id: releaseId }).maybeSingle();
        if (countError) {
            // Fallback: direct update if RPC not available
            await supabase
                .from('nft_releases')
                .update({ minted_count: release.minted_count + 1 })
                .eq('id', releaseId);
        }

        // ── Record Primary Sale Revenue ──
        // ONLY record revenue when the buyer was ACTUALLY debited on-chain.
        // confirmedPriceWei is set above only after a successful claim with a non-zero price.
        if (paidOnChain && confirmedPriceWei > BigInt(0)) {
            const salePriceEth = Number(confirmedPriceWei) / 1e18;
            try {
                // Look up the song's creator and their wallet
                const { data: songData } = await supabase
                    .from('songs')
                    .select('id, creator_id')
                    .eq('id', release.song_id)
                    .maybeSingle();

                const creatorId = songData?.creator_id;
                const sourceRef = `primary_sale:${releaseId}:${tokenId}`;
                // Primary sale split: 5% platform fee (server keeps), 95% distributed per split sheet
                const salePricePol = salePriceEth;
                const platformFeePol = salePricePol * 0.05;
                const artistPoolPol = salePricePol * 0.95;

                if (creatorId && salePricePol > 0) {
                    // Create a royalty_event for the primary sale (idempotent)
                    const { data: royaltyEvent } = await supabase
                        .from('royalty_events')
                        .upsert(
                            {
                                song_id: songData.id,
                                source_type: 'primary_sale' as const,
                                source_reference: sourceRef,
                                gross_amount_eur: salePricePol,
                                tx_hash: paymentTxHash,
                            },
                            { onConflict: 'source_type,source_reference', ignoreDuplicates: true },
                        )
                        .select()
                        .single();

                    if (royaltyEvent) {
                        // Look up split sheet for this song
                        const { data: splits } = await supabase
                            .from('song_rights_splits')
                            .select('*, linked_profile_id, linked_wallet_address, share_percent, party_email')
                            .eq('song_id', songData.id);

                        if (splits && splits.length > 0) {
                            // Distribute per split sheet
                            console.log('[blockchain] Primary sale: distributing', artistPoolPol, 'POL across', splits.length, 'split parties');
                            for (const split of splits) {
                                const partyAmount = artistPoolPol * (parseFloat(split.share_percent) / 100);
                                await supabase
                                    .from('royalty_shares')
                                    .insert({
                                        royalty_event_id: royaltyEvent.id,
                                        party_email: split.party_email,
                                        linked_profile_id: split.linked_profile_id || null,
                                        wallet_address: split.linked_wallet_address || null,
                                        share_type: 'split',
                                        share_percent: parseFloat(split.share_percent),
                                        amount_eur: partyAmount,
                                    });

                                // Transfer to party's wallet if they have one
                                if (split.linked_wallet_address && partyAmount > 0) {
                                    const partyWei = BigInt(Math.floor(partyAmount * 1e18)).toString();
                                    try {
                                        await transferToArtistWallet(split.linked_wallet_address, partyWei);
                                    } catch (err) {
                                        console.error('[blockchain] Split party payment failed (non-blocking):', err);
                                    }
                                }
                            }
                        } else {
                            // No split sheet → 100% of artist pool to creator (backward compatible)
                            const { data: creatorProfile } = await supabase
                                .from('profiles')
                                .select('wallet_address')
                                .eq('id', creatorId)
                                .maybeSingle();

                            await supabase
                                .from('royalty_shares')
                                .insert({
                                    royalty_event_id: royaltyEvent.id,
                                    linked_profile_id: creatorId,
                                    wallet_address: creatorProfile?.wallet_address || null,
                                    share_type: 'direct',
                                    share_percent: 95,
                                    amount_eur: artistPoolPol,
                                });

                            console.log('[blockchain] Primary sale: no splits, 95% (' + artistPoolPol + ' POL) to creator');
                            if (creatorProfile?.wallet_address) {
                                const artistAmountWei = BigInt(Math.floor(artistPoolPol * 1e18)).toString();
                                try {
                                    await transferToArtistWallet(creatorProfile.wallet_address, artistAmountWei);
                                } catch (err) {
                                    console.error('[blockchain] Artist payment failed (non-blocking):', err);
                                }
                            }
                        }
                        console.log('[blockchain] Primary sale revenue recorded for release:', releaseId);
                    }
                }
            } catch (revErr) {
                // Non-blocking: log but don't fail the mint
                console.warn('[blockchain] Failed to record primary sale revenue (non-blocking):', revErr);
            }
        }

        return { success: true, tokenId: tokenRecord?.id || tokenId };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * List an NFT for sale on the marketplace.
 * Since our payment-first architecture stores NFTs in the DB only (not minted on-chain),
 * we create a DB-only marketplace listing. Secondary sales are mediated by the server:
 * buyer pays server wallet → server transfers to seller (minus royalty) + artist royalty.
 */
export async function listForSale(
    config: {
        nftTokenId: string;
        priceEth: number;
        sellerWallet: string;
    },
    account?: Account,
): Promise<{ success: boolean; listingId?: string; error?: string }> {
    try {
        // Verify ownership
        const { data: token } = await supabase
            .from('nft_tokens')
            .select('id, owner_wallet_address, token_id')
            .eq('id', config.nftTokenId)
            .maybeSingle();

        if (!token) return { success: false, error: 'Token not found' };
        if (token.owner_wallet_address.toLowerCase() !== config.sellerWallet.toLowerCase()) {
            return { success: false, error: 'Not the token owner' };
        }

        // Prevent duplicate active listings
        const { data: existingListing } = await supabase
            .from('marketplace_listings')
            .select('id')
            .eq('nft_token_id', config.nftTokenId)
            .eq('is_active', true)
            .maybeSingle();

        if (existingListing) {
            return { success: false, error: 'This NFT already has an active listing. Cancel or update the existing listing first.' };
        }

        // DB-only listing (no on-chain listing needed since NFTs are DB-only in payment-first arch)
        console.log('[blockchain] Creating DB-only marketplace listing for token:', token.token_id, 'price:', config.priceEth, 'POL');

        const { data: listing, error } = await supabase
            .from('marketplace_listings')
            .insert({
                nft_token_id: config.nftTokenId,
                seller_wallet: config.sellerWallet.toLowerCase(),
                price_eth: config.priceEth,
                is_active: true,
                chain_listing_id: null, // DB-only listing
            })
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        console.log('[blockchain] Marketplace listing created:', listing.id);
        return { success: true, listingId: listing.id };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Buy an NFT from a marketplace listing (secondary sale).
 * Payment-first flow for DB-only listings:
 *   1. Buyer sends listing price (POL) to server wallet
 *   2. Server distributes: 95% to seller, 5% royalty to artist
 *   3. DB records updated (ownership transfer, royalty tracking)
 */
export async function buyListingFlow(
    config: { listingId: string; buyerWallet: string },
    account?: Account,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { data: listing } = await supabase
            .from('marketplace_listings')
            .select(`
                *,
                nft_token:nft_tokens!nft_token_id (
                    *,
                    release:nft_releases!nft_release_id (
                        *,
                        song:songs!song_id (id, creator_id)
                    )
                )
            `)
            .eq('id', config.listingId)
            .eq('is_active', true)
            .maybeSingle();

        if (!listing) return { success: false, error: 'Listing not found or inactive' };

        const salePricePol = parseFloat(listing.price_eth);
        const priceWei = BigInt(Math.floor(salePricePol * 1e18));

        // ─── Step 1: Buyer pays server wallet ───
        if (!account) {
            return { success: false, error: 'Wallet not connected. Please connect your wallet to purchase.' };
        }

        let saleTxHash: string | null = null;
        if (priceWei > BigInt(0)) {
            console.log('[blockchain] Secondary sale: buyer paying', salePricePol, 'POL to server wallet');
            try {
                const paymentTx = prepareTransaction({
                    to: '0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39' as `0x${string}`,
                    chain: activeChain,
                    client: thirdwebClient,
                    value: priceWei,
                });
                const paymentResult = await sendTransaction({ account, transaction: paymentTx });
                console.log('[blockchain] Buyer payment confirmed, tx:', paymentResult.transactionHash);
                saleTxHash = paymentResult.transactionHash;
            } catch (payErr: any) {
                console.error('[blockchain] Secondary sale payment failed:', payErr);
                return {
                    success: false,
                    error: `Payment failed: ${payErr.message}. Your wallet was not charged.`,
                };
            }
        }

        const now = new Date().toISOString();

        // ─── Step 2: Mark listing as sold ───
        await supabase
            .from('marketplace_listings')
            .update({
                is_active: false,
                sold_at: now,
                buyer_wallet: config.buyerWallet.toLowerCase(),
            })
            .eq('id', config.listingId);

        // ─── Step 3: Transfer token ownership in DB ───
        await supabase
            .from('nft_tokens')
            .update({
                owner_wallet_address: config.buyerWallet.toLowerCase(),
                last_transferred_at: now,
                last_sale_price_eth: listing.price_eth,
                last_sale_tx_hash: saleTxHash,
            })
            .eq('id', listing.nft_token_id);

        // ─── Step 4: Distribute funds from server wallet ───
        // Secondary sale split: 5% platform fee (server keeps), 5% artist royalty, 90% to seller
        const platformPercent = 0.05; // 5% stays in server wallet
        const royaltyPercent = 0.05;  // 5% to artist
        const sellerPercent = 0.90;   // 90% to seller
        const platformFeePol = salePricePol * platformPercent;
        const royaltyAmountPol = salePricePol * royaltyPercent;
        const sellerAmountPol = salePricePol * sellerPercent;
        const creatorId = listing.nft_token?.release?.song?.creator_id;

        console.log('[blockchain] Secondary sale split:', salePricePol, 'POL →', sellerAmountPol, 'seller (90%) +', royaltyAmountPol, 'artist (5%) +', platformFeePol, 'platform (5%)');

        // Transfer 90% to seller
        const sellerWallet = listing.seller_wallet;
        if (sellerWallet && sellerAmountPol > 0) {
            const sellerAmountWei = BigInt(Math.floor(sellerAmountPol * 1e18)).toString();
            console.log('[blockchain] Transferring', sellerAmountPol, 'POL (90%) to seller:', sellerWallet);
            try {
                await transferToArtistWallet(sellerWallet, sellerAmountWei);
            } catch (err) {
                console.error('[blockchain] Seller payment failed (non-blocking):', err);
            }
        }

        // Transfer 5% royalty distributed per split sheet
        const sourceRef = `sale:${config.listingId}`;
        if (creatorId && royaltyAmountPol > 0) {
            const songId = listing.nft_token.release.song.id;
            // Record royalty event
            const { data: royaltyEvent } = await supabase
                .from('royalty_events')
                .upsert(
                    {
                        song_id: songId,
                        source_type: 'secondary_sale' as const,
                        source_reference: sourceRef,
                        gross_amount_eur: royaltyAmountPol,
                        tx_hash: saleTxHash,
                    },
                    { onConflict: 'source_type,source_reference', ignoreDuplicates: true },
                )
                .select()
                .single();

            if (royaltyEvent) {
                // Look up split sheet for this song
                const { data: splits } = await supabase
                    .from('song_rights_splits')
                    .select('*, linked_profile_id, linked_wallet_address, share_percent, party_email')
                    .eq('song_id', songId);

                if (splits && splits.length > 0) {
                    // Distribute royalty per split sheet
                    console.log('[blockchain] Secondary sale royalty: distributing', royaltyAmountPol, 'POL across', splits.length, 'split parties');
                    for (const split of splits) {
                        const partyAmount = royaltyAmountPol * (parseFloat(split.share_percent) / 100);
                        await supabase
                            .from('royalty_shares')
                            .insert({
                                royalty_event_id: royaltyEvent.id,
                                party_email: split.party_email,
                                linked_profile_id: split.linked_profile_id || null,
                                wallet_address: split.linked_wallet_address || null,
                                share_type: 'split',
                                share_percent: parseFloat(split.share_percent),
                                amount_eur: partyAmount,
                            });

                        // Transfer to party's wallet if available
                        if (split.linked_wallet_address && partyAmount > 0) {
                            const partyWei = BigInt(Math.floor(partyAmount * 1e18)).toString();
                            try {
                                await transferToArtistWallet(split.linked_wallet_address, partyWei);
                            } catch (err) {
                                console.error('[blockchain] Split party royalty transfer failed (non-blocking):', err);
                            }
                        }
                    }
                } else {
                    // No split sheet → 100% to creator (backward compatible)
                    const { data: creatorProfile } = await supabase
                        .from('profiles')
                        .select('wallet_address')
                        .eq('id', creatorId)
                        .maybeSingle();

                    await supabase
                        .from('royalty_shares')
                        .insert({
                            royalty_event_id: royaltyEvent.id,
                            linked_profile_id: creatorId,
                            wallet_address: creatorProfile?.wallet_address || null,
                            share_type: 'direct',
                            share_percent: 100,
                            amount_eur: royaltyAmountPol,
                        });

                    // Transfer royalty to creator's wallet
                    if (creatorProfile?.wallet_address) {
                        const royaltyWei = BigInt(Math.floor(royaltyAmountPol * 1e18)).toString();
                        console.log('[blockchain] Transferring', royaltyAmountPol, 'POL (5% royalty) to artist:', creatorProfile.wallet_address);
                        try {
                            await transferToArtistWallet(creatorProfile.wallet_address, royaltyWei);
                        } catch (err) {
                            console.error('[blockchain] Artist royalty transfer failed (non-blocking):', err);
                        }
                    }
                }
            }
        }

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Cancel a marketplace listing.
 */
export async function cancelListingFlow(
    listingId: string,
    sellerWallet: string,
    account?: Account,
): Promise<{ success: boolean; error?: string }> {
    const { data: listing } = await supabase
        .from('marketplace_listings')
        .select('chain_listing_id')
        .eq('id', listingId)
        .eq('seller_wallet', sellerWallet.toLowerCase())
        .eq('is_active', true)
        .maybeSingle();

    if (!listing) return { success: false, error: 'Listing not found' };

    // Cancel on-chain if exists and is a valid numeric listing ID
    if (account && isMarketplaceReady() && listing.chain_listing_id) {
        if (!isValidChainListingId(listing.chain_listing_id)) {
            console.warn('[blockchain] cancelListingFlow: chain_listing_id is a legacy tx hash, skipping on-chain cancel:', listing.chain_listing_id);
        } else {
            const result = await cancelListingOnChain(account, BigInt(listing.chain_listing_id));
            if (!result.success) {
                return { success: false, error: `On-chain cancel failed: ${result.error}` };
            }
        }
    }

    // Cancel in Supabase
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
