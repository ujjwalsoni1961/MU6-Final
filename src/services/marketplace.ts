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
import { NATIVE_TOKEN_ADDRESS } from '../config/network';
import { supabase } from '../lib/supabase';
import { getTokenToEurRate } from './fxRate';

// ── Constants ──

const NATIVE_TOKEN = NATIVE_TOKEN_ADDRESS;
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

/**
 * ERC-721 Transfer event topic0:
 *   keccak256("Transfer(address,address,uint256)")
 */
const ERC721_TRANSFER_TOPIC =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** Pad an address to a 32-byte topic (lowercase, 0x-prefixed). */
function addressToTopic(addr: string): string {
    const clean = addr.toLowerCase().replace(/^0x/, '');
    return '0x' + clean.padStart(64, '0');
}

/** Normalize a hex tokenId topic to a BigInt for safe comparison. */
function topicToBigInt(topic: string): bigint {
    try {
        return BigInt(topic);
    } catch {
        return BigInt(0);
    }
}

/**
 * Verify an ERC-721 ownership transfer happened inside a tx receipt.
 *
 * Rationale: after a buy tx is mined, calling readContract(ownerOf) can hit
 * a stale RPC node that hasn't indexed the just-mined block yet, returning
 * the pre-transfer owner. The receipt logs, however, are definitive — they
 * ARE the events emitted in that exact tx. So we parse the receipt directly.
 *
 * Returns true iff we find at least one Transfer log where:
 *   - log.address   == the NFT contract
 *   - topics[0]     == ERC-721 Transfer signature
 *   - topics[3]     == tokenId
 *   - topics[2]     == buyer (padded)
 */
