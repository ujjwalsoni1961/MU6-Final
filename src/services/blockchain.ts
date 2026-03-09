/**
 * MU6 Blockchain Service
 *
 * Handles all on-chain operations via Thirdweb SDK v5.
 * For MVP: contracts are NOT deployed yet, so most functions
 * create Supabase records only and log "contract pending".
 *
 * Once contracts are deployed (Phase 3/4), these functions will
 * be updated to send real on-chain transactions.
 */

import { sendTransaction, prepareContractCall } from 'thirdweb';
import { thirdwebClient, baseSepolia, CONTRACTS, getContractInstance } from '../lib/thirdweb';
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
}

export interface ListingConfig {
    nftTokenId: string; // DB UUID
    priceEth: number;
    sellerWallet: string;
}

export interface BuyConfig {
    listingId: string; // DB UUID
    buyerWallet: string;
}

// ────────────────────────────────────────────
// Contract status check
// ────────────────────────────────────────────

export function isContractDeployed(): boolean {
    return !!CONTRACTS.SONG_NFT && CONTRACTS.SONG_NFT.length > 10;
}

export function isMarketplaceDeployed(): boolean {
    return !!CONTRACTS.MARKETPLACE && CONTRACTS.MARKETPLACE.length > 10;
}

// ────────────────────────────────────────────
// NFT Minting
// ────────────────────────────────────────────

/**
 * Create an NFT release tier for a song.
 *
 * - If contract is deployed: mints on-chain + creates DB record
 * - If not deployed (MVP): creates DB record only with contract_address = null
 *
 * The DB trigger enforces SUM(allocated_royalty_percent) <= 50 per song.
 */
