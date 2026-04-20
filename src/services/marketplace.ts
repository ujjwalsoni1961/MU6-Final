/**
 * MU6 Marketplace Service
 *
 * On-chain secondary sale operations via MarketplaceV3 (direct listings).
 * Replaces the old DB-only marketplace flow with on-chain listing, buying, and cancellation.
 *
 * Revenue split on secondary sales (single source of truth: src/constants/fees.ts):
 *   - SECONDARY_SELLER_BPS    = 9250 (92.5%) → seller
 *   - SECONDARY_ROYALTY_BPS   =  500 (5.0%)  → artist royalty via EIP-2981 (per-token)
 *   - SECONDARY_MU6_BPS       =  200 (2.0%)  → MU6 platform fee (MarketplaceV3 config)
 *   - SECONDARY_THIRDWEB_BPS  =   50 (0.5%)  → thirdweb protocol fee (hardcoded in impl)
 *
 * The sum = 10000 bps, and MarketplaceV3 distributes funds atomically within the
 * buyFromListing tx — no post-buy payout step on our side. Verified on Amoy tx
 * 0x27e6133517e28ffc37ca5d042cee87a30b76475aee70151d99f0f2cb776a61c6.
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
import { SECONDARY_ROYALTY_BPS } from '../constants/fees';

/**
 * Resolve the NFT contract (address + thirdweb handle) for a given
 * nft_tokens row. Every release lives on a DropERC1155 contract identified
 * by nft_releases.contract_address. Falls back to CONTRACTS.SONG_NFT if
 * the column is NULL (shouldn't happen in practice post-migration 040).
 *
 * Every on-chain op (balanceOf / setApprovalForAll / createListing) must
 * target the release's contract_address — the default SONG_NFT is just a
 * safety net.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ADDR_RE = /^0x[0-9a-f]{40}$/i;
const NUMERIC_RE = /^\d+$/;

/**
 * Resolve the on-chain identity of an NFT the user wants to list.
 *
 * Chain-first, DB-as-ledger-cache philosophy:
 *   - If we're given a real `nft_tokens.id` UUID, look up the row and use it.
 *   - Otherwise fall back to the canonical (contract, on_chain_token_id)
 *     pair — the REAL identity of the ERC-1155 token — and either find the
 *     matching ledger row for the seller or self-heal by inserting one.
 *
 * Either path ends with a valid `tokenDbId` the marketplace can FK-reference
 * in `marketplace_listings.nft_token_id`. That insert is non-negotiable for
 * the DB schema; returning empty string is never safe.
 */
async function resolveNftContractForToken(
    args: {
        nftTokenId?: string;
        contractAddress?: string;
        onChainTokenId?: string;
        sellerWallet: string;
    },
): Promise<
    | { ok: true; address: string; contract: ReturnType<typeof getContractInstance>; onChainTokenId: string; tokenDbId: string; ownerWallet: string }
    | { ok: false; error: string }
