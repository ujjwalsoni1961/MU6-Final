/**
 * MU6 Marketplace Service
 *
 * On-chain secondary sale operations via MarketplaceV3 (direct listings).
 * Replaces the old DB-only marketplace flow with on-chain listing, buying, and cancellation.
 *
 * Revenue split on secondary sales:
 *   - 90% → seller (handled by MarketplaceV3)
 *   - 5% → platform fee (configured on MarketplaceV3)
 *   - 5% → artist royalty via EIP-2981 (set on NFT contract)
 */

import { prepareContractCall, readContract, sendTransaction, waitForReceipt } from 'thirdweb';
import type { Account } from 'thirdweb/wallets';
import {
    CONTRACTS,
    getSongNFTContract,
    getMarketplaceContract,
    thirdwebClient,
    activeChain
} from '../lib/thirdweb';
import { supabase } from '../lib/supabase';
import { getTokenToEurRate } from './fxRate';

// ── Constants ──

const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

/** Call the nft-admin edge function for setRoyalty action */
async function callSetRoyalty(
    royaltyRecipient: string,
    royaltyBps: string = '500',
    contractAddress?: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const url = `${SUPABASE_URL}/functions/v1/nft-admin`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                action: 'setRoyalty',
                royaltyRecipient,
                royaltyBps,
                contractAddress,
            }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            return { success: false, error: result.error || `HTTP ${response.status}` };
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

// ────────────────────────────────────────────
// On-chain marketplace operations
// ────────────────────────────────────────────

/**
 * Create a direct listing on MarketplaceV3 for a secondary sale.
 *
 * Flow:
 * 1. Verify seller owns the NFT (DB check)
 * 2. Ensure marketplace is approved to transfer the NFT (setApprovalForAll)
 * 3. Create on-chain listing via MarketplaceV3.createListing
 * 4. Store listing in DB with chain_listing_id
 */