async function verifyBuyOwnershipTransfer(args: {
    receipt: { logs: ReadonlyArray<{ address: string; topics: ReadonlyArray<string> }> };
    nftContractAddress: string;
    tokenId: bigint;
    buyer: string;
}): Promise<boolean> {
    const nftAddrLc = args.nftContractAddress.toLowerCase();
    const buyerTopic = addressToTopic(args.buyer);

    for (const log of args.receipt.logs) {
        if (!log?.address || log.address.toLowerCase() !== nftAddrLc) continue;
        const topics = log.topics || [];
        if (topics.length < 4) continue; // ERC-721 Transfer is indexed on all 3 params => 4 topics
        if ((topics[0] || '').toLowerCase() !== ERC721_TRANSFER_TOPIC) continue;
        if (topicToBigInt(topics[3]) !== args.tokenId) continue;
        if ((topics[2] || '').toLowerCase() !== buyerTopic) continue;
        return true;
    }

    // Safety-net fallback: the receipt didn't contain a matching Transfer log
    // (shouldn't happen for a successful buyFromListing, but be defensive).
    // Retry readContract(ownerOf) with backoff to let RPC catch up.
    try {
        for (let attempt = 0; attempt < 3; attempt++) {
            await new Promise((r) => setTimeout(r, 2000));
            const onChainOwner = await readContract({
                contract: getSongNFTContract(),
                method: 'function ownerOf(uint256 tokenId) view returns (address)',
                params: [args.tokenId],
            });
            if ((onChainOwner as string).toLowerCase() === args.buyer.toLowerCase()) {
                console.log('[marketplace] Ownership confirmed via fallback ownerOf after attempt', attempt + 1);
                return true;
            }
        }
    } catch (err: any) {
        console.warn('[marketplace] fallback ownerOf retry failed:', err?.message);
    }

    return false;
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
        // 1. Verify seller owns the NFT — both DB and on-chain
        const { data: token } = await supabase
            .from('nft_tokens')
            .select('id, owner_wallet_address, token_id, on_chain_token_id')
            .eq('id', config.nftTokenId)
            .maybeSingle();

        if (!token) return { success: false, error: 'Token not found' };
        if (token.owner_wallet_address.toLowerCase() !== config.sellerWallet.toLowerCase()) {
            return { success: false, error: 'Not the token owner' };
        }

        // Post-migration 028: require a real on_chain_token_id. The legacy
        // `token_id` column (per-release edition number) is NOT usable for
        // on-chain operations; any row missing on_chain_token_id is legacy
        // data that cannot be listed.
        const chainTokenIdStr = token.on_chain_token_id;
        if (!chainTokenIdStr || !/^\d+$/.test(chainTokenIdStr)) {
            return {
                success: false,
                error: 'This NFT is not verifiable on-chain and cannot be listed. Please contact support.',
            };
        }

        // CRITICAL — verify on-chain ownership. This is the root cause of the
        // "not owner or approved tokens" marketplace error: DB and on-chain
        // disagree. If on-chain ownerOf != seller, the DB is stale.
        try {
            const onChainOwner = await readContract({
                contract: getSongNFTContract(),
                method: 'function ownerOf(uint256 tokenId) view returns (address)',
                params: [BigInt(chainTokenIdStr)],
            });
            if ((onChainOwner as string).toLowerCase() !== config.sellerWallet.toLowerCase()) {
                return {
                    success: false,
                    error: `You do not own this NFT on-chain. Current on-chain owner: ${onChainOwner}. Please refresh your collection.`,
                };
            }
        } catch (ownerErr: any) {
            console.warn('[marketplace] on-chain ownerOf check failed (non-blocking):', ownerErr?.message);
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
            tokenId: BigInt(chainTokenIdStr),
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
        console.log('[marketplace] On-chain listing tx sent:', result.transactionHash, 'predicted listingId:', nextListingId.toString());

        // Wait for listing to be confirmed on-chain before we persist — otherwise
        // a reverted tx could leave a ghost DB listing.
        const listingReceipt = await waitForReceipt({
            client: thirdwebClient,
            chain: activeChain,
            transactionHash: result.transactionHash,
        });
        if (listingReceipt.status === 'reverted') {
            return { success: false, error: 'Listing transaction reverted on-chain' };
        }
        console.log('[marketplace] Listing confirmed on-chain in block:', listingReceipt.blockNumber);

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
            .select('*, nft_token:nft_tokens!nft_token_id (id, token_id, on_chain_token_id)')
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
        console.log('[marketplace] Buy tx sent:', txHash, '— awaiting receipt');

        // ATOMICITY — wait for on-chain confirmation BEFORE any DB writes.
        // Previously we updated DB immediately which created ghost transfers
        // when the tx later reverted (PDF bug #15).
        const buyReceipt = await waitForReceipt({
            client: thirdwebClient,
            chain: activeChain,
            transactionHash: txHash,
        });
        if (buyReceipt.status === 'reverted') {
            return {
                success: false,
                error: 'Buy transaction reverted on-chain. Your wallet was not charged.',
            };
        }
        console.log('[marketplace] Buy confirmed on-chain in block:', buyReceipt.blockNumber);

        // Verify the on-chain ownership change actually happened.
        // This catches edge cases where the tx succeeds but the NFT didn't
        // transfer (e.g. contract has a custom hook that silently skips).
        //
        // We parse the ERC-721 Transfer event directly from the receipt logs.
        // This is the source of truth for the transfer that just happened in
        // this specific tx — whereas a follow-up readContract(ownerOf) call
        // can hit a stale RPC node that hasn't indexed the just-mined block
        // yet and return the pre-transfer owner (RPC indexing race).
        try {
            const tokenRow: any = listing.nft_token;
            const chainTokenId = tokenRow?.on_chain_token_id || tokenRow?.token_id;
            if (chainTokenId && /^\d+$/.test(chainTokenId)) {
                const ownershipOk = await verifyBuyOwnershipTransfer({
                    receipt: buyReceipt,
                    nftContractAddress: CONTRACTS.SONG_NFT,
                    tokenId: BigInt(chainTokenId),
                    buyer: config.buyerWallet,
                });
                if (!ownershipOk) {
                    console.error('[marketplace] ownership mismatch after buy tx', {
                        expected: config.buyerWallet,
                        tokenId: chainTokenId,
                        txHash,
                    });
                    return {
                        success: false,
                        error: 'Buy tx confirmed but no matching NFT transfer event found on-chain. Contact support.',
                    };
                }
                console.log('[marketplace] On-chain ownership confirmed via Transfer event for token', chainTokenId);
            }
        } catch (ownerErr: any) {
            console.warn('[marketplace] Transfer-log verification skipped:', ownerErr?.message);
        }

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

        // Transfer token ownership in DB (cache of on-chain truth)
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

        // Post-buy DB reconciliation guard.
        //
        // At this point the on-chain Transfer event has already been verified
        // (buyer now owns the token on-chain). We also just wrote the DB row
        // via the listing's nft_token_id. BUT — and this is the bug we keep
        // hitting — the DB cache can drift from on-chain reality in a handful
        // of subtle ways:
        //
        //   a) two DB rows accidentally share the same on_chain_token_id
        //      (only one gets updated via .eq('id', ...)),
        //   b) the listing's nft_token_id references a stale / soft-voided row
        //      while a second, correct row exists for the same on-chain id,
        //   c) direct wallet-to-wallet transfers happened out-of-band and
        //      never landed in our DB.
        //
        // To make drift IMPOSSIBLE from this flow we do a second, unconditional
        // write keyed by on_chain_token_id. This is the source of truth from
        // the on-chain Transfer event we just verified — so overwriting every
        // row with that on_chain_token_id to point at the buyer is correct.
        try {
            const tokenRow: any = listing.nft_token;
            const chainTokenId = tokenRow?.on_chain_token_id || tokenRow?.token_id;
            if (chainTokenId && /^\d+$/.test(String(chainTokenId))) {
                const { error: reconErr } = await supabase
                    .from('nft_tokens')
                    .update({
                        owner_wallet_address: config.buyerWallet.toLowerCase(),
                        last_transferred_at: now,
                    })
                    .eq('on_chain_token_id', String(chainTokenId));
                if (reconErr) {
                    console.warn('[marketplace] post-buy reconciliation update failed (non-fatal):', reconErr.message);
                } else {
                    console.log('[marketplace] post-buy DB reconciled: on_chain_token_id=', chainTokenId, '→', config.buyerWallet);
                }
            }
        } catch (reconErr: any) {
            // Non-fatal: the primary update already succeeded. Log so ops
            // can notice if this path starts failing.
            console.warn('[marketplace] post-buy reconciliation guard error (non-fatal):', reconErr?.message);
        }

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
            const cancelResult = await sendTransaction({ account, transaction: tx });
            // Wait for confirmation before DB write — a reverted cancel would
            // leave the NFT still listed on-chain but marked inactive in DB.
            const cancelReceipt = await waitForReceipt({
                client: thirdwebClient,
                chain: activeChain,
                transactionHash: cancelResult.transactionHash,
            });
            if (cancelReceipt.status === 'reverted') {
                return { success: false, error: 'Cancel transaction reverted on-chain' };
            }
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