> {
    // ── Path A: DB UUID known and well-formed ──
    if (args.nftTokenId && UUID_RE.test(args.nftTokenId)) {
        const { data, error } = await supabase
            .from('nft_tokens')
            .select(`
                id,
                token_id,
                on_chain_token_id,
                owner_wallet_address,
                release:nft_releases!nft_release_id (
                    contract_address
                )
            `)
            .eq('id', args.nftTokenId)
            .maybeSingle();

        if (!error && data) {
            const chainTokenIdStr = (data as any).on_chain_token_id;
            if (chainTokenIdStr && NUMERIC_RE.test(String(chainTokenIdStr))) {
                const release: any = (data as any).release;
                const address: string = release?.contract_address || CONTRACTS.SONG_NFT;
                return {
                    ok: true,
                    address,
                    contract: getContractInstance(address),
                    onChainTokenId: String(chainTokenIdStr),
                    tokenDbId: (data as any).id,
                    ownerWallet: (data as any).owner_wallet_address,
                };
            }
        }
        // If the UUID lookup failed silently (no row / bad row) and we also
        // have a (contract, tokenId) pair, fall through to the chain-first
        // branch below instead of surfacing a misleading error.
    }

    // ── Path B: chain-first (contract, tokenId) pair ──
    if (!args.contractAddress || !HEX_ADDR_RE.test(args.contractAddress)) {
        return { ok: false, error: 'Cannot identify this NFT. Please refresh your collection and try again.' };
    }
    if (!args.onChainTokenId || !NUMERIC_RE.test(String(args.onChainTokenId))) {
        return { ok: false, error: 'Cannot identify this NFT on-chain. Please refresh your collection and try again.' };
    }

    const contractAddrLc = args.contractAddress.toLowerCase();
    const tokenIdStr = String(args.onChainTokenId);
    const sellerLc = args.sellerWallet.toLowerCase();

    // B1. Find the release this (contract, tokenId) belongs to so we satisfy
    // the NOT NULL FK on nft_tokens.nft_release_id when self-healing.
    const { data: releaseRow, error: releaseErr } = await supabase
        .from('nft_releases')
        .select('id, contract_address, token_id')
        .ilike('contract_address', contractAddrLc)
        .eq('token_id', Number(tokenIdStr))
        .maybeSingle();
    if (releaseErr || !releaseRow) {
        return { ok: false, error: 'This NFT is not registered for listing.' };
    }

    // B2. Prefer an existing ledger row this wallet already owns for this pair.
    const { data: existingToken } = await supabase
        .from('nft_tokens')
        .select('id, owner_wallet_address, on_chain_token_id, nft_release_id')
        .eq('nft_release_id', releaseRow.id)
        .eq('on_chain_token_id', tokenIdStr)
        .eq('owner_wallet_address', sellerLc)
        .eq('is_voided', false)
        .order('minted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    let tokenDbId: string;
    let ownerWallet: string;
    if (existingToken?.id) {
        tokenDbId = existingToken.id;
        ownerWallet = existingToken.owner_wallet_address;
    } else {
        // B3. Self-heal: insert a minimal ledger row so downstream FK inserts
        // succeed. We do NOT set mint_tx_hash (that's sacred for attribution
        // — see migration 041). This row represents the wallet holding the
        // token on-chain "now", which is exactly what ownership tracking is
        // supposed to reflect.
        const { data: inserted, error: insertErr } = await supabase
            .from('nft_tokens')
            .insert({
                nft_release_id: releaseRow.id,
                token_id: tokenIdStr,
                on_chain_token_id: tokenIdStr,
                owner_wallet_address: sellerLc,
                is_voided: false,
            })
            .select('id, owner_wallet_address')
            .single();
        if (insertErr || !inserted) {
            return { ok: false, error: insertErr?.message || 'Could not prepare NFT for listing' };
        }
        tokenDbId = inserted.id;
        ownerWallet = inserted.owner_wallet_address;
    }

    const address = releaseRow.contract_address || args.contractAddress;
    return {
        ok: true,
        address,
        contract: getContractInstance(address),
        onChainTokenId: tokenIdStr,
        tokenDbId,
        ownerWallet,
    };
}

/**
 * Check on-chain ERC-1155 ownership. Returns { owned, balance }.
 */
async function checkOnChainOwnership(args: {
    contract: ReturnType<typeof getContractInstance>;
    tokenId: bigint;
    wallet: string;
}): Promise<{ owned: boolean; balance: bigint }> {
    const bal = await readContract({
        contract: args.contract,
        method: 'function balanceOf(address account, uint256 id) view returns (uint256)',
        params: [args.wallet as `0x${string}`, args.tokenId],
    });
    const balance = BigInt(bal as any);
    return { owned: balance > 0n, balance };
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
    royaltyBps: string = String(SECONDARY_ROYALTY_BPS),
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

/**
 * Verify an ERC-1155 ownership transfer happened inside a tx receipt.
 *
 * Rationale: after a buy tx is mined, calling readContract(ownerOf) can hit
 * a stale RPC node that hasn't indexed the just-mined block yet, returning
 * the pre-transfer owner. The receipt logs, however, are definitive — they
 * ARE the events emitted in that exact tx. So we parse the receipt directly.
 *
 * Returns true iff we find at least one TransferSingle log where:
 *   - log.address   == the NFT contract
 *   - topics[0]     == ERC-1155 TransferSingle signature
 *   - topics[3]     == buyer (padded)
 *   - data[0..32]   == tokenId
 */
async function verifyBuyOwnershipTransfer(args: {
    receipt: { logs: ReadonlyArray<{ address: string; topics: ReadonlyArray<string>; data?: string }> };
    nftContractAddress: string;
    tokenId: bigint;
    buyer: string;
}): Promise<boolean> {
    const nftAddrLc = args.nftContractAddress.toLowerCase();
    const buyerTopic = addressToTopic(args.buyer);

    for (const log of args.receipt.logs) {
        if (!log?.address || log.address.toLowerCase() !== nftAddrLc) continue;
        const topics = log.topics || [];
        const topic0 = (topics[0] || '').toLowerCase();

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

    // Safety-net fallback: the receipt didn't contain a matching TransferSingle
    // log (shouldn't happen for a successful buyFromListing, but be defensive).
    // Retry on-chain ownership via balanceOf with backoff to let RPC catch up.
    try {
        const contract = getContractInstance(args.nftContractAddress);
        for (let attempt = 0; attempt < 3; attempt++) {
            await new Promise((r) => setTimeout(r, 2000));
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
        /**
         * Preferred: DB UUID of the nft_tokens row. May be empty when the
         * collection view discovered the copy chain-first and no ledger row
         * exists yet — in that case the resolver falls back to (contract,
         * onChainTokenId) and self-heals the ledger.
         */
        nftTokenId: string;
        pricePol: number;     // listing price in POL
        sellerWallet: string;
        /** Chain-first fallback pair; used when nftTokenId is missing */
        contractAddress?: string;
        onChainTokenId?: string;
    },
    account: Account,
): Promise<{ success: boolean; listingId?: string; error?: string }> {
    try {
        // 1. Resolve the ERC-1155 contract + tokenId for this NFT row.
        const resolved = await resolveNftContractForToken({
            nftTokenId: config.nftTokenId,
            contractAddress: config.contractAddress,
            onChainTokenId: config.onChainTokenId,
            sellerWallet: config.sellerWallet,
        });
        if (!resolved.ok) return { success: false, error: resolved.error };

        if (resolved.ownerWallet.toLowerCase() !== config.sellerWallet.toLowerCase()) {
            return { success: false, error: 'Not the token owner' };
        }

        // Use the RESOLVED UUID downstream — critical when the caller passed
        // an empty string and the resolver self-healed a new ledger row.
        const resolvedTokenDbId = resolved.tokenDbId;
        const chainTokenIdStr = resolved.onChainTokenId;
        const nftContract = resolved.contract;
        const nftAddress = resolved.address;

        // CRITICAL — verify on-chain ownership (ERC-1155 balanceOf(seller, tokenId) > 0).
        try {
            const check = await checkOnChainOwnership({
                contract: nftContract,
                tokenId: BigInt(chainTokenIdStr),
                wallet: config.sellerWallet,
            });
            if (!check.owned) {
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
            .eq('nft_token_id', resolvedTokenDbId)
            .eq('is_active', true)
            .maybeSingle();

        if (existingListing) {
            return { success: false, error: 'This NFT already has an active listing.' };
        }

        // 2. Ensure marketplace approval on the release's ERC-1155 contract.
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
                nft_token_id: resolvedTokenDbId,
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
 *   - Payment: buyer pays → seller (92.5%) + royalty (5%) + MU6 platform (2%) + thirdweb protocol (0.5%)
 *
 * After tx confirms, update DB records as cache/index of on-chain state.
 * NO royalty_events/royalty_shares created — the Split contract handles artist royalties.
 */
export async function buyMarketplaceListing(
    config: { listingId: string; buyerWallet: string },
    account: Account,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
        // 1. Fetch listing from DB (include release so we know the NFT contract).
        const { data: listing } = await supabase
            .from('marketplace_listings')
            .select(`
                *,
                nft_token:nft_tokens!nft_token_id (
                    id, token_id, on_chain_token_id,
                    release:nft_releases!nft_release_id (contract_address)
                )
            `)
            .eq('id', config.listingId)
            .eq('is_active', true)
            .maybeSingle();

        if (!listing) return { success: false, error: 'Listing not found or inactive' };
        if (!listing.chain_listing_id) return { success: false, error: 'Listing has no on-chain ID' };

        const tokenRowInit: any = listing.nft_token;
        const releaseMeta: any = tokenRowInit?.release || {};
        const listingNftAddress: string = releaseMeta?.contract_address || CONTRACTS.SONG_NFT;
        const listingNftContract = getContractInstance(listingNftAddress);

        // ------------------------------------------------------------------
        // Buy-side self-heal preflight.
        //
        // If the listing is stale (seller no longer holds a copy on-chain)
        // the marketplace contract will revert 'invalid listing' and we
        // waste gas. Detect via ERC-1155 balanceOf and auto-heal the DB.
        // ------------------------------------------------------------------
        try {
            const chainTokenIdForCheck = tokenRowInit?.on_chain_token_id || tokenRowInit?.token_id;
            if (chainTokenIdForCheck && /^\d+$/.test(String(chainTokenIdForCheck))) {
                const sellerLc = String(listing.seller_wallet).toLowerCase();
                const tokenIdBn = BigInt(chainTokenIdForCheck);

                const bal = await readContract({
                    contract: listingNftContract,
                    method: 'function balanceOf(address account, uint256 id) view returns (uint256)',
                    params: [listing.seller_wallet as `0x${string}`, tokenIdBn],
                });
                const stale = BigInt(bal as any) === 0n;

                if (stale) {
                    console.warn(
                        '[marketplace] buy self-heal: listing', config.listingId,
                        'token', chainTokenIdForCheck,
                        'seller', sellerLc,
                        '— marking DB listing inactive (already sold).',
                    );
                    await supabase
                        .from('marketplace_listings')
                        .update({
                            is_active: false,
                            sold_at: new Date().toISOString(),
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
            console.warn('[marketplace] buy preflight balanceOf failed (non-fatal):', preflightErr?.message);
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
        // We parse the ERC-1155 TransferSingle event directly from the receipt
        // logs. This is the source of truth for the transfer that just happened
        // in this specific tx — whereas a follow-up readContract(balanceOf) call
        // can hit a stale RPC node that hasn't indexed the just-mined block yet
        // and return the pre-transfer balance (RPC indexing race).
        try {
            const tokenRow: any = listing.nft_token;
            const chainTokenId = tokenRow?.on_chain_token_id || tokenRow?.token_id;
            if (chainTokenId && /^\d+$/.test(chainTokenId)) {
                const ownershipOk = await verifyBuyOwnershipTransfer({
                    receipt: buyReceipt,
                    nftContractAddress: listingNftAddress,
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
        // Mark listing as sold.
        //
        // sale_tx_hash is the authoritative link between this DB row and the
        // on-chain buy that funded it — without it, reconciliation against
        // on-chain fund distribution (artist royalty, platform fee, seller
        // payout) requires a full log scan of MarketplaceV3. Always persist.
        {
            const { error: listingUpdateErr } = await supabase
                .from('marketplace_listings')
                .update({
                    is_active: false,
                    sold_at: now,
                    buyer_wallet: config.buyerWallet.toLowerCase(),
                    sale_tx_hash: txHash,
                })
                .eq('id', config.listingId);
            if (listingUpdateErr) {
                // Non-fatal: the buy succeeded on-chain. Log loudly so ops can
                // backfill if this path starts failing.
                console.error(
                    '[marketplace] FAILED to persist sale_tx_hash on listing',
                    config.listingId,
                    '— tx is',
                    txHash,
                    'error:',
                    listingUpdateErr.message,
                );
            }
        }

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

        // Post-buy DB ledger note (ERC-1155).
        //
        // Previously this block did a mass UPDATE on nft_tokens keyed by
        // on_chain_token_id, rewriting EVERY row for that tokenId to point
        // at the buyer. For ERC-721 that would be correct (one token, one
        // owner). For ERC-1155 it is catastrophically wrong: the same
        // on_chain_token_id can legitimately have many ledger rows — one
        // per holder, per claim event — and mass-reassigning them clobbered
        // the records of every other holder, so the buyer's /collection
        // page showed phantom duplicate cards for copies they didn't
        // actually own more of.
        //
        // The correct behaviour for a marketplace buy of N copies is:
        //   - Primary update above (keyed by listing.nft_token_id) already
        //     reassigned the specific ledger row this listing was backed
        //     by — that represents the N copies that just moved.
        //   - Other holders' rows are left untouched; their balances on
        //     chain are unchanged by this transaction.
        //
        // The collection view (useOwnedNFTsWithStatus) treats nft_tokens as
        // a hint and uses on-chain balanceOf(wallet, tokenId) as the sole
        // source of truth for quantity — so even if the ledger drifts, the
        // UI stays honest. That is the "on-chain is source of truth" rule.
        //
        // If we ever need stronger ledger integrity for reporting, the
        // correct shape is: sync a single row per (wallet, contract,
        // on_chain_token_id) using on-chain Transfer events as the input
        // — NOT a mass UPDATE by on_chain_token_id from the buy flow.

        // NOTE: NO royalty_events/royalty_shares creation here.
        // MarketplaceV3 handles fund distribution atomically inside buyFromListing:
        //   - 92.5% to seller
        //   -  5.0% royalty via EIP-2981 to the royalty recipient set per-token
        //   -  2.0% platform fee to the MU6 server wallet
        //   -  0.5% thirdweb protocol fee (hardcoded, non-configurable)

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
                    release:nft_releases!nft_release_id (contract_address)
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
        const cancelNftAddress: string = cancelReleaseMeta?.contract_address || CONTRACTS.SONG_NFT;
        const cancelNftContract = getContractInstance(cancelNftAddress);

        if (chainTokenId && /^\d+$/.test(String(chainTokenId))) {
            try {
                const sellerLc = sellerWallet.toLowerCase();
                const tokenIdBn = BigInt(chainTokenId);

                const bal = await readContract({
                    contract: cancelNftContract,
                    method: 'function balanceOf(address account, uint256 id) view returns (uint256)',
                    params: [sellerWallet as `0x${string}`, tokenIdBn],
                });
                const stale = BigInt(bal as any) === 0n;

                if (stale) {
                    // Seller no longer has the NFT. Listing is effectively dead — auto-heal.
                    console.warn(
                        '[marketplace] self-heal: listing', listingId,
                        'token', chainTokenId,
                        'seller', sellerLc,
                        '— marking DB listing inactive.',
                    );
                    await supabase
                        .from('marketplace_listings')
                        .update({
                            is_active: false,
                            sold_at: new Date().toISOString(),
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

    // Secondary-sale royalty to the creator wallet (bps from src/constants/fees.ts)
    return callSetRoyalty(creator.wallet_address, String(SECONDARY_ROYALTY_BPS));
}