export async function createMarketplaceListing(
    config: {
        nftTokenId: string;   // DB UUID of the nft_token row
        pricePol: number;     // listing price in POL
        sellerWallet: string;
    },
    account: Account,
): Promise<{ success: boolean; listingId?: string; error?: string }> {
    try {
        // 1. Verify seller owns the NFT
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
            return { success: false, error: 'This NFT already has an active listing.' };
        }

        // 2. Ensure marketplace approval
        const marketplaceAddr = CONTRACTS.MARKETPLACE as `0x${string}`;
        const isApproved = await readContract({
            contract: getSongNFTContract(),
            method: 'function isApprovedForAll(address owner, address operator) view returns (bool)',
            params: [account.address as `0x${string}`, marketplaceAddr],
        });

        if (!isApproved) {
            console.log('[marketplace] Approving marketplace for NFT transfers');
            const approveTx = prepareContractCall({
                contract: getSongNFTContract(),
                method: 'function setApprovalForAll(address operator, bool approved)',
                params: [marketplaceAddr, true],
            });
            const approveResult = await sendTransaction({ account, transaction: approveTx });
            
            console.log('[marketplace] Waiting for approval transaction receipt...', approveResult.transactionHash);
            const receipt = await waitForReceipt({
                client: thirdwebClient,
                chain: activeChain,
                transactionHash: approveResult.transactionHash,
            });

            if (receipt.status === 'reverted') {
                return { success: false, error: 'Approval transaction reverted' };
            }

            console.log('[marketplace] Marketplace approval granted and confirmed');
        }

        // 3. Create on-chain listing
        const priceWei = BigInt(Math.floor(config.pricePol * 1e18));
        const now = BigInt(Math.floor(Date.now() / 1000));
        const oneYear = now + BigInt(365 * 24 * 60 * 60);

        // Read totalListings to predict the listing ID
        const nextListingId = await readContract({
            contract: getMarketplaceContract(),
            method: 'function totalListings() view returns (uint256)',
            params: [],
        });

        const listingParams = {
            assetContract: CONTRACTS.SONG_NFT as `0x${string}`,
            tokenId: BigInt(token.token_id),
            quantity: BigInt(1),
            currency: NATIVE_TOKEN as `0x${string}`,
            pricePerToken: priceWei,
            startTimestamp: BigInt(now),
            endTimestamp: BigInt(oneYear),
            reserved: false,
        };

        const tx = prepareContractCall({
            contract: getMarketplaceContract(),
            method: 'function createListing((address assetContract, uint256 tokenId, uint256 quantity, address currency, uint256 pricePerToken, uint128 startTimestamp, uint128 endTimestamp, bool reserved) _params) returns (uint256 listingId)',
            params: [listingParams],
        });

        const result = await sendTransaction({ account, transaction: tx });
        console.log('[marketplace] On-chain listing created, tx:', result.transactionHash, 'listingId:', nextListingId.toString());

        // 4. Snapshot EUR rate + store in DB
        let eurRate = 0;
        try { eurRate = await getTokenToEurRate(); } catch { /* non-blocking */ }
        const priceEurAtList = eurRate > 0 ? config.pricePol * eurRate : null;

        const { data: listing, error: dbErr } = await supabase
            .from('marketplace_listings')
            .insert({
                nft_token_id: config.nftTokenId,
                seller_wallet: config.sellerWallet.toLowerCase(),
                price_eth: config.pricePol,
                price_token: config.pricePol,
                price_eur_at_list: priceEurAtList,
                is_active: true,
                chain_listing_id: nextListingId.toString(),
            })
            .select()
            .single();

        if (dbErr) return { success: false, error: dbErr.message };
        console.log('[marketplace] DB listing created:', listing.id);
        return { success: true, listingId: listing.id };
    } catch (err: any) {
        console.error('[marketplace] createMarketplaceListing error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Buy an NFT from a marketplace listing (secondary sale).
 *
 * On-chain flow — MarketplaceV3 handles:
 *   - NFT transfer: seller → buyer
 *   - Payment: buyer pays → seller (90%) + platform (5%) + royalty (5%)
 *
 * After tx confirms, update DB records as cache/index of on-chain state.
 * NO royalty_events/royalty_shares created — the Split contract handles artist royalties.
 */
export async function buyMarketplaceListing(
    config: { listingId: string; buyerWallet: string },
    account: Account,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
        // 1. Fetch listing from DB
        const { data: listing } = await supabase
            .from('marketplace_listings')
            .select('*, nft_token:nft_tokens!nft_token_id (id, token_id)')
            .eq('id', config.listingId)
            .eq('is_active', true)
            .maybeSingle();

        if (!listing) return { success: false, error: 'Listing not found or inactive' };
        if (!listing.chain_listing_id) return { success: false, error: 'Listing has no on-chain ID' };

        const chainListingId = BigInt(listing.chain_listing_id);
        const pricePol = parseFloat(listing.price_token || listing.price_eth);
        const totalPriceWei = BigInt(Math.floor(pricePol * 1e18));

        // 2. Buy from listing on-chain
        console.log('[marketplace] Buying listing', chainListingId.toString(), 'for', pricePol, 'POL');
        const tx = prepareContractCall({
            contract: getMarketplaceContract(),
            method: 'function buyFromListing(uint256 _listingId, address _buyFor, uint256 _quantity, address _currency, uint256 _expectedTotalPrice) payable',
            params: [
                chainListingId,
                config.buyerWallet as `0x${string}`,
                BigInt(1),
                NATIVE_TOKEN as `0x${string}`,
                totalPriceWei,
            ],
            value: totalPriceWei,
        });

        const result = await sendTransaction({ account, transaction: tx });
        const txHash = result.transactionHash;
        console.log('[marketplace] Buy tx confirmed:', txHash);

        // 3. Snapshot EUR rate
        let eurRate = 0;
        try { eurRate = await getTokenToEurRate(); } catch { /* non-blocking */ }
        const salePriceEur = eurRate > 0 ? pricePol * eurRate : null;

        const now = new Date().toISOString();

        // 4. Update DB records (cache of on-chain state)
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
                last_sale_price_token: pricePol,
                last_sale_price_eur: salePriceEur,
                last_sale_tx_hash: txHash,
            })
            .eq('id', listing.nft_token_id);

        // NOTE: NO royalty_events/royalty_shares creation here.
        // The MarketplaceV3 contract handles fund distribution:
        //   - 90% to seller
        //   - 5% platform fee (configured on marketplace contract)
        //   - 5% royalty via EIP-2981 to the Split contract / royalty recipient

        return { success: true, txHash };
    } catch (err: any) {
        console.error('[marketplace] buyMarketplaceListing error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Cancel a marketplace listing.
 * 1. Cancel on-chain via MarketplaceV3.cancelListing
 * 2. Mark as inactive in DB
 */
export async function cancelMarketplaceListing(
    listingId: string,
    sellerWallet: string,
    account: Account,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { data: listing } = await supabase
            .from('marketplace_listings')
            .select('chain_listing_id')
            .eq('id', listingId)
            .eq('seller_wallet', sellerWallet.toLowerCase())
            .eq('is_active', true)
            .maybeSingle();

        if (!listing) return { success: false, error: 'Listing not found' };

        // Cancel on-chain if we have a valid chain listing ID
        if (listing.chain_listing_id && /^\d+$/.test(listing.chain_listing_id)) {
            const tx = prepareContractCall({
                contract: getMarketplaceContract(),
                method: 'function cancelListing(uint256 _listingId)',
                params: [BigInt(listing.chain_listing_id)],
            });
            await sendTransaction({ account, transaction: tx });
            console.log('[marketplace] On-chain listing cancelled:', listing.chain_listing_id);
        }

        // Mark inactive in DB
        const { error } = await supabase
            .from('marketplace_listings')
            .update({ is_active: false })
            .eq('id', listingId);

        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (err: any) {
        console.error('[marketplace] cancelMarketplaceListing error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Set royalty info (EIP-2981) on the NFT contract for a specific song.
 *
 * PDF Fix #10 — Split Sheet Revenue rework:
 *   Secondary-sale royalties go to the primary creator's wallet only. Split sheet
 *   partners (e.g. external producers / unregistered contributors) are paid via
 *   streaming royalty_shares, NOT via on-chain NFT sales.
 */
export async function setRoyaltyForSong(
    songId: string,
): Promise<{ success: boolean; error?: string }> {
    const { data: song } = await supabase
        .from('songs')
        .select('creator_id')
        .eq('id', songId)
        .maybeSingle();

    if (!song?.creator_id) {
        return { success: false, error: 'Song not found or has no creator' };
    }

    const { data: creator } = await supabase
        .from('profiles')
        .select('wallet_address')
        .eq('id', song.creator_id)
        .maybeSingle();

    if (!creator?.wallet_address) {
        return { success: false, error: "Creator has no linked wallet — cannot set royalty recipient." };
    }

    // 5% royalty to the creator wallet
    return callSetRoyalty(creator.wallet_address, '500');
}