export async function createNFTRelease(config: MintConfig): Promise<{
    success: boolean;
    releaseId?: string;
    error?: string;
    contractPending?: boolean;
}> {
    try {
        // 1. Create the release record in Supabase
        const { data: release, error: dbError } = await supabaseAdmin
            .from('nft_releases')
            .insert({
                song_id: config.songId,
                chain_id: '84532', // Base Sepolia
                contract_address: isContractDeployed() ? CONTRACTS.SONG_NFT : null,
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
            // Check if it's the royalty cap trigger
            if (dbError.message?.includes('50')) {
                return { success: false, error: 'Total NFT royalty allocation would exceed 50% for this song.' };
            }
            return { success: false, error: dbError.message };
        }

        // 2. If contract is deployed, mint on-chain
        if (isContractDeployed()) {
            try {
                // TODO Phase 3: Call ERC-1155 mint function
                // const contract = getContractInstance(CONTRACTS.SONG_NFT);
                // const tx = prepareContractCall({
                //     contract,
                //     method: "function lazyMint(uint256 amount, string baseURI, bytes data)",
                //     params: [BigInt(config.totalSupply), metadataUri, "0x"],
                // });
                // const result = await sendTransaction({ account, transaction: tx });
                console.log('[blockchain] On-chain mint will be implemented in Phase 3');
            } catch (chainErr) {
                console.error('[blockchain] On-chain mint failed:', chainErr);
                // DB record still exists; can retry on-chain later
            }
        } else {
            console.log('[blockchain] Contract not deployed. Release created off-chain only.');
        }

        return {
            success: true,
            releaseId: release.id,
            contractPending: !isContractDeployed(),
        };
    } catch (err: any) {
        console.error('[blockchain] createNFTRelease error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Mint a specific NFT token (buyer minting from a release).
 * For MVP: creates nft_tokens record + increments minted_count.
 */
export async function mintToken(
    releaseId: string,
    buyerWallet: string,
): Promise<{ success: boolean; tokenId?: string; error?: string }> {
    try {
        // Check release exists and has supply
        const { data: release } = await supabaseAdmin
            .from('nft_releases')
            .select('*')
            .eq('id', releaseId)
            .single();

        if (!release) return { success: false, error: 'Release not found' };
        if (release.minted_count >= release.total_supply) {
            return { success: false, error: 'Sold out' };
        }

        // Generate token ID
        const tokenId = `${release.minted_count + 1}`;

        // Create token record
        const { data: token, error: tokenErr } = await supabaseAdmin
            .from('nft_tokens')
            .insert({
                nft_release_id: releaseId,
                token_id: tokenId,
                owner_wallet_address: buyerWallet.toLowerCase(),
            })
            .select()
            .single();

        if (tokenErr) {
            return { success: false, error: tokenErr.message };
        }

        // minted_count is auto-incremented by DB trigger

        // TODO Phase 3: On-chain mint via contract call
        if (isContractDeployed()) {
            console.log('[blockchain] On-chain claim will be implemented in Phase 3');
        }

        return { success: true, tokenId: token.id };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

// ────────────────────────────────────────────
// Marketplace
// ────────────────────────────────────────────

/**
 * List an NFT for sale on the marketplace.
 * Creates a listing record. On-chain listing will be added in Phase 4.
 */
export async function listForSale(config: ListingConfig): Promise<{
    success: boolean;
    listingId?: string;
    error?: string;
}> {
    try {
        // Verify ownership
        const { data: token } = await supabaseAdmin
            .from('nft_tokens')
            .select('id, owner_wallet_address')
            .eq('id', config.nftTokenId)
            .single();

        if (!token) return { success: false, error: 'Token not found' };
        if (token.owner_wallet_address.toLowerCase() !== config.sellerWallet.toLowerCase()) {
            return { success: false, error: 'Not the token owner' };
        }

        const { data: listing, error } = await supabaseAdmin
            .from('marketplace_listings')
            .insert({
                nft_token_id: config.nftTokenId,
                seller_wallet: config.sellerWallet.toLowerCase(),
                price_eth: config.priceEth,
                is_active: true,
            })
            .select()
            .single();

        if (error) return { success: false, error: error.message };

        // TODO Phase 4: Create on-chain marketplace listing
        if (isMarketplaceDeployed()) {
            console.log('[blockchain] On-chain listing will be implemented in Phase 4');
        }

        return { success: true, listingId: listing.id };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Buy an NFT from a marketplace listing.
 * Transfers ownership in DB. On-chain transfer in Phase 4.
 * Secondary royalty (5%) goes to creator only per spec.
 */
export async function buyListing(config: BuyConfig): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        // Get listing with full chain
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

        const now = new Date().toISOString();

        // 1. Mark listing as sold
        await supabaseAdmin
            .from('marketplace_listings')
            .update({
                is_active: false,
                sold_at: now,
                buyer_wallet: config.buyerWallet.toLowerCase(),
            })
            .eq('id', config.listingId);

        // 2. Transfer token ownership
        await supabaseAdmin
            .from('nft_tokens')
            .update({
                owner_wallet_address: config.buyerWallet.toLowerCase(),
                last_transferred_at: now,
                last_sale_price_eth: listing.price_eth,
            })
            .eq('id', listing.nft_token_id);

        // 3. Record secondary sale royalty event (5% to creator)
        const salePriceEur = parseFloat(listing.price_eth) * 2500; // Rough ETH→EUR; will use oracle later
        const royaltyAmountEur = salePriceEur * 0.05;
        const creatorId = listing.nft_token?.release?.song?.creator_id;

        if (creatorId && royaltyAmountEur > 0) {
            const { data: royaltyEvent } = await supabaseAdmin
                .from('royalty_events')
                .insert({
                    song_id: listing.nft_token.release.song.id,
                    source_type: 'secondary_sale',
                    source_reference: config.listingId,
                    gross_amount_eur: royaltyAmountEur,
                })
                .select()
                .single();

            if (royaltyEvent) {
                await supabaseAdmin
                    .from('royalty_shares')
                    .insert({
                        royalty_event_id: royaltyEvent.id,
                        linked_profile_id: creatorId,
                        share_type: 'direct',
                        share_percent: 100, // 100% of the 5% goes to creator
                        amount_eur: royaltyAmountEur,
                    });
            }
        }

        // TODO Phase 4: Execute on-chain transfer + royalty split
        if (isMarketplaceDeployed()) {
            console.log('[blockchain] On-chain sale execution will be implemented in Phase 4');
        }

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Cancel a marketplace listing (seller only).
 */
export async function cancelListing(
    listingId: string,
    sellerWallet: string,
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseAdmin
        .from('marketplace_listings')
        .update({ is_active: false })
        .eq('id', listingId)
        .eq('seller_wallet', sellerWallet.toLowerCase())
        .eq('is_active', true);

    if (error) return { success: false, error: error.message };
    return { success: true };
}
