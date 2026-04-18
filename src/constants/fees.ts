/**
 * MU6 Fee Model — Single Source of Truth
 *
 * All fee splits are enforced on-chain by the smart contracts we deploy/configure:
 *   - Secondary sales: split by MarketplaceV3 inside `buyFromListing` (atomic).
 *   - Primary sales (claim): split by DropERC1155 + thirdweb protocol fee recipient.
 *
 * These constants MUST mirror the on-chain configuration. If you change them here
 * without a corresponding contract redeploy / config change, the UI will drift
 * away from reality — so keep this file in lockstep with contract deployment.
 *
 * Verified against live Amoy txs:
 *   - 0x27e6133517e28ffc37ca5d042cee87a30b76475aee70151d99f0f2cb776a61c6
 *     (secondary sale: 3 POL listed → 2.775 POL to seller, ratio = 0.925)
 *   - 0x47fe1ea9a48582c97be9cb09f6c77c83982a73c351ce38121f27b446a7640a76
 *     (secondary sale: 0.5 POL listed → 0.4625 POL to seller, ratio = 0.925)
 */

// ── Basis points (1 bp = 0.01%) ─────────────────────────────────────────────
// Secondary sale (MarketplaceV3 buyFromListing)
//   Total must equal 10000 (100%).
export const SECONDARY_THIRDWEB_BPS = 50;    // 0.5% thirdweb protocol fee (hardcoded in MarketplaceV3 impl)
export const SECONDARY_MU6_BPS      = 200;   // 2.0% MU6 platform fee (configured on MarketplaceV3)
export const SECONDARY_ROYALTY_BPS  = 500;   // 5.0% EIP-2981 royalty (set per-token on NFT contract)
export const SECONDARY_SELLER_BPS   = 9250;  // 92.5% remainder → seller

// Primary sale (DropERC1155 claim)
//   Total must equal 10000 (100%).
export const PRIMARY_THIRDWEB_BPS = 200;   // 2.0% thirdweb platform fee
export const PRIMARY_MU6_BPS      = 500;   // 5.0% MU6 fee
export const PRIMARY_ARTIST_BPS   = 9300;  // 93.0% to primary sale recipient (artist)

// ── Runtime invariants (fail loud if constants drift) ───────────────────────
const SECONDARY_SUM =
    SECONDARY_THIRDWEB_BPS + SECONDARY_MU6_BPS + SECONDARY_ROYALTY_BPS + SECONDARY_SELLER_BPS;
const PRIMARY_SUM =
    PRIMARY_THIRDWEB_BPS + PRIMARY_MU6_BPS + PRIMARY_ARTIST_BPS;

if (SECONDARY_SUM !== 10000) {
    throw new Error(`[fees.ts] Secondary bps must sum to 10000, got ${SECONDARY_SUM}`);
}
if (PRIMARY_SUM !== 10000) {
    throw new Error(`[fees.ts] Primary bps must sum to 10000, got ${PRIMARY_SUM}`);
}

// ── Helpers: bps → decimal multiplier ───────────────────────────────────────
export function bpsToFraction(bps: number): number {
    return bps / 10000;
}

// ── Fee breakdown shape (consumed by UI + activity feed) ────────────────────
export interface FeeLine {
    label: string;
    bps: number;
    percentLabel: string; // e.g. "2%", "0.5%"
    amountEth: number;    // POL amount deducted
}

export interface FeeBreakdown {
    kind: 'primary' | 'secondary';
    grossEth: number;
    netEth: number;       // the amount that lands in the recipient wallet
    recipientRole: 'seller' | 'artist' | 'buyer';
    lines: FeeLine[];     // deductions (empty for buyer — buyer pays gross)
}

/**
 * Compute a full fee breakdown for a secondary sale from the seller's side.
 * Returns the net POL the seller receives + itemized deductions.
 */
