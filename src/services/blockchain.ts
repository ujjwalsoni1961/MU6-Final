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

import { prepareContractCall, readContract, sendTransaction } from 'thirdweb';
import type { Account } from 'thirdweb/wallets';
import {
    CONTRACTS,
    getSongNFTContract,
    getMarketplaceContract,
    getSplitContract,
} from '../lib/thirdweb';
import { supabaseAdmin } from '../lib/supabase';

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
 * Step 2: Claim (mint) an NFT. Buyer calls this to mint from a lazy-minted batch.
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
            value: pricePerToken * BigInt(quantity), // send native token if paying in ETH/MATIC
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

/** Native token address placeholder used by MarketplaceV3 */
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

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
        console.log('[blockchain] createListing tx:', result.transactionHash);
        return { success: true, txHash: result.transactionHash };
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
        const { data: release, error: dbError } = await supabaseAdmin
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

        // 2. Lazy-mint on-chain if account is available
        if (account && isContractReady()) {
            const mintResult = await lazyMintSongNFT(
                account,
                config.totalSupply,
                config.metadataUri,
            );
            if (!mintResult.success) {
                console.warn('[blockchain] On-chain lazy mint failed, DB record still created:', mintResult.error);
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
        const { data: release } = await supabaseAdmin
            .from('nft_releases')
            .select('*')
            .eq('id', releaseId)
            .single();

        if (!release) return { success: false, error: 'Release not found' };
        if (release.minted_count >= release.total_supply) {
            return { success: false, error: 'Sold out' };
        }

        // The on-chain token ID is determined by totalSupply() BEFORE claiming.
        // DropERC721 uses 0-based sequential IDs: first claimed = 0, second = 1, etc.
        // We read it before claim so we know exactly which token ID was assigned.
        let onChainTokenId: string | null = null;

        // On-chain claim if account available
        if (account && isContractReady()) {
            // Read the on-chain totalSupply to know the next token ID
            try {
                const supply = await getTotalSupply();
                onChainTokenId = supply.toString(); // next token = current supply (0-based)
                console.log('[blockchain] next on-chain token ID will be:', onChainTokenId);
            } catch (supplyErr) {
                console.warn('[blockchain] Could not read totalSupply:', supplyErr);
            }

            // Read the actual on-chain claim condition to get the correct price.
            // The contract enforces its own price — we must match it exactly,
            // regardless of what the DB release price says.
            let priceWei: bigint;
            let currency: string;
            try {
                const condition = await getActiveClaimCondition();
                priceWei = condition.pricePerToken;
                currency = condition.currency;
                console.log('[blockchain] claim condition price:', priceWei.toString(), 'currency:', currency);
            } catch (condErr) {
                // Fallback to DB price if we can't read the condition
                console.warn('[blockchain] Could not read claim condition, falling back to DB price:', condErr);
                priceWei = BigInt(Math.floor((release.price_eth || 0) * 1e18));
                currency = NATIVE_TOKEN;
            }

            const claimResult = await claimSongNFT(
                account,
                buyerWallet,
                1,
                currency,
                priceWei,
            );
            if (!claimResult.success) {
                return { success: false, error: `On-chain claim failed: ${claimResult.error}` };
            }
        }

        // Use on-chain token ID if available, otherwise fall back to minted_count (0-based)
        const tokenId = onChainTokenId || `${release.minted_count}`;

        // Create token record in Supabase (idempotent: ON CONFLICT DO NOTHING)
        // If a previous attempt already created the row (e.g. on-chain succeeded,
        // app crashed before DB write confirmation), we skip the duplicate.
        const { data: token, error: tokenErr } = await supabaseAdmin
            .from('nft_tokens')
            .upsert(
                {
                    nft_release_id: releaseId,
                    token_id: tokenId,
                    owner_wallet_address: buyerWallet.toLowerCase(),
                },
                { onConflict: 'nft_release_id,token_id', ignoreDuplicates: true },
            )
            .select()
            .single();

        if (tokenErr && !tokenErr.message?.includes('duplicate')) {
            return { success: false, error: tokenErr.message };
        }

        // If upsert skipped (duplicate), fetch the existing token
        const tokenRecord = token || (await supabaseAdmin
            .from('nft_tokens')
            .select('id')
            .eq('nft_release_id', releaseId)
            .eq('token_id', tokenId)
            .single()).data;

        return { success: true, tokenId: tokenRecord?.id || tokenId };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * List an NFT for sale on the marketplace.
 * 1. Creates on-chain listing via MarketplaceV3
 * 2. Creates listing record in Supabase
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
        const { data: token } = await supabaseAdmin
            .from('nft_tokens')
            .select('id, owner_wallet_address, token_id')
            .eq('id', config.nftTokenId)
            .single();

        if (!token) return { success: false, error: 'Token not found' };
        if (token.owner_wallet_address.toLowerCase() !== config.sellerWallet.toLowerCase()) {
            return { success: false, error: 'Not the token owner' };
        }

        // Prevent duplicate active listings
        const { data: existingListing } = await supabaseAdmin
            .from('marketplace_listings')
            .select('id')
            .eq('nft_token_id', config.nftTokenId)
            .eq('is_active', true)
            .maybeSingle();

        if (existingListing) {
            return { success: false, error: 'This NFT already has an active listing. Cancel or update the existing listing first.' };
        }

        // On-chain listing
        let chainListingId: string | undefined;
        if (account && isMarketplaceReady()) {
            // Step 1: Ensure the marketplace has approval to transfer the seller's NFTs
            const approvalResult = await ensureMarketplaceApproval(account);
            if (!approvalResult.success) {
                return { success: false, error: `Marketplace approval failed: ${approvalResult.error}` };
            }

            // Step 2: Create the listing
            const now = BigInt(Math.floor(Date.now() / 1000));
            const oneYear = now + BigInt(365 * 24 * 60 * 60);
            const priceWei = BigInt(Math.floor(config.priceEth * 1e18));

            const result = await createListing(account, {
                assetContract: CONTRACTS.SONG_NFT,
                tokenId: BigInt(token.token_id),
                quantity: BigInt(1),
                currency: NATIVE_TOKEN,
                pricePerToken: priceWei,
                startTimestamp: now,
                endTimestamp: oneYear,
                reserved: false,
            });

            if (!result.success) {
                return { success: false, error: `On-chain listing failed: ${result.error}` };
            }
            chainListingId = result.txHash;
        }

        // Supabase record
        const { data: listing, error } = await supabaseAdmin
            .from('marketplace_listings')
            .insert({
                nft_token_id: config.nftTokenId,
                seller_wallet: config.sellerWallet.toLowerCase(),
                price_eth: config.priceEth,
                is_active: true,
                chain_listing_id: chainListingId || null,
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
 * Buy an NFT from a marketplace listing.
 * Secondary royalty (5%) goes to creator only per spec.
 */
export async function buyListingFlow(
    config: { listingId: string; buyerWallet: string },
    account?: Account,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { data: listing } = await supabaseAdmin
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
            .single();

        if (!listing) return { success: false, error: 'Listing not found or inactive' };

        // On-chain buy
        if (account && isMarketplaceReady() && listing.chain_listing_id) {
            const priceWei = BigInt(Math.floor(parseFloat(listing.price_eth) * 1e18));
            const result = await buyFromListing(
                account,
                BigInt(listing.chain_listing_id),
                config.buyerWallet,
                BigInt(1),
                NATIVE_TOKEN,
                priceWei,
            );
            if (!result.success) {
                return { success: false, error: `On-chain buy failed: ${result.error}` };
            }
        }

        const now = new Date().toISOString();

        // Mark listing as sold
        await supabaseAdmin
            .from('marketplace_listings')
            .update({
                is_active: false,
                sold_at: now,
                buyer_wallet: config.buyerWallet.toLowerCase(),
            })
            .eq('id', config.listingId);

        // Transfer token ownership
        await supabaseAdmin
            .from('nft_tokens')
            .update({
                owner_wallet_address: config.buyerWallet.toLowerCase(),
                last_transferred_at: now,
                last_sale_price_eth: listing.price_eth,
            })
            .eq('id', listing.nft_token_id);

        // Record secondary sale royalty (5% to creator) — idempotent via unique source_reference
        const salePriceEur = parseFloat(listing.price_eth) * 2500; // rough ETH→EUR; replace with oracle
        const royaltyAmountEur = salePriceEur * 0.05;
        const creatorId = listing.nft_token?.release?.song?.creator_id;
        const sourceRef = `sale:${config.listingId}`;

        if (creatorId && royaltyAmountEur > 0) {
            // Idempotent insert — if this sale was already recorded (retry scenario), skip
            const { data: royaltyEvent } = await supabaseAdmin
                .from('royalty_events')
                .upsert(
                    {
                        song_id: listing.nft_token.release.song.id,
                        source_type: 'secondary_sale' as const,
                        source_reference: sourceRef,
                        gross_amount_eur: royaltyAmountEur,
                    },
                    { onConflict: 'source_type,source_reference', ignoreDuplicates: true },
                )
                .select()
                .single();

            if (royaltyEvent) {
                // Distribute to split sheet parties (or 100% to creator if no splits)
                const { data: splits } = await supabaseAdmin
                    .from('song_rights_splits')
                    .select('*')
                    .eq('song_id', listing.nft_token.release.song.id);

                if (splits && splits.length > 0) {
                    const shareRows = splits.map((s: any) => ({
                        royalty_event_id: royaltyEvent.id,
                        party_email: s.party_email,
                        linked_profile_id: s.linked_profile_id,
                        wallet_address: s.linked_wallet_address,
                        share_type: 'split' as const,
                        share_percent: parseFloat(s.share_percent),
                        amount_eur: royaltyAmountEur * parseFloat(s.share_percent) / 100,
                    }));
                    await supabaseAdmin.from('royalty_shares').insert(shareRows);
                } else {
                    // No split sheet — 100% to creator
                    await supabaseAdmin
                        .from('royalty_shares')
                        .insert({
                            royalty_event_id: royaltyEvent.id,
                            linked_profile_id: creatorId,
                            share_type: 'direct',
                            share_percent: 100,
                            amount_eur: royaltyAmountEur,
                        });
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
    const { data: listing } = await supabaseAdmin
        .from('marketplace_listings')
        .select('chain_listing_id')
        .eq('id', listingId)
        .eq('seller_wallet', sellerWallet.toLowerCase())
        .eq('is_active', true)
        .single();

    if (!listing) return { success: false, error: 'Listing not found' };

    // Cancel on-chain if exists
    if (account && isMarketplaceReady() && listing.chain_listing_id) {
        const result = await cancelListingOnChain(account, BigInt(listing.chain_listing_id));
        if (!result.success) {
            return { success: false, error: `On-chain cancel failed: ${result.error}` };
        }
    }

    // Cancel in Supabase
    const { error } = await supabaseAdmin
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
): Promise<{ success: boolean; txHash?: string; error?: string }> {
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
        return { success: true, txHash: result.txHash };
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
): Promise<{ success: boolean; error?: string }> {
    try {
        // On-chain update if we have chain listing info
        if (account && config.chainListingId && config.onChainTokenId && isMarketplaceReady()) {
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
        }

        // DB update
        const { error } = await supabaseAdmin
            .from('marketplace_listings')
            .update({ price_eth: config.newPriceEth })
            .eq('id', config.listingId)
            .eq('seller_wallet', config.sellerWallet.toLowerCase())
            .eq('is_active', true);

        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
