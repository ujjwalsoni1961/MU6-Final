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
    getMarketplaceContract,
    getContractInstance,
    thirdwebClient,
    activeChain
} from '../lib/thirdweb';
import { NATIVE_TOKEN_ADDRESS } from '../config/network';
import { supabase } from '../lib/supabase';
import { getTokenToEurRate } from './fxRate';

type NftStandard = 'erc721' | 'erc1155';

/**
 * Resolve the NFT contract (address + standard + thirdweb handle) for a given
 * nft_tokens row. Post-Path-B, different releases live on different contracts:
 *   - Legacy DropERC721  (nft_standard = 'erc721') → CONTRACTS.SONG_NFT
 *   - New DropERC1155    (nft_standard = 'erc1155') → per-release contract_address
 *
 * Every on-chain op (ownerOf / balanceOf / setApprovalForAll / createListing)
 * must be dispatched to the RIGHT contract for the token — otherwise we hit the
 * legacy ERC-721 and get completely wrong results (e.g. "current on-chain owner
 * is 0x406B..." when that address just happens to own token 0 on the legacy
 * contract).
 */
async function resolveNftContractForToken(
    nftTokenId: string,
): Promise<
    | { ok: true; standard: NftStandard; address: string; contract: ReturnType<typeof getContractInstance>; onChainTokenId: string; tokenDbId: string; ownerWallet: string }
    | { ok: false; error: string }
> {
    const { data, error } = await supabase
        .from('nft_tokens')
        .select(`
            id,
            token_id,
            on_chain_token_id,
            owner_wallet_address,
            release:nft_releases!nft_release_id (
                nft_standard,
                contract_address
            )
        `)
        .eq('id', nftTokenId)
        .maybeSingle();

    if (error || !data) return { ok: false, error: error?.message || 'Token not found' };

    const chainTokenIdStr = (data as any).on_chain_token_id;
    if (!chainTokenIdStr || !/^\d+$/.test(String(chainTokenIdStr))) {
        return { ok: false, error: 'This NFT is not verifiable on-chain and cannot be listed. Please contact support.' };
    }

    const release: any = (data as any).release;
    const standard: NftStandard = release?.nft_standard === 'erc1155' ? 'erc1155' : 'erc721';
    const address: string = release?.contract_address || CONTRACTS.SONG_NFT;

    return {
        ok: true,
        standard,
        address,
        contract: getContractInstance(address),
        onChainTokenId: String(chainTokenIdStr),
        tokenDbId: (data as any).id,
        ownerWallet: (data as any).owner_wallet_address,
    };
}

/**
 * Check on-chain ownership for either standard.
 * Returns { owned: true, currentOwner } — currentOwner is only meaningful for ERC-721.
 */
async function checkOnChainOwnership(args: {
    contract: ReturnType<typeof getContractInstance>;
    standard: NftStandard;
    tokenId: bigint;
    wallet: string;
}): Promise<{ owned: boolean; currentOwner?: string; balance?: bigint }> {
    if (args.standard === 'erc1155') {
        const bal = await readContract({
            contract: args.contract,
            method: 'function balanceOf(address account, uint256 id) view returns (uint256)',
            params: [args.wallet as `0x${string}`, args.tokenId],
        });
        const balance = BigInt(bal as any);
        return { owned: balance > 0n, balance };
    }
    const onChainOwner = await readContract({
        contract: args.contract,
        method: 'function ownerOf(uint256 tokenId) view returns (address)',
        params: [args.tokenId],
    });
    const owner = String(onChainOwner);
    return { owned: owner.toLowerCase() === args.wallet.toLowerCase(), currentOwner: owner };
}

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

/**
 * ERC-1155 TransferSingle event topic0:
 *   keccak256("TransferSingle(address,address,address,uint256,uint256)")
 * topics: [0]=sig, [1]=operator, [2]=from, [3]=to; data: tokenId (32b) || value (32b)
 */