export function computeSecondarySaleBreakdown(grossEth: number): FeeBreakdown {
    const thirdweb = grossEth * bpsToFraction(SECONDARY_THIRDWEB_BPS);
    const mu6      = grossEth * bpsToFraction(SECONDARY_MU6_BPS);
    const royalty  = grossEth * bpsToFraction(SECONDARY_ROYALTY_BPS);
    const netEth   = grossEth * bpsToFraction(SECONDARY_SELLER_BPS);
    return {
        kind: 'secondary',
        grossEth,
        netEth,
        recipientRole: 'seller',
        lines: [
            { label: 'Thirdweb protocol fee', bps: SECONDARY_THIRDWEB_BPS, percentLabel: '0.5%', amountEth: thirdweb },
            { label: 'MU6 platform fee',      bps: SECONDARY_MU6_BPS,      percentLabel: '2%',   amountEth: mu6 },
            { label: 'Artist royalty',        bps: SECONDARY_ROYALTY_BPS,  percentLabel: '5%',   amountEth: royalty },
        ],
    };
}

/**
 * Breakdown from the buyer's side of a secondary sale.
 * Buyer pays gross; fees are informational ("where your POL went").
 */
export function computeSecondaryPurchaseBreakdown(grossEth: number): FeeBreakdown {
    const seller   = grossEth * bpsToFraction(SECONDARY_SELLER_BPS);
    const thirdweb = grossEth * bpsToFraction(SECONDARY_THIRDWEB_BPS);
    const mu6      = grossEth * bpsToFraction(SECONDARY_MU6_BPS);
    const royalty  = grossEth * bpsToFraction(SECONDARY_ROYALTY_BPS);
    return {
        kind: 'secondary',
        grossEth,
        netEth: grossEth, // buyer's wallet decreased by the full gross (plus gas)
        recipientRole: 'buyer',
        lines: [
            { label: 'To seller',             bps: SECONDARY_SELLER_BPS,   percentLabel: '92.5%', amountEth: seller },
            { label: 'Artist royalty',        bps: SECONDARY_ROYALTY_BPS,  percentLabel: '5%',    amountEth: royalty },
            { label: 'MU6 platform fee',      bps: SECONDARY_MU6_BPS,      percentLabel: '2%',    amountEth: mu6 },
            { label: 'Thirdweb protocol fee', bps: SECONDARY_THIRDWEB_BPS, percentLabel: '0.5%',  amountEth: thirdweb },
        ],
    };
}

/**
 * Breakdown for a primary sale (mint/claim).
 * Returns the buyer-side view: gross = netEth (buyer pays gross) with informational fee lines.
 */
export function computePrimaryPurchaseBreakdown(grossEth: number): FeeBreakdown {
    const artist   = grossEth * bpsToFraction(PRIMARY_ARTIST_BPS);
    const thirdweb = grossEth * bpsToFraction(PRIMARY_THIRDWEB_BPS);
    const mu6      = grossEth * bpsToFraction(PRIMARY_MU6_BPS);
    return {
        kind: 'primary',
        grossEth,
        netEth: grossEth,
        recipientRole: 'buyer',
        lines: [
            { label: 'To artist',             bps: PRIMARY_ARTIST_BPS,   percentLabel: '93%', amountEth: artist },
            { label: 'MU6 platform fee',      bps: PRIMARY_MU6_BPS,      percentLabel: '5%',  amountEth: mu6 },
            { label: 'Thirdweb platform fee', bps: PRIMARY_THIRDWEB_BPS, percentLabel: '2%',  amountEth: thirdweb },
        ],
    };
}

/** Format POL amount for display (trims trailing zeros, keeps up to 4 decimals). */
export function formatPol(amount: number): string {
    if (!isFinite(amount)) return '0';
    const fixed = amount.toFixed(4);
    // Trim trailing zeros and trailing dot
    return fixed.replace(/\.?0+$/, '') || '0';
}