const ERC1155_TRANSFER_SINGLE_TOPIC =
    '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';

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
    receipt: { logs: ReadonlyArray<{ address: string; topics: ReadonlyArray<string>; data?: string }> };
    nftContractAddress: string;
    standard: NftStandard;
    tokenId: bigint;
    buyer: string;
}): Promise<boolean> {
    const nftAddrLc = args.nftContractAddress.toLowerCase();
    const buyerTopic = addressToTopic(args.buyer);

    for (const log of args.receipt.logs) {
        if (!log?.address || log.address.toLowerCase() !== nftAddrLc) continue;
        const topics = log.topics || [];
        const topic0 = (topics[0] || '').toLowerCase();

        if (args.standard === 'erc721') {
            if (topics.length < 4) continue; // ERC-721 Transfer is indexed on all 3 params => 4 topics
            if (topic0 !== ERC721_TRANSFER_TOPIC) continue;
            if (topicToBigInt(topics[3]) !== args.tokenId) continue;
            if ((topics[2] || '').toLowerCase() !== buyerTopic) continue;
            return true;
        }

        // ERC-1155 TransferSingle: topics [sig, operator, from, to]; data = tokenId || value
        if (topic0 !== ERC1155_TRANSFER_SINGLE_TOPIC) continue;
        if (topics.length < 4) continue;
        if ((topics[3] || '').toLowerCase() !== buyerTopic) continue;
        const data = (log.data || '').replace(/^0x/, '');
        if (data.length < 128) continue;
        const tokenIdHex = '0x' + data.slice(0, 64);
        try {
            if (BigInt(tokenIdHex) === args.tokenId) return true;
        } catch {
            continue;
        }
    }

    // Safety-net fallback: the receipt didn't contain a matching Transfer log
    // (shouldn't happen for a successful buyFromListing, but be defensive).
    // Retry on-chain ownership read with backoff to let RPC catch up.
    try {
        const contract = getContractInstance(args.nftContractAddress);
        for (let attempt = 0; attempt < 3; attempt++) {
            await new Promise((r) => setTimeout(r, 2000));
            if (args.standard === 'erc721') {
                const onChainOwner = await readContract({
                    contract,
                    method: 'function ownerOf(uint256 tokenId) view returns (address)',
                    params: [args.tokenId],
                });
                if ((onChainOwner as string).toLowerCase() === args.buyer.toLowerCase()) {
                    console.log('[marketplace] Ownership confirmed via fallback ownerOf after attempt', attempt + 1);
                    return true;
                }
            } else {
                const bal = await readContract({
                    contract,
                    method: 'function balanceOf(address account, uint256 id) view returns (uint256)',
                    params: [args.buyer as `0x${string}`, args.tokenId],
                });
                if (BigInt(bal as any) > 0n) {
                    console.log('[marketplace] Ownership confirmed via fallback balanceOf after attempt', attempt + 1);
                    return true;
                }
            }
        }
    } catch (err: any) {
        console.warn('[marketplace] fallback ownership retry failed:', err?.message);
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
        // 1. Resolve the correct NFT contract for this token (legacy ERC-721 OR per-release ERC-1155).
        const resolved = await resolveNftContractForToken(config.nftTokenId);
        if (!resolved.ok) return { success: false, error: resolved.error };

        if (resolved.ownerWallet.toLowerCase() !== config.sellerWallet.toLowerCase()) {
            return { success: false, error: 'Not the token owner' };
        }

        const chainTokenIdStr = resolved.onChainTokenId;
        const nftContract = resolved.contract;
        const nftAddress = resolved.address;
        const standard = resolved.standard;

        // CRITICAL — verify on-chain ownership against the correct contract.
        // ERC-721: ownerOf(tokenId) must equal seller.
        // ERC-1155: balanceOf(seller, tokenId) must be > 0.
        try {
            const check = await checkOnChainOwnership({
                contract: nftContract,
                standard,
                tokenId: BigInt(chainTokenIdStr),
                wallet: config.sellerWallet,
            });
            if (!check.owned) {
                if (standard === 'erc721') {
                    return {
                        success: false,
                        error: `You do not own this NFT on-chain. Current on-chain owner: ${check.currentOwner}. Please refresh your collection.`,
                    };
                }
                return {
                    success: false,
                    error: 'You do not own any copies of this NFT on-chain. Please refresh your collection.',
                };
            }
        } catch (ownerErr: any) {
            console.warn('[marketplace] on-chain ownership check failed (non-blocking):', ownerErr?.message);
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

        // 2. Ensure marketplace approval on the CORRECT NFT contract.
        // setApprovalForAll has the same signature for ERC-721 and ERC-1155.
        const marketplaceAddr = CONTRACTS.MARKETPLACE as `0x${string}`;
        const isApproved = await readContract({
            contract: nftContract,
            method: 'function isApprovedForAll(address owner, address operator) view returns (bool)',
            params: [account.address as `0x${string}`, marketplaceAddr],
        });

        if (!isApproved) {
            console.log('[marketplace] Approving marketplace for NFT transfers on', nftAddress);
            const approveTx = prepareContractCall({
                contract: nftContract,
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
            assetContract: nftAddress as `0x${string}`,
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
        // 1. Fetch listing from DB (include release so we know the NFT contract + standard).
        const { data: listing } = await supabase
            .from('marketplace_listings')
            .select(`
                *,
                nft_token:nft_tokens!nft_token_id (
                    id, token_id, on_chain_token_id,
                    release:nft_releases!nft_release_id (nft_standard, contract_address)
                )
            `)
            .eq('id', config.listingId)
            .eq('is_active', true)
            .maybeSingle();

        if (!listing) return { success: false, error: 'Listing not found or inactive' };
        if (!listing.chain_listing_id) return { success: false, error: 'Listing has no on-chain ID' };

        const tokenRowInit: any = listing.nft_token;
        const releaseMeta: any = tokenRowInit?.release || {};
        const listingStandard: NftStandard = releaseMeta?.nft_standard === 'erc1155' ? 'erc1155' : 'erc721';
        const listingNftAddress: string = releaseMeta?.contract_address || CONTRACTS.SONG_NFT;
        const listingNftContract = getContractInstance(listingNftAddress);

        // ------------------------------------------------------------------
        // Buy-side self-heal preflight.
        //
        // If the listing is stale (token already moved on-chain) the
        // marketplace contract will revert 'invalid listing' and we waste
        // gas. For ERC-721: if ownerOf isn't seller or marketplace, it's
        // dead. For ERC-1155: if seller's balance is 0, they can't fulfill.
        // Detect before sending and auto-heal the DB.
        // ------------------------------------------------------------------
        try {
            const chainTokenIdForCheck = tokenRowInit?.on_chain_token_id || tokenRowInit?.token_id;
            if (chainTokenIdForCheck && /^\d+$/.test(String(chainTokenIdForCheck))) {
                const sellerLc = String(listing.seller_wallet).toLowerCase();
                const marketplaceLc = CONTRACTS.MARKETPLACE.toLowerCase();
                const tokenIdBn = BigInt(chainTokenIdForCheck);

                let stale = false;
                let currentOwnerLc: string | null = null;

                if (listingStandard === 'erc721') {
                    const currentOwner = await readContract({
                        contract: listingNftContract,
                        method: 'function ownerOf(uint256 tokenId) view returns (address)',
                        params: [tokenIdBn],
                    });
                    currentOwnerLc = String(currentOwner).toLowerCase();
                    stale = currentOwnerLc !== sellerLc && currentOwnerLc !== marketplaceLc;
                } else {
                    const bal = await readContract({
                        contract: listingNftContract,
                        method: 'function balanceOf(address account, uint256 id) view returns (uint256)',
                        params: [listing.seller_wallet as `0x${string}`, tokenIdBn],
                    });
                    stale = BigInt(bal as any) === 0n;
                }

                if (stale) {
                    console.warn(
                        '[marketplace] buy self-heal: listing', config.listingId,
                        'token', chainTokenIdForCheck,
                        'standard', listingStandard,
                        'seller', sellerLc,
                        'currentOwner', currentOwnerLc,
                        '— marking DB listing inactive (already sold).',
                    );
                    await supabase
                        .from('marketplace_listings')
                        .update({
                            is_active: false,
                            sold_at: new Date().toISOString(),
                            buyer_wallet: currentOwnerLc || undefined,
                        })
                        .eq('id', config.listingId);
                    return {
                        success: false,
                        error: 'This listing is no longer available — the NFT was already sold. The marketplace has been refreshed.',
                    };
                }
            }
        } catch (preflightErr: any) {
            // RPC hiccup — fall through and let the marketplace contract be
            // the final arbiter. Don't block a legitimate buy because of a
            // transient RPC error.
            console.warn('[marketplace] buy preflight ownerOf failed (non-fatal):', preflightErr?.message);
        }

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
                    nftContractAddress: listingNftAddress,
                    standard: listingStandard,
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
            .select(`
                chain_listing_id,
                nft_token:nft_tokens!nft_token_id (
                    id, token_id, on_chain_token_id,
                    release:nft_releases!nft_release_id (nft_standard, contract_address)
                )
            `)
            .eq('id', listingId)
            .eq('seller_wallet', sellerWallet.toLowerCase())
            .eq('is_active', true)
            .maybeSingle();

        if (!listing) return { success: false, error: 'Listing not found' };

        // ------------------------------------------------------------------
        // Self-heal preflight:
        //
        // If the seller no longer owns the NFT on-chain (e.g. the listing
        // was already fulfilled by a buyer but an earlier buy-flow run
        // failed to deactivate the DB row), the MarketplaceV3 contract will
        // revert the cancelListing tx with 'invalid listing' — wasting gas
        // and giving the user a confusing error.
        //
        // Detect that case here: read ownerOf(tokenId) on-chain. If the owner
        // is neither the seller nor the marketplace contract, the listing is
        // dead on-chain. Deactivate the DB row so the Manage UI stops
        // showing it, and return a clear, honest error message.
        //
        // On-chain is source of truth (rule #3).
        // ------------------------------------------------------------------
        const tokenRow: any = listing.nft_token;
        const chainTokenId = tokenRow?.on_chain_token_id || tokenRow?.token_id;
        const cancelReleaseMeta: any = tokenRow?.release || {};
        const cancelStandard: NftStandard = cancelReleaseMeta?.nft_standard === 'erc1155' ? 'erc1155' : 'erc721';
        const cancelNftAddress: string = cancelReleaseMeta?.contract_address || CONTRACTS.SONG_NFT;
        const cancelNftContract = getContractInstance(cancelNftAddress);

        if (chainTokenId && /^\d+$/.test(String(chainTokenId))) {
            try {
                const sellerLc = sellerWallet.toLowerCase();
                const marketplaceLc = CONTRACTS.MARKETPLACE.toLowerCase();
                const tokenIdBn = BigInt(chainTokenId);

                let stale = false;
                let ownerLc: string | null = null;

                if (cancelStandard === 'erc721') {
                    const onChainOwner = await readContract({
                        contract: cancelNftContract,
                        method: 'function ownerOf(uint256 tokenId) view returns (address)',
                        params: [tokenIdBn],
                    });
                    ownerLc = String(onChainOwner).toLowerCase();
                    stale = ownerLc !== sellerLc && ownerLc !== marketplaceLc;
                } else {
                    const bal = await readContract({
                        contract: cancelNftContract,
                        method: 'function balanceOf(address account, uint256 id) view returns (uint256)',
                        params: [sellerWallet as `0x${string}`, tokenIdBn],
                    });
                    stale = BigInt(bal as any) === 0n;
                }

                if (stale) {
                    // Seller no longer has the NFT. Listing is effectively dead — auto-heal.
                    console.warn(
                        '[marketplace] self-heal: listing', listingId,
                        'token', chainTokenId,
                        'standard', cancelStandard,
                        'seller', sellerLc,
                        'currentOwner', ownerLc,
                        '— marking DB listing inactive.',
                    );
                    await supabase
                        .from('marketplace_listings')
                        .update({
                            is_active: false,
                            sold_at: new Date().toISOString(),
                            buyer_wallet: ownerLc || undefined,
                        })
                        .eq('id', listingId);
                    return {
                        success: false,
                        error: 'This listing has already been fulfilled on-chain — the NFT was transferred to another wallet. Your collection has been refreshed.',
                    };
                }
            } catch (preflightErr: any) {
                // RPC hiccup — fall through and try the on-chain cancel anyway.
                console.warn('[marketplace] cancel preflight ownership read failed (non-fatal):', preflightErr?.message);
            }
        }

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
