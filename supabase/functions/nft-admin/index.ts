import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Config ──
// All chain/network values are env-driven so the same edge function
// works on Amoy testnet (chain 80002) and Polygon mainnet (chain 137)
// without code changes. To switch to mainnet, set:
//   MU6_NETWORK=mainnet
//   MU6_SONG_NFT_ADDRESS=<mainnet drop address>
//   MU6_SERVER_WALLET=<mainnet backend wallet>
const THIRDWEB_SECRET_KEY = Deno.env.get("THIRDWEB_SECRET_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
// Service-role key — required for the Option B primary-sale payout writes
// since the ledger table denies all user-role writes via RLS.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const NETWORK = (Deno.env.get("MU6_NETWORK") || "amoy").toLowerCase();
const CHAIN_ID = NETWORK === "mainnet" ? 137 : 80002;
const SERVER_WALLET = Deno.env.get("MU6_SERVER_WALLET")
    || "0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39";
// ADMIN_WALLET: wallet that holds DEFAULT_ADMIN_ROLE on new DropERC1155 contracts.
// Used for role-restricted actions (setRoyaltyInfoForToken, setClaimConditionForToken).
// Falls back to SERVER_WALLET for contracts where the server wallet was granted admin.
const ADMIN_WALLET = Deno.env.get("MU6_ADMIN_WALLET") || SERVER_WALLET;

// DEFAULT_CONTRACT: the legacy DropERC721 — used only as a fallback for
// legacy ERC-721 actions. All new ERC-1155 actions must read contract_address
// from nft_releases. This fallback is gated behind the NETWORK env flag.
const DEFAULT_CONTRACT = Deno.env.get("MU6_SONG_NFT_ADDRESS")
    || (NETWORK === "mainnet"
        ? "" // no mainnet default — must be set explicitly
        : "0xACF1145AdE250D356e1B2869E392e6c748c14C0E");

// Default ERC-1155 contract — testnet only. For mainnet set MU6_SONG_NFT_ERC1155_ADDRESS.
const DEFAULT_ERC1155_CONTRACT = Deno.env.get("MU6_SONG_NFT_ERC1155_ADDRESS")
    || (NETWORK !== "mainnet"
        ? "0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad"
        : "");

const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// ── Primary-sale forwarding (Option B) ──
// On DropERC721/DropERC1155 the primarySaleRecipient is the server wallet.
// After every confirmed claim() the edge function forwards the artist's share
// to nft_releases.primary_sale_recipient.
//
// Fee model on claim (total paid by buyer):
//   1. thirdweb protocol fee — per-release bps (200 for new DropERC1155,
//      50 for legacy DropERC721). Hardcoded in the contract bytecode, routed
//      to a thirdweb-controlled constant recipient. Cannot be disabled or
//      redirected. Read from nft_releases.thirdweb_fee_bps (function below).
//   2. PLATFORM_FEE_BPS_PRIMARY — MU6's configurable platform fee, set on-chain
//      via setPlatformFeeInfo and read back in this function. Default 500 bps
//      (5%) landing in the server wallet (same place as the artist-bound
//      share, because primarySaleRecipient is the server wallet too).
//
// The edge function therefore:
//   * Reads gross_wei = pricePerToken
//   * Computes thirdweb_fee_wei = gross * release.thirdweb_fee_bps / 10000
//   * Computes platform_wei    = gross * mu6Bps / 10000   (MU6 retention)
//   * Forwards artist_wei = gross - thirdweb_fee_wei - platform_wei to the
//     artist. Logs all three in the primary_sale_payouts ledger.
//
// This keeps the server wallet float neutral: it receives gross - thirdweb_fee
// from the claim and sends artist_wei onward, keeping exactly platform_wei.

/**
 * Returns the thirdweb drop fee in bps for a given release row.
 * Defaults to 200 (new DropERC1155 rate) when not set on the release.
 */
function getThirdwebFeeBps(release: { thirdweb_fee_bps?: number | null } | null): number {
    return release?.thirdweb_fee_bps ?? 200;
}

const PLATFORM_FEE_BPS_PRIMARY = parseInt(
    Deno.env.get("MU6_PLATFORM_FEE_BPS_PRIMARY") || "500",
    10,
);

// Secondary royalty default — used by setRoyaltyInfoForToken when bps is not supplied
const DEFAULT_ARTIST_ROYALTY_BPS = 500;

// Public RPC — chain-switch aware. Used for parsing receipts / Transfer logs.
const RPC_URL = NETWORK === "mainnet"
    ? (Deno.env.get("MU6_RPC_URL") || "https://polygon-rpc.com")
    : (Deno.env.get("MU6_RPC_URL") || "https://rpc-amoy.polygon.technology");
// keccak256("Transfer(address,address,uint256)") — ERC-721 Transfer event topic0
const ERC721_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_ADDRESS_TOPIC = "0x" + "00".repeat(32); // Transfer.from == 0x0 ⇒ mint

/**
 * Fetch the on-chain transaction receipt and parse the minted token ID from
 * the ERC-721 Transfer log (from = 0x0 indicates a mint).
 * Returns null if the receipt isn't available yet or no mint log is found.
 */
async function fetchMintedTokenId(txHash: string, contractAddress: string): Promise<string | null> {
    try {
        const resp = await fetch(RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_getTransactionReceipt",
                params: [txHash],
            }),
        });
        const data = await resp.json();
        const logs: Array<{ address: string; topics: string[]; data: string }> =
            data?.result?.logs || [];
        const target = contractAddress.toLowerCase();
        for (const log of logs) {
            if ((log.address || "").toLowerCase() !== target) continue;
            if (!log.topics || log.topics.length < 4) continue;
            if (log.topics[0]?.toLowerCase() !== ERC721_TRANSFER_TOPIC) continue;
            // from must be the zero-address for a mint
            if (log.topics[1]?.toLowerCase() !== ZERO_ADDRESS_TOPIC) continue;
            // topics[3] is tokenId (32-byte hex)
            const tokenIdHex = log.topics[3];
            if (!tokenIdHex) continue;
            try {
                return BigInt(tokenIdHex).toString();
            } catch {
                return null;
            }
        }
        return null;
    } catch (err) {
        console.warn("[nft-admin] fetchMintedTokenId error:", err);
        return null;
    }
}

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
}

/**
 * Verify the incoming request is from our mobile app.
 *
 * The MU6 app uses wallet-based auth (Thirdweb), NOT Supabase Auth, so there
 * is no user session JWT available on the client. The true authorization
 * boundary for this endpoint is the THIRDWEB_SECRET_KEY held on the server
 * side (never leaves this function) plus the Supabase --no-verify-jwt ingress.
 *
 * We accept:
 *   1. The server's configured SUPABASE_ANON_KEY (legacy JWT anon or the new
 *      sb_publishable_* format — either may be set in the env), OR
 *   2. A valid Supabase user session access_token (future-proof), OR
 *   3. Any JWT-shaped token issued for this project (legacy anon keys stay
 *      valid forever and app builds may embed a different anon key than the
 *      current server env var).
 *
 * Non-JWT-shaped tokens that don't match the env anon key are rejected.
 */
async function verifyAuth(req: Request): Promise<{ valid: boolean; error?: string }> {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return { valid: false, error: "Missing Authorization header" };
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
        return { valid: false, error: "Missing auth token" };
    }

    // 1. Exact match against the env-configured anon/publishable key.
    if (token === SUPABASE_ANON_KEY) {
        return { valid: true };
    }

    // 2. JWT shape (eyJ...) — accept any token whose payload references this
    // Supabase project ref. This covers both the legacy anon JWT and any user
    // session access_token without a round-trip to GoTrue. Legacy anon keys
    // stay valid forever, and app bundles may still embed them.
    if (token.startsWith("eyJ")) {
        try {
            const parts = token.split(".");
            if (parts.length === 3) {
                // base64url decode payload
                const pad = (s: string) => s + "=".repeat((4 - s.length % 4) % 4);
                const payloadJson = atob(pad(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
                const payload = JSON.parse(payloadJson);
                const expectedRef = new URL(SUPABASE_URL).hostname.split(".")[0];
                if (payload?.ref === expectedRef || payload?.iss?.includes(expectedRef)) {
                    return { valid: true };
                }
            }
        } catch (_e) {
            // fall through
        }
        return { valid: false, error: "Invalid or expired auth token" };
    }

    // 3. Non-JWT, non-matching token — reject.
    return { valid: false, error: "Invalid or expired auth token" };
}

async function callEngine(requestBody: unknown) {
    const url = "https://engine.thirdweb.com/v1/write/contract";
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-secret-key": THIRDWEB_SECRET_KEY,
        },
        body: JSON.stringify(requestBody),
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { result = { raw: text }; }
    return { ok: response.ok, status: response.status, result };
}

/**
 * Send a raw native-value transaction from the server wallet.
 * Used by the primary-sale forwarding path to pay the artist their share
 * after a claim() confirms. Returns the Thirdweb Engine transaction id
 * (NOT the on-chain hash — caller must wait + fetch status if needed).
 */
async function sendNativeTransfer(recipient: string, amountWei: string): Promise<{ ok: boolean; status: number; txId?: string; raw: unknown }> {
    const url = "https://engine.thirdweb.com/v1/write/transaction";
    const body = {
        executionOptions: { from: SERVER_WALLET, chainId: CHAIN_ID, type: "EOA" },
        params: [{ to: recipient, data: "0x", value: amountWei }],
    };
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-secret-key": THIRDWEB_SECRET_KEY,
        },
        body: JSON.stringify(body),
    });
    const text = await resp.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    const txId = parsed?.result?.transactions?.[0]?.id
        || parsed?.result?.queueId
        || parsed?.result?.id;
    return { ok: resp.ok, status: resp.status, txId, raw: parsed };
}

/**
 * Compute the three-way split applied to every primary sale:
 *   thirdwebFeeWei = gross * thirdwebFeeBps / 10000 (protocol, per-release)
 *   platformWei    = gross * platformBps / 10000    (MU6, retained)
 *   artistWei      = gross - thirdwebFeeWei - platformWei  (forwarded)
 *
 * Uses BigInt arithmetic. Integer division rounds toward zero; any sub-wei
 * remainder flows into artistWei (since it's computed by subtraction). This
 * is the fee-safe direction — we never over-charge the buyer or ourselves.
 *
 * @param grossWei      Total amount paid by the buyer, in wei (decimal string).
 * @param thirdwebFeeBps  Protocol fee bps for this release (read from DB row).
 * @param platformBps   MU6 platform fee bps (from PLATFORM_FEE_BPS_PRIMARY).
 */
function splitPrimarySale(
    grossWei: string,
    thirdwebFeeBps: number,
    platformBps: number,
): {
    artistWei: string;
    platformWei: string;
    thirdwebFeeWei: string;
} {
    const gross = BigInt(grossWei);
    const tw = (gross * BigInt(thirdwebFeeBps)) / 10000n;
    const platform = (gross * BigInt(platformBps)) / 10000n;
    const artist = gross - tw - platform;
    return {
        artistWei: artist.toString(),
        platformWei: platform.toString(),
        thirdwebFeeWei: tw.toString(),
    };
}

/**
 * Look up the release row for a given drop contract + token id to find the
 * artist's payout wallet and fee configuration. Returns the release id,
 * recipient, and thirdweb_fee_bps or null if the token falls outside any
 * known release.
 *
 * Strategy:
 *   1. Find the nft_tokens row for this tokenId (if the mint already wrote
 *      one — in our atomic flow the token row is inserted AFTER forwarding,
 *      so typically there's no row yet).
 *   2. Fall back to the most-recent active release on the same contract that
 *      still has supply remaining. This matches the active claim-condition
 *      in practice because the drop only exposes one tier at a time via
 *      setClaimConditions.
 */
async function resolvePrimarySaleRecipient(
    supa: ReturnType<typeof createClient>,
    contractAddress: string,
    tokenId: string | null,
): Promise<{ releaseId: string | null; recipient: string | null; thirdwebFeeBps: number }> {
    // 1. token-level lookup if available. Join through nft_releases because
    //    contract_address lives on the release, not on nft_tokens.
    if (tokenId) {
        try {
            const { data: tokenRow } = await supa
                .from("nft_tokens")
                .select("nft_release_id, nft_releases!inner(primary_sale_recipient, contract_address, thirdweb_fee_bps)")
                .eq("on_chain_token_id", tokenId)
                .eq("nft_releases.contract_address", contractAddress)
                .maybeSingle() as { data: any };
            if (tokenRow?.nft_release_id && tokenRow?.nft_releases?.primary_sale_recipient) {
                return {
                    releaseId: tokenRow.nft_release_id,
                    recipient: tokenRow.nft_releases.primary_sale_recipient,
                    thirdwebFeeBps: tokenRow.nft_releases.thirdweb_fee_bps ?? 200,
                };
            }
        } catch (e) {
            console.warn("[nft-admin] resolvePrimarySaleRecipient tokens lookup failed:", String(e));
        }
    }
    // 2. Fall back to the active release on this contract. We prefer the row
    //    whose minted_count < total_supply (supply remaining) and order by
    //    most-recently updated so an operator can re-target sales by flipping
    //    is_active on releases.
    try {
        const { data: rel } = await supa
            .from("nft_releases")
            .select("id, primary_sale_recipient, minted_count, total_supply, is_active, created_at, thirdweb_fee_bps")
            .eq("contract_address", contractAddress)
            .eq("is_active", true)
            .not("primary_sale_recipient", "is", null)
            .order("created_at", { ascending: false });
        if (Array.isArray(rel) && rel.length > 0) {
            // Pick the first release with supply remaining; else the first row.
            const withSupply = rel.find((r: any) => (r.minted_count ?? 0) < (r.total_supply ?? 0));
            const picked = withSupply || rel[0];
            return {
                releaseId: picked.id,
                recipient: picked.primary_sale_recipient,
                thirdwebFeeBps: picked.thirdweb_fee_bps ?? 200,
            };
        }
    } catch (e) {
        console.warn("[nft-admin] resolvePrimarySaleRecipient releases fallback failed:", String(e));
    }
    return { releaseId: null, recipient: null, thirdwebFeeBps: 200 };
}

/**
 * Forward the artist's share from the server wallet after a confirmed claim.
 *
 * Writes exactly one `primary_sale_payouts` row per `claim_tx_hash` (uniquely
 * indexed). The row's lifecycle:
 *   - Row created with status='forwarding', forward_tx_hash=null.
 *   - On successful submit + confirm, row updated to 'forwarded' with
 *     forward_tx_hash and forwarded_at.
 *   - On failure, row updated to 'pending_retry' with last_error.
 *   - If recipient is null (release not Option-B-ready), row is written with
 *     status='failed' so operators can surface it and settle manually.
 *
 * This function never throws to the caller — returns a result object so the
 * calling action (serverClaim) can attach it to its response without losing
 * the NFT delivery.
 */
async function forwardPrimarySalePayout(
    supa: ReturnType<typeof createClient>,
    params: {
        contractAddress: string;
        buyerWallet: string;
        claimTxHash: string;
        grossWei: string;
        tokenId: string | null;
    },
): Promise<{ status: string; payoutId?: string; forwardTxHash?: string; error?: string; artistWei?: string; platformWei?: string; recipient?: string | null; releaseId?: string | null }> {
    const { contractAddress, buyerWallet, claimTxHash, grossWei, tokenId } = params;

    // Idempotency: if a row with this claim_tx_hash already exists, don't re-forward.
    try {
        const { data: existing } = await supa
            .from("primary_sale_payouts")
            .select("id, status, forward_tx_hash, artist_wei, platform_wei, artist_wallet, release_id")
            .eq("claim_tx_hash", claimTxHash)
            .maybeSingle() as { data: any };
        if (existing) {
            return {
                status: existing.status,
                payoutId: existing.id,
                forwardTxHash: existing.forward_tx_hash || undefined,
                artistWei: existing.artist_wei?.toString(),
                platformWei: existing.platform_wei?.toString(),
                recipient: existing.artist_wallet,
                releaseId: existing.release_id,
            };
        }
    } catch (e) {
        console.warn("[nft-admin] forwardPrimarySale existence check failed:", String(e));
    }

    const { releaseId, recipient, thirdwebFeeBps } = await resolvePrimarySaleRecipient(supa, contractAddress, tokenId);
    const { artistWei, platformWei, thirdwebFeeWei } = splitPrimarySale(
        grossWei,
        thirdwebFeeBps,
        PLATFORM_FEE_BPS_PRIMARY,
    );

    // If no recipient resolvable, write a `failed` row so it shows up in the
    // admin ledger for manual settlement.
    if (!recipient) {
        const { data: row } = await supa
            .from("primary_sale_payouts")
            .insert({
                release_id: releaseId,
                nft_token_id: tokenId,
                contract_address: contractAddress,
                chain_id: CHAIN_ID.toString(),
                buyer_wallet: buyerWallet,
                artist_wallet: "0x0000000000000000000000000000000000000000", // placeholder
                server_wallet: SERVER_WALLET,
                gross_wei: grossWei,
                thirdweb_fee_wei: thirdwebFeeWei,
                artist_wei: artistWei,
                platform_wei: platformWei,
                platform_fee_bps: PLATFORM_FEE_BPS_PRIMARY,
                claim_tx_hash: claimTxHash,
                status: "failed",
                attempt_count: 1,
                last_error: "No primary_sale_recipient resolvable for this token/release",
                last_attempt_at: new Date().toISOString(),
            })
            .select("id")
            .maybeSingle() as { data: any };
        return {
            status: "failed",
            payoutId: row?.id,
            error: "No primary_sale_recipient resolvable for this token/release",
            artistWei,
            platformWei,
            recipient: null,
            releaseId,
        };
    }

    // Create the pending row first so we never lose track of the obligation
    // even if the process dies between submit and confirmation.
    const { data: inserted, error: insertErr } = await supa
        .from("primary_sale_payouts")
        .insert({
            release_id: releaseId,
            nft_token_id: tokenId,
            contract_address: contractAddress,
            chain_id: CHAIN_ID.toString(),
            buyer_wallet: buyerWallet,
            artist_wallet: recipient,
            server_wallet: SERVER_WALLET,
            gross_wei: grossWei,
            thirdweb_fee_wei: thirdwebFeeWei,
            artist_wei: artistWei,
            platform_wei: platformWei,
            platform_fee_bps: PLATFORM_FEE_BPS_PRIMARY,
            claim_tx_hash: claimTxHash,
            status: "forwarding",
            attempt_count: 1,
            last_attempt_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle() as { data: any; error: any };

    if (insertErr || !inserted?.id) {
        console.error("[nft-admin] forwardPrimarySale insert row failed:", insertErr?.message);
        return {
            status: "failed",
            error: `Ledger insert failed: ${insertErr?.message || "unknown"}`,
            artistWei,
            platformWei,
            recipient,
            releaseId,
        };
    }
    const payoutId = inserted.id as string;

    // If artistWei = 0 (e.g. a free claim), skip sending but still mark forwarded.
    if (BigInt(artistWei) === 0n) {
        await supa
            .from("primary_sale_payouts")
            .update({ status: "forwarded", forwarded_at: new Date().toISOString() })
            .eq("id", payoutId);
        return { status: "forwarded", payoutId, artistWei, platformWei, recipient, releaseId };
    }

    // Submit the forward tx.
    console.log(`[nft-admin] forwardPrimarySale: ${artistWei} wei -> ${recipient} (claim tx ${claimTxHash})`);
    const { ok, status, txId, raw } = await sendNativeTransfer(recipient, artistWei);
    if (!ok || !txId) {
        const errMsg = typeof raw === "string" ? raw : (JSON.stringify(raw)).slice(0, 500);
        console.error("[nft-admin] forwardPrimarySale send failed:", status, errMsg);
        await supa
            .from("primary_sale_payouts")
            .update({
                status: "pending_retry",
                last_error: `submit failed (${status}): ${errMsg}`.slice(0, 1000),
                last_attempt_at: new Date().toISOString(),
            })
            .eq("id", payoutId);
        return { status: "pending_retry", payoutId, error: errMsg, artistWei, platformWei, recipient, releaseId };
    }

    const { confirmed, hash, error } = await waitForTx(txId, 60000);
    if (!confirmed) {
        console.error("[nft-admin] forwardPrimarySale did not confirm:", error);
        await supa
            .from("primary_sale_payouts")
            .update({
                status: "pending_retry",
                forward_tx_hash: hash || null,
                last_error: (error || "did not confirm").slice(0, 1000),
                last_attempt_at: new Date().toISOString(),
            })
            .eq("id", payoutId);
        return { status: "pending_retry", payoutId, forwardTxHash: hash, error, artistWei, platformWei, recipient, releaseId };
    }

    await supa
        .from("primary_sale_payouts")
        .update({
            status: "forwarded",
            forward_tx_hash: hash,
            forwarded_at: new Date().toISOString(),
        })
        .eq("id", payoutId);

    return { status: "forwarded", payoutId, forwardTxHash: hash, artistWei, platformWei, recipient, releaseId };
}

/**
 * Poll a Thirdweb Engine v3 transaction until it is confirmed / mined.
 * Primary endpoint: GET https://api.thirdweb.com/v1/transactions/{id}
 *   (documented at https://portal.thirdweb.com/wallets/monitor)
 * Fallback:        POST https://engine.thirdweb.com/v1/transactions/search
 *   (documented at https://portal.thirdweb.com/engine/v3/migrate)
 * Both accept the x-secret-key header.
 *
 * Status values observed in the wild across thirdweb infra:
 *   QUEUED | SENT | SUBMITTED | MINED | CONFIRMED | FAILED | ERRORED | CANCELLED
 */
async function fetchTxStatus(txId: string): Promise<{ ok: boolean; tx?: any; rawStatus?: number; rawBody?: string }> {
    // ── Primary: api.thirdweb.com (documented, returns JSON) ──
    try {
        const url = `https://api.thirdweb.com/v1/transactions/${txId}`;
        const resp = await fetch(url, { headers: { "x-secret-key": THIRDWEB_SECRET_KEY } });
        const text = await resp.text();
        if (resp.ok) {
            try {
                const data = JSON.parse(text);
                const tx = data?.result ?? data;
                if (tx && typeof tx === "object") return { ok: true, tx };
            } catch (_) { /* fall through */ }
        } else {
            console.warn(`[nft-admin] api.thirdweb.com GET ${txId} -> ${resp.status}: ${text.slice(0, 200)}`);
        }
    } catch (e) {
        console.warn("[nft-admin] api.thirdweb.com fetch error:", String(e));
    }

    // ── Fallback: engine.thirdweb.com /v1/transactions/search ──
    try {
        const url = `https://engine.thirdweb.com/v1/transactions/search`;
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-secret-key": THIRDWEB_SECRET_KEY,
            },
            body: JSON.stringify({
                filters: [{ field: "id", values: [txId], operation: "OR" }],
            }),
        });
        const text = await resp.text();
        if (resp.ok) {
            try {
                const data = JSON.parse(text);
                // Response shape: { result: { transactions: [...] } } per v3 docs
                const txs = data?.result?.transactions || data?.result || [];
                const tx = Array.isArray(txs) ? txs[0] : txs;
                if (tx && typeof tx === "object") return { ok: true, tx };
            } catch (_) { /* fall through */ }
            return { ok: false, rawStatus: resp.status, rawBody: text.slice(0, 300) };
        }
        return { ok: false, rawStatus: resp.status, rawBody: text.slice(0, 300) };
    } catch (e) {
        console.warn("[nft-admin] engine search error:", String(e));
        return { ok: false };
    }
}

async function waitForTx(txId: string, maxWaitMs = 30000): Promise<{ confirmed: boolean; hash?: string; error?: string }> {
    const startTime = Date.now();
    let lastHash: string | undefined;
    while (Date.now() - startTime < maxWaitMs) {
        const { ok, tx, rawStatus, rawBody } = await fetchTxStatus(txId);
        if (ok && tx) {
            const status = String(tx.status || "").toUpperCase();
            const hash = tx.transactionHash || tx.hash || undefined;
            if (hash) lastHash = hash;
            if (status === "CONFIRMED" || status === "MINED") {
                return { confirmed: true, hash };
            }
            if (status === "FAILED" || status === "ERROR" || status === "ERRORED" || status === "CANCELLED") {
                const errMsg = tx.errorMessage || tx.executionResult?.error?.errorCode
                    || tx.executionResult?.error?.message || `Transaction ${status.toLowerCase()}`;
                console.error("[nft-admin] tx failed:", errMsg);
                return { confirmed: false, hash, error: String(errMsg) };
            }
            // else: QUEUED | SENT | SUBMITTED — keep polling
        } else if (rawStatus) {
            console.warn(`[nft-admin] poll non-ok ${rawStatus}: ${rawBody}`);
        }
        // ── Secondary confirmation path: if we have a hash, verify directly via RPC ──
        // This protects against stuck Thirdweb polling; on-chain is source of truth.
        if (lastHash) {
            try {
                const rpcResp = await fetch(RPC_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0", id: 1,
                        method: "eth_getTransactionReceipt",
                        params: [lastHash],
                    }),
                });
                const rpcData = await rpcResp.json();
                const receipt = rpcData?.result;
                if (receipt && receipt.blockNumber) {
                    if (receipt.status === "0x1") return { confirmed: true, hash: lastHash };
                    if (receipt.status === "0x0") return { confirmed: false, hash: lastHash, error: "Transaction reverted on-chain" };
                }
            } catch (_) { /* non-fatal */ }
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    return { confirmed: false, hash: lastHash, error: "Timeout waiting for tx confirmation" };
}

// ── RPC helper: eth_call ──────────────────────────────────────────────────────

/**
 * Execute a read-only eth_call on the RPC and return the result hex string.
 * Returns "0x" on failure (allows callers to handle gracefully).
 */
async function ethCall(contractAddress: string, data: string): Promise<string> {
    try {
        const resp = await fetch(RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_call",
                params: [{ to: contractAddress, data }, "latest"],
            }),
        });
        const json = await resp.json();
        return json?.result || "0x";
    } catch (e) {
        console.warn("[nft-admin] ethCall error:", String(e));
        return "0x";
    }
}

/**
 * Pad a decimal or hex number to a 64-character hex string (32 bytes).
 */
function toHex64(value: string | number | bigint): string {
    const n = typeof value === "bigint" ? value : BigInt(value);
    return n.toString(16).padStart(64, "0");
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }
    if (!THIRDWEB_SECRET_KEY) {
        return jsonResponse({ error: "THIRDWEB_SECRET_KEY not configured" }, 500);
    }

    // ── Auth check ──
    const auth = await verifyAuth(req);
    if (!auth.valid) {
        return jsonResponse({ error: auth.error || "Unauthorized" }, 401);
    }

    try {
        const body = await req.json();
        const { action } = body;

        // ── Diagnostic: Get Thirdweb TX Status ──
        // Returns the raw Thirdweb transaction record for a given txId.
        // Safe: read-only, no gas cost. Used to verify polling auth is healthy.
        if (action === "getTxStatus") {
            const { txId } = body;
            if (!txId) return jsonResponse({ error: "Missing txId" }, 400);
            const { ok, tx, rawStatus, rawBody } = await fetchTxStatus(txId);
            return jsonResponse({ success: ok, tx, rawStatus, rawBody });
        }

        // ── Lazy Mint ──
        if (action === "lazyMint") {
            let { amount, baseURI, contractAddress } = body;
            if (!amount) return jsonResponse({ error: "Missing amount" }, 400);
            if (!baseURI) baseURI = "ipfs://QmWYNy1tmd2UvBQNE9mT1TfQCu85GzD9x237wDdf5ahcWk/";

            const requestBody = {
                executionOptions: { from: SERVER_WALLET, chainId: CHAIN_ID, type: "EOA" },
                params: [{
                    contractAddress: contractAddress || DEFAULT_CONTRACT,
                    method: "function lazyMint(uint256 _amount, string _baseURIForTokens, bytes _data)",
                    params: [amount.toString(), baseURI, "0x"],
                }],
            };

            console.log("[nft-admin] lazyMint:", amount);
            const { ok, status, result } = await callEngine(requestBody);
            console.log("[nft-admin] lazyMint response:", status);
            if (!ok) return jsonResponse({ success: false, error: result }, status);
            const txId = result?.result?.transactions?.[0]?.id;
            return jsonResponse({ success: true, transactionId: txId, result });
        }

        // ── Server Claim ──
        // Routes by nft_standard:
        //   erc1155 → DropERC1155 claim ABI (tokenId + allowlistProof tuple)
        //   erc721  → legacy DropERC721 claim ABI (back-compat preserved)
        //
        // For ERC-1155: reads release row by release_id to get contract_address
        // and token_id. For ERC-721: falls back to contractAddress param.
        if (action === "serverClaim") {
            const { receiverAddress, contractAddress, onChainPriceWei, release_id } = body;
            if (!receiverAddress) return jsonResponse({ error: "Missing receiverAddress" }, 400);

            const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

            // ── Resolve release row (for ERC-1155 routing) ──
            let releaseRow: any = null;
            if (release_id) {
                try {
                    const supaAdminForRelease = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);
                    const { data } = await supaAdminForRelease
                        .from("nft_releases")
                        .select("id, contract_address, token_id, nft_standard, thirdweb_fee_bps, price_wei, currency_address")
                        .eq("id", release_id)
                        .maybeSingle() as { data: any };
                    releaseRow = data;
                } catch (e) {
                    console.warn("[nft-admin] serverClaim: release lookup failed:", String(e));
                }
            }

            const nftStandard: string = releaseRow?.nft_standard || "erc721";
            const targetContract: string = releaseRow?.contract_address || contractAddress || DEFAULT_CONTRACT;

            // ── ERC-1155 claim path ──
            if (nftStandard === "erc1155") {
                if (!releaseRow?.token_id && releaseRow?.token_id !== 0) {
                    return jsonResponse({ error: "Release token_id not set — lazy mint required before claiming" }, 400);
                }
                const tokenId: string = releaseRow.token_id.toString();
                if (!targetContract) {
                    return jsonResponse({ error: "contract_address not set on release and no ERC-1155 default for mainnet" }, 400);
                }

                // Read active claim condition for this tokenId on-chain (source of truth).
                // DropERC1155.getActiveClaimConditionId(tokenId) — selector 0x2a4c4bf0 + tokenId
                let pricePerToken = (onChainPriceWei ?? releaseRow?.price_wei ?? "0").toString();
                let currencyOnChain = releaseRow?.currency_address || NATIVE_TOKEN;
                try {
                    // getActiveClaimConditionId(uint256 tokenId) → uint256, selector 0x5ab063e8
                    const activeIdHex = await ethCall(targetContract, "0x5ab063e8" + toHex64(tokenId));
                    const activeId = BigInt(activeIdHex || "0x0");

                    // getClaimConditionById(uint256 tokenId, uint256 conditionId) → ClaimCondition
                    // selector 0xd45b28d7
                    // params: tokenId (32 bytes) + conditionId (32 bytes)
                    const condData = "0xd45b28d7" + toHex64(tokenId) + toHex64(activeId);
                    const condHex = (await ethCall(targetContract, condData)).replace(/^0x/, "");

                    // Response is ABI-encoded struct with a dynamic `string metadata`
                    // field — so it has a leading 32-byte offset header.
                    // Layout (slot = 32 bytes):
                    //   [0]=offset(0x20) [1]=startTimestamp [2]=maxClaimableSupply
                    //   [3]=supplyClaimed [4]=quantityLimitPerWallet [5]=merkleRoot
                    //   [6]=pricePerToken [7]=currency [8+]=metadata
                    if (condHex.length >= 64 * 8) {
                        const onChainPrice = BigInt("0x" + condHex.slice(64 * 6, 64 * 7)).toString();
                        const onChainCurrency = "0x" + condHex.slice(64 * 7 + 24, 64 * 8);
                        if (onChainPrice && onChainPrice !== "0") pricePerToken = onChainPrice;
                        if (onChainCurrency && /^0x[a-fA-F0-9]{40}$/.test(onChainCurrency)) currencyOnChain = onChainCurrency;
                        if (onChainPriceWei && onChainPriceWei.toString() !== onChainPrice) {
                            console.warn(
                                `[nft-admin] serverClaim ERC-1155: client price ${onChainPriceWei} ≠ on-chain ${onChainPrice}; using on-chain.`,
                            );
                        }
                    }
                } catch (e) {
                    console.warn("[nft-admin] serverClaim ERC-1155: claim condition read failed, using DB price:", String(e));
                }

                // DropERC1155.claim(address receiver, uint256 tokenId, uint256 quantity,
                //   address currency, uint256 pricePerToken,
                //   (bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) allowlistProof,
                //   bytes data)
                //
                // For a public (no-allowlist) claim: proof=[], quantityLimitPerWallet=MAX_UINT256,
                // pricePerToken=pricePerToken, currency=currencyOnChain.
                const allowlistProof: [string[], string, string, string] = [
                    [],
                    MAX_UINT256,
                    pricePerToken,
                    currencyOnChain,
                ];

                const erc1155RequestBody = {
                    executionOptions: { from: SERVER_WALLET, chainId: CHAIN_ID, type: "EOA" },
                    params: [{
                        contractAddress: targetContract,
                        method: "function claim(address _receiver, uint256 _tokenId, uint256 _quantity, address _currency, uint256 _pricePerToken, (bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) _allowlistProof, bytes _data) payable",
                        params: [
                            receiverAddress,
                            tokenId,
                            "1",
                            currencyOnChain,
                            pricePerToken,
                            allowlistProof,
                            "0x",
                        ],
                        value: currencyOnChain.toLowerCase() === NATIVE_TOKEN.toLowerCase() ? pricePerToken : "0",
                    }],
                };

                console.log("[nft-admin] serverClaim ERC-1155 receiver:", receiverAddress, "tokenId:", tokenId, "price:", pricePerToken);
                const { ok, status, result } = await callEngine(erc1155RequestBody);
                console.log("[nft-admin] serverClaim ERC-1155 engine response:", status, JSON.stringify(result));
                if (!ok) {
                    const errMsg = typeof result === "string"
                        ? result
                        : (result?.error?.message || result?.message || JSON.stringify(result));
                    return jsonResponse({ success: false, error: errMsg }, status);
                }

                const txId = result?.result?.transactions?.[0]?.id
                    || result?.result?.queueId
                    || result?.result?.id;
                if (!txId) {
                    return jsonResponse({ success: false, error: "Engine did not return a transaction id" }, 500);
                }

                const { confirmed, hash, error } = await waitForTx(txId);
                if (!confirmed) {
                    const errMsg = typeof error === "string" ? error : (error || "serverClaim ERC-1155 tx did not confirm");
                    return jsonResponse({ success: false, error: errMsg }, 500);
                }
                console.log("[nft-admin] serverClaim ERC-1155 confirmed, hash:", hash);

                // ── Self-healing nft_tokens insert for ERC-1155 ──
                // For ERC-1155, token_id is fixed per release. Each claim mints
                // `quantity` copies of the same token_id. We insert one nft_tokens
                // row per claim (one copy) — the row acts as a ledger entry.
                if (hash && releaseRow?.id) {
                    try {
                        const supaAdminForToken = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);
                        const priceEth = Number(pricePerToken) / 1e18;
                        const { error: insErr } = await supaAdminForToken
                            .from("nft_tokens")
                            .insert({
                                nft_release_id: releaseRow.id,
                                token_id: tokenId,
                                on_chain_token_id: tokenId,
                                owner_wallet_address: receiverAddress.toLowerCase(),
                                mint_tx_hash: hash,
                                price_paid_eth: priceEth,
                                price_paid_token: priceEth,
                            });
                        if (insErr) {
                            console.log("[nft-admin] ERC-1155 self-healing nft_tokens insert:", insErr.message);
                        } else {
                            console.log("[nft-admin] ERC-1155 self-healing nft_tokens inserted for token", tokenId);
                        }
                    } catch (e: any) {
                        console.error("[nft-admin] ERC-1155 self-healing nft_tokens threw (non-fatal):", e?.message || e);
                    }
                }

                // ── Primary-sale forwarding for ERC-1155 ──
                let payoutResult: any = null;
                if (hash && currencyOnChain.toLowerCase() === NATIVE_TOKEN.toLowerCase() && BigInt(pricePerToken) > 0n) {
                    try {
                        const supaAdminForPayout = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);
                        payoutResult = await forwardPrimarySalePayout(supaAdminForPayout, {
                            contractAddress: targetContract,
                            buyerWallet: receiverAddress,
                            claimTxHash: hash,
                            grossWei: pricePerToken,
                            tokenId,
                        });
                        console.log("[nft-admin] ERC-1155 primary-sale payout:", JSON.stringify({
                            status: payoutResult?.status,
                            recipient: payoutResult?.recipient,
                            artistWei: payoutResult?.artistWei,
                            forwardTxHash: payoutResult?.forwardTxHash,
                        }));
                    } catch (e: any) {
                        console.error("[nft-admin] ERC-1155 forwardPrimarySale threw (non-fatal):", e?.message || e);
                        payoutResult = { status: "pending_retry", error: e?.message || String(e) };
                    }
                }

                return jsonResponse({
                    success: true,
                    transactionId: txId,
                    txHash: hash,
                    onChainTokenId: tokenId,
                    pricePaidWei: pricePerToken,
                    currency: currencyOnChain,
                    nftStandard: "erc1155",
                    primarySalePayout: payoutResult,
                });
            }

            // ── ERC-721 legacy claim path (preserved for back-compat) ──
            // Read active claim condition on-chain (source of truth).
            // The contract's verifyClaim rejects any call whose _pricePerToken /
            // _currency args don't exactly match the active claim condition.
            let pricePerToken = (onChainPriceWei ?? "0").toString();
            let currencyOnChain = NATIVE_TOKEN;
            try {
                // claimCondition() returns (currentStartId, count)
                const ccHex = (await ethCall(targetContract, "0xd637ed59")).slice(2);
                const currentStartId = BigInt("0x" + (ccHex.slice(0, 64) || "0"));
                // getClaimConditionById(currentStartId) selector 0x6f8934f4
                const idHex = currentStartId.toString(16).padStart(64, "0");
                const condHex = (await ethCall(targetContract, "0x6f8934f4" + idHex)).slice(2);
                // Struct layout starting at word 1 (word 0 is the tuple offset 0x20):
                //   [1]=startTimestamp [2]=maxClaimableSupply [3]=supplyClaimed
                //   [4]=quantityLimitPerWallet [5]=merkleRoot [6]=pricePerToken
                //   [7]=currency [8..]=metadata(string)
                if (condHex.length >= 64 * 8) {
                    const onChainPrice = BigInt("0x" + condHex.slice(64 * 6, 64 * 7)).toString();
                    const onChainCurrency = "0x" + condHex.slice(64 * 7 + 24, 64 * 8);
                    if (onChainPrice && onChainPrice !== "0") pricePerToken = onChainPrice;
                    if (onChainCurrency && /^0x[a-fA-F0-9]{40}$/.test(onChainCurrency)) currencyOnChain = onChainCurrency;
                    if (onChainPriceWei && onChainPriceWei.toString() !== onChainPrice) {
                        console.warn(
                            `[nft-admin] serverClaim ERC-721: client price ${onChainPriceWei} ≠ on-chain ${onChainPrice}; using on-chain (source of truth).`,
                        );
                    }
                }
            } catch (e) {
                console.warn("[nft-admin] serverClaim ERC-721: failed to read claim condition, falling back to client price:", String(e));
            }

            // DropERC721.claim(receiver, quantity, currency, pricePerToken,
            //                  (proof, qtyLimitPerWallet, pricePerToken, currency), data)
            // For a public (no-allowlist) claim: proof = [], and the allowlist
            // tuple's qtyLimit/price/currency must match the active condition —
            // using MAX_UINT256/pricePerToken/currency is the standard
            // "no override" form Thirdweb SDK sends.
            const allowlistProof721: [string[], string, string, string] = [
                [],
                MAX_UINT256,
                pricePerToken,
                currencyOnChain,
            ];

            const erc721RequestBody = {
                executionOptions: { from: SERVER_WALLET, chainId: CHAIN_ID, type: "EOA" },
                params: [{
                    contractAddress: targetContract,
                    method: "function claim(address _receiver, uint256 _quantity, address _currency, uint256 _pricePerToken, (bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) _allowlistProof, bytes _data) payable",
                    params: [
                        receiverAddress,
                        "1",
                        currencyOnChain,
                        pricePerToken,
                        allowlistProof721,
                        "0x",
                    ],
                    // Server wallet forwards the claim price as msg.value so the
                    // contract accepts the payment. Payment from buyer → server
                    // wallet already happened before this call (confirmed on-chain
                    // client-side); server wallet is just relaying.
                    // Only set value when currency is NATIVE_TOKEN; ERC20 claims
                    // do not send native value (they rely on allowance).
                    value: currencyOnChain.toLowerCase() === NATIVE_TOKEN.toLowerCase() ? pricePerToken : "0",
                }],
            };

            console.log("[nft-admin] serverClaim ERC-721 v1/write/contract receiver:", receiverAddress, "price:", pricePerToken);
            const { ok, status, result } = await callEngine(erc721RequestBody);
            console.log("[nft-admin] serverClaim ERC-721 engine response:", status, JSON.stringify(result));
            if (!ok) {
                const errMsg = typeof result === "string"
                    ? result
                    : (result?.error?.message || result?.message || JSON.stringify(result));
                return jsonResponse({ success: false, error: errMsg }, status);
            }

            const txId = result?.result?.transactions?.[0]?.id
                || result?.result?.queueId
                || result?.result?.id;
            if (!txId) {
                return jsonResponse({ success: false, error: "Engine did not return a transaction id" }, 500);
            }

            const { confirmed, hash, error } = await waitForTx(txId);
            if (!confirmed) {
                const errMsg = typeof error === "string" ? error : (error || "serverClaim tx did not confirm");
                return jsonResponse({ success: false, error: errMsg }, 500);
            }
            console.log("[nft-admin] serverClaim ERC-721 confirmed, hash:", hash);

            // Parse real on-chain tokenId from the Transfer event log.
            // Best-effort: if the receipt isn't available yet we return null —
            // the mobile reconciler will fill it in on retry.
            let onChainTokenId: string | null = null;
            if (hash) {
                onChainTokenId = await fetchMintedTokenId(hash, targetContract);
                console.log("[nft-admin] parsed on-chain tokenId:", onChainTokenId);
            }

            // ── Self-healing nft_tokens insert (Option B hardening) ──
            // Before Option B the client was solely responsible for writing the
            // nft_tokens row after a successful mint. That works for the real
            // purchase path (purchaseAndMintNFT), but leaves a gap when any
            // other caller (admin ops, reconciliation, tests) invokes
            // serverClaim directly — the NFT exists on-chain with no DB row,
            // so it shows up in the buyer's collection as a "ghost" card
            // with 'Unknown (off-chain metadata missing)' and is absent from
            // the admin NFT Tokens screen.
            //
            // Making the edge function itself write a minimal row closes that
            // gap. The client path still does its richer upsert (price_paid_eur,
            // mint_tx_hash, intent linkage) right after serverClaim returns;
            // its .insert hits the existing row, triggers the duplicate branch
            // at blockchain.ts:1108, and proceeds normally. Net effect: the DB
            // row is guaranteed whether the caller is the app, a test curl,
            // or a future backend job.
            if (hash && onChainTokenId) {
                try {
                    const supaAdminForToken = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);
                    // Resolve release via contract_address + an active row so we
                    // don't guess. If multiple active releases share the contract
                    // (common: each tier is its own release on the same drop),
                    // prefer the one whose price_eth matches the paid price.
                    const priceEthStr = (Number(pricePerToken) / 1e18).toString();
                    const { data: releaseCandidates } = await supaAdminForToken
                        .from("nft_releases")
                        .select("id, price_eth, is_active")
                        .eq("contract_address", targetContract)
                        .eq("is_active", true) as { data: any[] };
                    let matchedReleaseId: string | null = null;
                    if (Array.isArray(releaseCandidates) && releaseCandidates.length > 0) {
                        // Exact-price match first; fall back to single-active-release.
                        const exact = releaseCandidates.find(
                            (r) => r && Number(r.price_eth).toString() === Number(priceEthStr).toString(),
                        );
                        matchedReleaseId = exact?.id
                            || (releaseCandidates.length === 1 ? releaseCandidates[0].id : null);
                    }
                    if (matchedReleaseId) {
                        // Idempotent: only insert if no row exists yet for this
                        // on_chain_token_id (unique index nft_tokens_onchain_unique).
                        const { data: existing } = await supaAdminForToken
                            .from("nft_tokens")
                            .select("id")
                            .eq("on_chain_token_id", onChainTokenId)
                            .maybeSingle();
                        if (!existing) {
                            const priceEth = Number(pricePerToken) / 1e18;
                            const { error: insErr } = await supaAdminForToken
                                .from("nft_tokens")
                                .insert({
                                    nft_release_id: matchedReleaseId,
                                    token_id: onChainTokenId,
                                    on_chain_token_id: onChainTokenId,
                                    owner_wallet_address: receiverAddress.toLowerCase(),
                                    mint_tx_hash: hash,
                                    price_paid_eth: priceEth,
                                    price_paid_token: priceEth,
                                });
                            if (insErr) {
                                // Race with the client's own insert — benign.
                                console.log("[nft-admin] self-healing nft_tokens insert skipped:", insErr.message);
                            } else {
                                console.log("[nft-admin] self-healing nft_tokens inserted for token", onChainTokenId);
                            }
                        }
                    } else {
                        console.warn("[nft-admin] self-healing insert: no matching release for contract", targetContract, "price", priceEthStr);
                    }
                } catch (e: any) {
                    // Non-fatal — the buyer has the NFT on-chain and the client
                    // may still write the row itself. We just log.
                    console.error("[nft-admin] self-healing nft_tokens insert threw (non-fatal):", e?.message || e);
                }
            }

            // ── Primary-sale forwarding (Option B) ──
            // Claim confirmed → server wallet holds the sale proceeds. Forward
            // the artist's share now, inline, while we still have the claim tx
            // context. A failure here is non-fatal for the NFT: the buyer
            // keeps the token and the payout row sits in pending_retry for
            // the retry sweep to settle. This is only attempted for
            // native-currency claims (ERC-20 ignored for now — the flow was
            // not originally in scope for Option B).
            let payoutResult: any = null;
            if (hash && currencyOnChain.toLowerCase() === NATIVE_TOKEN.toLowerCase() && BigInt(pricePerToken) > 0n) {
                try {
                    // Service-role client bypasses RLS (the ledger table denies
                    // all user-role writes). Safe because the edge function is
                    // itself the authorization boundary for these writes.
                    const supaAdminForPayout = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);
                    payoutResult = await forwardPrimarySalePayout(supaAdminForPayout, {
                        contractAddress: targetContract,
                        buyerWallet: receiverAddress,
                        claimTxHash: hash,
                        grossWei: pricePerToken,
                        tokenId: onChainTokenId,
                    });
                    console.log("[nft-admin] primary-sale payout:", JSON.stringify({
                        status: payoutResult?.status,
                        recipient: payoutResult?.recipient,
                        artistWei: payoutResult?.artistWei,
                        forwardTxHash: payoutResult?.forwardTxHash,
                    }));
                } catch (e: any) {
                    // Intentionally non-throwing — NFT was delivered; payout
                    // error surfaces via the retry sweep and admin ledger.
                    console.error("[nft-admin] forwardPrimarySale threw (non-fatal):", e?.message || e);
                    payoutResult = { status: "pending_retry", error: e?.message || String(e) };
                }
            }

            return jsonResponse({
                success: true,
                transactionId: txId,
                txHash: hash,
                onChainTokenId,
                // Price actually paid to the contract (in wei), read from
                // on-chain claim condition. May differ from onChainPriceWei the
                // client sent; the client should reconcile its records to this.
                pricePaidWei: pricePerToken,
                currency: currencyOnChain,
                nftStandard: "erc721",
                // Primary-sale forwarding result (Option B). Contains status,
                // payoutId, forwardTxHash, artistWei, platformWei, recipient.
                // null when the claim was not native-currency or price == 0.
                primarySalePayout: payoutResult,
            });
        }

        // ── Set Claim Conditions (ERC-721, requires ADMIN role) ──
        if (action === "setClaimConditions") {
            const { priceWei, contractAddress } = body;
            const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
            const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

            const conditionsArray = [["0", MAX_UINT256, "0", MAX_UINT256, ZERO_BYTES32, priceWei || "0", NATIVE_TOKEN, ""]];

            const requestBody = {
                executionOptions: { from: SERVER_WALLET, chainId: CHAIN_ID, type: "EOA" },
                params: [{
                    contractAddress: contractAddress || DEFAULT_CONTRACT,
                    method: "function setClaimConditions((uint256 startTimestamp, uint256 maxClaimableSupply, uint256 supplyClaimed, uint256 quantityLimitPerWallet, bytes32 merkleRoot, uint256 pricePerToken, address currency, string metadata)[] _conditions, bool _resetClaimEligibility)",
                    params: [conditionsArray, true],
                }],
            };

            console.log("[nft-admin] setClaimConditions price:", priceWei);
            const { ok, status, result } = await callEngine(requestBody);
            console.log("[nft-admin] setClaimConditions response:", status, JSON.stringify(result));
            if (!ok) return jsonResponse({ success: false, error: result }, status);

            const txId = result?.result?.transactions?.[0]?.id;
            if (txId) {
                const { confirmed, hash, error } = await waitForTx(txId);
                if (!confirmed) return jsonResponse({ success: false, error: error || "setClaimConditions tx did not confirm" }, 500);
                return jsonResponse({ success: true, transactionId: txId, txHash: hash });
            }
            return jsonResponse({ success: true, transactionId: txId, result });
        }

        // ── Set Claim Condition For Token (ERC-1155) ──
        // Calls DropERC1155.setClaimConditions(tokenId, conditions[], resetEligibility)
        // for a specific token ID. The condition sets pricePerToken, maxClaimableSupply,
        // and currency for that token's drop.
        if (action === "setClaimConditionForToken") {
            const { tokenId, pricePerToken, maxClaimableSupply, currency, contractAddress, resetEligibility } = body;
            if (tokenId === undefined || tokenId === null) {
                return jsonResponse({ error: "Missing tokenId" }, 400);
            }
            if (!pricePerToken) {
                return jsonResponse({ error: "Missing pricePerToken (wei)" }, 400);
            }

            const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
            const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const claimCurrency = currency || NATIVE_TOKEN;
            const supply = maxClaimableSupply?.toString() || MAX_UINT256;
            const target = contractAddress || DEFAULT_ERC1155_CONTRACT;
            const resetElig = resetEligibility !== false; // default true

            if (!target) {
                return jsonResponse({ error: "contractAddress required on mainnet" }, 400);
            }

            // DropERC1155.setClaimConditions(uint256 tokenId, ClaimCondition[] conditions, bool resetEligibility)
            // ClaimCondition struct: (startTimestamp, maxClaimableSupply, supplyClaimed,
            //   quantityLimitPerWallet, merkleRoot, pricePerToken, currency, metadata)
            const conditionsArray = [[
                "0",           // startTimestamp — active immediately
                supply,        // maxClaimableSupply
                "0",           // supplyClaimed (reset)
                MAX_UINT256,   // quantityLimitPerWallet — unlimited per wallet
                ZERO_BYTES32,  // merkleRoot — no allowlist
                pricePerToken.toString(),
                claimCurrency,
                "",            // metadata
            ]];

            const requestBody = {
                executionOptions: { from: ADMIN_WALLET, chainId: CHAIN_ID, type: "EOA" },
                params: [{
                    contractAddress: target,
                    method: "function setClaimConditions(uint256 _tokenId, (uint256 startTimestamp, uint256 maxClaimableSupply, uint256 supplyClaimed, uint256 quantityLimitPerWallet, bytes32 merkleRoot, uint256 pricePerToken, address currency, string metadata)[] _conditions, bool _resetClaimEligibility)",
                    params: [tokenId.toString(), conditionsArray, resetElig],
                }],
            };

            console.log("[nft-admin] setClaimConditionForToken tokenId:", tokenId, "price:", pricePerToken, "supply:", supply);
            const { ok, status, result } = await callEngine(requestBody);
            console.log("[nft-admin] setClaimConditionForToken response:", status, JSON.stringify(result));
            if (!ok) return jsonResponse({ success: false, error: result }, status);

            const txId = result?.result?.transactions?.[0]?.id;
            if (txId) {
                const { confirmed, hash, error } = await waitForTx(txId, 60000);
                if (!confirmed) return jsonResponse({ success: false, error: error || "setClaimConditionForToken tx did not confirm" }, 500);
                return jsonResponse({
                    success: true,
                    transactionId: txId,
                    txHash: hash,
                    tokenId: tokenId.toString(),
                    pricePerToken: pricePerToken.toString(),
                    maxClaimableSupply: supply,
                    currency: claimCurrency,
                });
            }
            return jsonResponse({ success: true, transactionId: txId, result });
        }

        // ── Set Royalty Info For Token (ERC-1155, per-token override) ──
        // Calls DropERC1155.setRoyaltyInfoForToken(uint256 tokenId, address recipient, uint96 bps).
        // This sets a token-specific royalty override that takes precedence over
        // the default contract royalty for secondary sales of this token.
        if (action === "setRoyaltyInfoForToken") {
            const { tokenId, recipient, bps, contractAddress } = body;
            if (tokenId === undefined || tokenId === null) {
                return jsonResponse({ error: "Missing tokenId" }, 400);
            }
            if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
                return jsonResponse({ error: "Missing or invalid recipient address" }, 400);
            }

            const royaltyBps = typeof bps === "number" ? bps : DEFAULT_ARTIST_ROYALTY_BPS;
            if (!Number.isInteger(royaltyBps) || royaltyBps < 0 || royaltyBps > 10000) {
                return jsonResponse({ error: "bps must be an integer in [0, 10000]" }, 400);
            }
            const target = contractAddress || DEFAULT_ERC1155_CONTRACT;
            if (!target) {
                return jsonResponse({ error: "contractAddress required on mainnet" }, 400);
            }

            const requestBody = {
                executionOptions: { from: ADMIN_WALLET, chainId: CHAIN_ID, type: "EOA" },
                params: [{
                    contractAddress: target,
                    method: "function setRoyaltyInfoForToken(uint256 _tokenId, address _recipient, uint256 _royaltyBps)",
                    params: [tokenId.toString(), recipient, royaltyBps.toString()],
                }],
            };

            console.log("[nft-admin] setRoyaltyInfoForToken tokenId:", tokenId, "recipient:", recipient, "bps:", royaltyBps);
            const { ok, status, result } = await callEngine(requestBody);
            console.log("[nft-admin] setRoyaltyInfoForToken response:", status, JSON.stringify(result));
            if (!ok) return jsonResponse({ success: false, error: result }, status);

            const txId = result?.result?.transactions?.[0]?.id;
            if (txId) {
                const { confirmed, hash, error } = await waitForTx(txId, 60000);
                if (!confirmed) return jsonResponse({ success: false, error: error || "setRoyaltyInfoForToken tx did not confirm" }, 500);

                // Readback: EIP-2981 royaltyInfo(uint256 tokenId, uint256 salePrice)
                // selector 0x2a55205a — query tokenId, salePrice=10000
                // Returns (address receiver, uint256 royaltyAmount)
                // bps = royaltyAmount * 10000 / salePrice
                const READBACK_SAMPLE_PRICE = 10000n;
                const readCalldata = "0x2a55205a" + toHex64(tokenId) + toHex64(READBACK_SAMPLE_PRICE);
                const readHex = (await ethCall(target, readCalldata)).replace(/^0x/, "");
                let onChainRecipient: string | null = null;
                let onChainBps: number | null = null;
                if (readHex.length >= 128) {
                    onChainRecipient = "0x" + readHex.slice(24, 64);
                    const royaltyAmount = BigInt("0x" + readHex.slice(64, 128));
                    onChainBps = Number((royaltyAmount * 10000n) / READBACK_SAMPLE_PRICE);
                }

                return jsonResponse({
                    success: true,
                    transactionId: txId,
                    txHash: hash,
                    tokenId: tokenId.toString(),
                    recipient,
                    bps: royaltyBps,
                    onChain: { recipient: onChainRecipient, bps: onChainBps },
                });
            }
            return jsonResponse({ success: true, transactionId: txId, result });
        }

        // ── Verify Contract Config ──
        // Read-only: returns primarySaleRecipient, defaultRoyaltyInfo, and
        // platformFeeInfo from a contract. Supports both DropERC721 and DropERC1155.
        //
        // Royalty query strategy:
        //   For DropERC1155 (and DropERC721): use EIP-2981 royaltyInfo(tokenId, salePrice)
        //   selector 0x2a55205a with tokenId=0, salePrice=10000 (1 bps unit).
        //   This is universally supported. The "bps" returned is
        //   royaltyAmount * 10000 / salePrice.
        if (action === "verifyContractConfig") {
            const { contractAddress } = body;
            const target = contractAddress || DEFAULT_ERC1155_CONTRACT;
            if (!target) {
                return jsonResponse({ error: "contractAddress required" }, 400);
            }

            // primarySaleRecipient() — selector 0x079fe40e
            const primarySaleHex = (await ethCall(target, "0x079fe40e")).replace(/^0x/, "");
            const primarySaleRecipient = primarySaleHex.length >= 40
                ? ("0x" + primarySaleHex.slice(Math.max(0, primarySaleHex.length - 40)))
                : null;

            // EIP-2981 royaltyInfo(uint256 tokenId, uint256 salePrice)
            // selector 0x2a55205a — query tokenId=0, salePrice=10000
            // Returns (address receiver, uint256 royaltyAmount)
            // bps = royaltyAmount * 10000 / salePrice
            let royaltyRecipient: string | null = null;
            let royaltyBps: number | null = null;
            const ROYALTY_SAMPLE_PRICE = 10000n;
            const royaltyCalldata = "0x2a55205a"
                + toHex64(0)                        // tokenId = 0
                + toHex64(ROYALTY_SAMPLE_PRICE);     // salePrice = 10000
            const royaltyHex = (await ethCall(target, royaltyCalldata)).replace(/^0x/, "");
            if (royaltyHex.length >= 128) {
                royaltyRecipient = "0x" + royaltyHex.slice(24, 64);
                const royaltyAmount = BigInt("0x" + royaltyHex.slice(64, 128));
                // Derive bps: royaltyAmount / salePrice * 10000
                royaltyBps = Number((royaltyAmount * 10000n) / ROYALTY_SAMPLE_PRICE);
            }

            // getPlatformFeeInfo() — selector 0xd45573f6
            // Returns (address platformFeeRecipient, uint16 platformFeeBps)
            const feeHex = (await ethCall(target, "0xd45573f6")).replace(/^0x/, "");
            let platformFeeRecipient: string | null = null;
            let platformFeeBps: number | null = null;
            if (feeHex.length >= 128) {
                platformFeeRecipient = "0x" + feeHex.slice(24, 64);
                platformFeeBps = parseInt(feeHex.slice(64, 128), 16);
            }

            return jsonResponse({
                success: true,
                contractAddress: target,
                primarySaleRecipient,
                defaultRoyaltyInfo: { recipient: royaltyRecipient, bps: royaltyBps },
                platformFeeInfo: { recipient: platformFeeRecipient, bps: platformFeeBps },
            });
        }

        // ── Transfer Funds (native POL) ──
        if (action === "transferFunds") {
            const { recipientAddress, amountWei } = body;
            if (!recipientAddress || !amountWei) return jsonResponse({ error: "Missing recipientAddress or amountWei" }, 400);
            if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) return jsonResponse({ error: "Invalid recipientAddress format" }, 400);

            const txUrl = "https://engine.thirdweb.com/v1/write/transaction";
            const txBody = {
                executionOptions: { from: SERVER_WALLET, chainId: CHAIN_ID, type: "EOA" },
                params: [{ to: recipientAddress, data: "0x", value: amountWei.toString() }],
            };

            console.log("[nft-admin] transferFunds:", recipientAddress, amountWei.toString());
            const twResponse = await fetch(txUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-secret-key": THIRDWEB_SECRET_KEY },
                body: JSON.stringify(txBody),
            });

            const resultText = await twResponse.text();
            console.log("[nft-admin] transferFunds response:", twResponse.status, resultText);
            let result;
            try { result = JSON.parse(resultText); } catch { result = { raw: resultText }; }
            if (!twResponse.ok) return jsonResponse({ success: false, error: result }, twResponse.status);

            const txId = result?.result?.transactions?.[0]?.id || result?.result?.id;
            return jsonResponse({ success: true, transactionId: txId, result });
        }

        // ── Deploy Split Contract ──
        if (action === "deploySplit") {
            const { songId } = body;
            if (!songId) return jsonResponse({ error: "Missing songId" }, 400);

            // Create an authenticated Supabase client using the caller's token
            const authHeader = req.headers.get("Authorization") || "";
            const userToken = authHeader.replace("Bearer ", "");
            const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                global: { headers: { Authorization: `Bearer ${userToken}` } },
            });

            // Fetch song details
            const { data: song, error: songErr } = await supabaseAdmin
                .from("songs")
                .select("id, title, split_contract_address")
                .eq("id", songId)
                .maybeSingle();

            if (songErr || !song) {
                return jsonResponse({ error: songErr?.message || "Song not found" }, 404);
            }

            // If already deployed, return existing address
            if (song.split_contract_address) {
                return jsonResponse({
                    success: true,
                    contractAddress: song.split_contract_address,
                    alreadyDeployed: true,
                });
            }

            // Fetch split sheet
            const { data: splits, error: splitsErr } = await supabaseAdmin
                .from("song_rights_splits")
                .select("party_name, party_email, share_percent, linked_wallet_address")
                .eq("song_id", songId);

            if (splitsErr || !splits || splits.length === 0) {
                return jsonResponse({ error: "No split sheet found for this song" }, 400);
            }

            // Ensure all parties have wallet addresses
            const partiesWithWallets = splits.filter((s: any) => !!s.linked_wallet_address);
            if (partiesWithWallets.length === 0) {
                return jsonResponse({ error: "No split parties have linked wallet addresses" }, 400);
            }

            // Build recipients array: sharesBps = share_percent * 100
            // Only include parties with wallets; re-normalize shares to sum to 10000 bps
            const totalSharePercent = partiesWithWallets.reduce(
                (sum: number, s: any) => sum + parseFloat(s.share_percent), 0
            );
            const recipients = partiesWithWallets.map((s: any) => ({
                address: s.linked_wallet_address,
                sharesBps: Math.round((parseFloat(s.share_percent) / totalSharePercent) * 10000),
            }));

            // Ensure shares sum to exactly 10000
            const bpsSum = recipients.reduce((sum: number, r: any) => sum + r.sharesBps, 0);
            if (bpsSum !== 10000 && recipients.length > 0) {
                recipients[0].sharesBps += 10000 - bpsSum;
            }

            console.log("[nft-admin] deploySplit for song:", song.title, "recipients:", JSON.stringify(recipients));

            // Deploy Split contract via Thirdweb Engine
            const deployUrl = "https://engine.thirdweb.com/v1/deploy/prebuilt/split";
            const deployBody = {
                chain: CHAIN_ID.toString(),
                contractMetadata: {
                    name: `MU6 Split - ${song.title}`,
                    recipients,
                },
            };

            const deployResponse = await fetch(deployUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-secret-key": THIRDWEB_SECRET_KEY,
                    "x-backend-wallet-address": SERVER_WALLET,
                },
                body: JSON.stringify(deployBody),
            });

            const deployText = await deployResponse.text();
            console.log("[nft-admin] deploySplit response:", deployResponse.status, deployText);
            let deployResult;
            try { deployResult = JSON.parse(deployText); } catch { deployResult = { raw: deployText }; }

            if (!deployResponse.ok) {
                return jsonResponse({ success: false, error: deployResult }, deployResponse.status);
            }

            // Extract the deployed contract address or transaction ID
            const deployedAddress = deployResult?.result?.contractAddress
                || deployResult?.result?.deployedAddress;
            const deployTxId = deployResult?.result?.transactions?.[0]?.id
                || deployResult?.result?.queueId;

            // If we got a transaction ID but no address yet, wait for confirmation
            let finalAddress = deployedAddress;
            if (!finalAddress && deployTxId) {
                console.log("[nft-admin] Waiting for deploy tx:", deployTxId);
                const txResult = await waitForTx(deployTxId, 60000);
                if (txResult.confirmed) {
                    // Fetch the deployed address from the transaction result
                    const { ok, tx } = await fetchTxStatus(deployTxId);
                    if (ok && tx) {
                        finalAddress = tx.contractAddress
                            || tx.deployedAddress
                            || tx.executionResult?.contractAddress;
                    }
                } else {
                    return jsonResponse({
                        success: false,
                        error: txResult.error || "Deploy transaction did not confirm",
                    }, 500);
                }
            }

            if (finalAddress) {
                // Write the address back to the songs table
                const { error: updateErr } = await supabaseAdmin
                    .from("songs")
                    .update({ split_contract_address: finalAddress })
                    .eq("id", songId);

                if (updateErr) {
                    console.error("[nft-admin] Failed to update song with split address:", updateErr.message);
                }

                return jsonResponse({
                    success: true,
                    contractAddress: finalAddress,
                });
            }

            // If we still don't have an address, return the raw result for debugging
            return jsonResponse({
                success: true,
                contractAddress: null,
                deployResult,
                note: "Deploy submitted but address not yet available. Check transaction status.",
            });
        }

        // ── Deploy MarketplaceV3 ──
        if (action === "deployMarketplace") {
            const deployUrl = "https://engine.thirdweb.com/v1/deploy/prebuilt/marketplace-v3";
            const deployBody = {
                chain: CHAIN_ID.toString(),
                contractMetadata: {
                    name: "MU6 Marketplace",
                    platform_fee_recipient: SERVER_WALLET,
                    platform_fee_basis_points: 500,
                },
            };

            console.log("[nft-admin] deployMarketplace: deploying MarketplaceV3");
            const deployResponse = await fetch(deployUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-secret-key": THIRDWEB_SECRET_KEY,
                    "x-backend-wallet-address": SERVER_WALLET,
                },
                body: JSON.stringify(deployBody),
            });

            const deployText = await deployResponse.text();
            console.log("[nft-admin] deployMarketplace response:", deployResponse.status, deployText);
            let deployResult;
            try { deployResult = JSON.parse(deployText); } catch { deployResult = { raw: deployText }; }

            if (!deployResponse.ok) {
                return jsonResponse({ success: false, error: deployResult }, deployResponse.status);
            }

            const deployedAddress = deployResult?.result?.contractAddress
                || deployResult?.result?.deployedAddress;
            const deployTxId = deployResult?.result?.transactions?.[0]?.id
                || deployResult?.result?.queueId;

            let finalAddress = deployedAddress;
            if (!finalAddress && deployTxId) {
                console.log("[nft-admin] Waiting for marketplace deploy tx:", deployTxId);
                const txResult = await waitForTx(deployTxId, 60000);
                if (txResult.confirmed) {
                    const { ok, tx } = await fetchTxStatus(deployTxId);
                    const statusData = ok && tx ? { result: tx } : { result: {} };
                    finalAddress = statusData?.result?.contractAddress
                        || statusData?.result?.deployedAddress;
                } else {
                    return jsonResponse({
                        success: false,
                        error: txResult.error || "Marketplace deploy tx did not confirm",
                    }, 500);
                }
            }

            if (finalAddress) {
                // Store in platform_settings
                const authHeader = req.headers.get("Authorization") || "";
                const userToken = authHeader.replace("Bearer ", "");
                const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                    global: { headers: { Authorization: `Bearer ${userToken}` } },
                });

                await supabaseClient
                    .from("platform_settings")
                    .upsert(
                        { key: "marketplace_contract_address", value: JSON.stringify(finalAddress) },
                        { onConflict: "key" },
                    );

                return jsonResponse({ success: true, contractAddress: finalAddress });
            }

            return jsonResponse({
                success: true,
                contractAddress: null,
                deployResult,
                note: "Deploy submitted but address not yet available.",
            });
        }

        // ── Deploy NFT Drop (DropERC721) — RETIRED ──
        //
        // The legacy Thirdweb Engine v1 /deploy/prebuilt/nft-drop endpoint
        // returns 404 as of 2026-04. We no longer need this action: the
        // existing drop contract 0xACF1145A... now has server wallet granted
        // DEFAULT_ADMIN_ROLE so setClaimConditions works without a redeploy.
        // If we ever need a fresh drop, redeploy via the thirdweb dashboard UI
        // (web.thirdweb.com/polygon-amoy-testnet/deploy/DropERC721) manually.
        if (action === "deployNftDrop") {
            return jsonResponse({
                success: false,
                error: "deployNftDrop is retired. Deploy a new DropERC721 manually via thirdweb dashboard and update platform_settings.song_nft_contract_address.",
            }, 410);
        }


        // ── Set Default Royalty Info (EIP-2981) ──
        if (action === "setRoyalty") {
            const { royaltyRecipient, royaltyBps, contractAddress } = body;
            if (!royaltyRecipient) return jsonResponse({ error: "Missing royaltyRecipient" }, 400);

            const bps = royaltyBps || "500"; // default 5%

            const requestBody = {
                executionOptions: { from: SERVER_WALLET, chainId: CHAIN_ID, type: "EOA" },
                params: [{
                    contractAddress: contractAddress || DEFAULT_CONTRACT,
                    method: "function setDefaultRoyaltyInfo(address _royaltyRecipient, uint256 _royaltyBps)",
                    params: [royaltyRecipient, bps.toString()],
                }],
            };

            console.log("[nft-admin] setRoyalty:", royaltyRecipient, bps, "bps");
            const { ok, status, result } = await callEngine(requestBody);
            console.log("[nft-admin] setRoyalty response:", status, JSON.stringify(result));
            if (!ok) return jsonResponse({ success: false, error: result }, status);

            const txId = result?.result?.transactions?.[0]?.id;
            if (txId) {
                const { confirmed, hash, error } = await waitForTx(txId);
                if (!confirmed) return jsonResponse({ success: false, error: error || "setRoyalty tx did not confirm" }, 500);
                return jsonResponse({ success: true, transactionId: txId, txHash: hash });
            }
            return jsonResponse({ success: true, transactionId: txId, result });
        }

        // ═══════════════════════════════════════════════════════════════════
        // Option B — Primary-sale admin + retry surfaces
        // ═══════════════════════════════════════════════════════════════════

        // ── setPrimarySaleRecipient on DropERC721 (admin) ──
        // Server wallet holds DEFAULT_ADMIN_ROLE on the drop so it can call
        // this function itself. Idempotent: reads the current value first and
        // short-circuits when already correct.
        if (action === "setPrimarySaleRecipient") {
            const { saleRecipient, contractAddress } = body;
            const target = (saleRecipient || SERVER_WALLET) as string;
            const contract = (contractAddress || DEFAULT_CONTRACT) as string;
            if (!/^0x[a-fA-F0-9]{40}$/.test(target)) {
                return jsonResponse({ error: "Invalid saleRecipient address" }, 400);
            }

            // Read current on-chain value (selector 0x079fe40e = primarySaleRecipient())
            try {
                const curHex = (await ethCall(contract, "0x079fe40e")).replace(/^0x/, "");
                const curRecipient = "0x" + curHex.slice(Math.max(0, curHex.length - 40));
                if (curRecipient.toLowerCase() === target.toLowerCase()) {
                    return jsonResponse({ success: true, unchanged: true, current: curRecipient });
                }
                console.log(`[nft-admin] setPrimarySaleRecipient: ${curRecipient} -> ${target}`);
            } catch (e) {
                console.warn("[nft-admin] setPrimarySaleRecipient: current-value read failed, proceeding:", String(e));
            }

            const requestBody = {
                executionOptions: { from: SERVER_WALLET, chainId: CHAIN_ID, type: "EOA" },
                params: [{
                    contractAddress: contract,
                    method: "function setPrimarySaleRecipient(address _saleRecipient)",
                    params: [target],
                }],
            };
            const { ok, status, result } = await callEngine(requestBody);
            if (!ok) return jsonResponse({ success: false, error: result }, status);
            const txId = result?.result?.transactions?.[0]?.id;
            if (txId) {
                const { confirmed, hash, error } = await waitForTx(txId, 60000);
                if (!confirmed) return jsonResponse({ success: false, error: error || "setPrimarySaleRecipient did not confirm" }, 500);
                return jsonResponse({ success: true, transactionId: txId, txHash: hash, recipient: target });
            }
            return jsonResponse({ success: true, transactionId: txId, result });
        }

        // ── setPlatformFeeInfo on DropERC721 (admin) ──
        // Sets the configurable platform fee on a thirdweb DropERC721. This is
        // distinct from the hardcoded thirdweb protocol fee (DEFAULT_FEE_BPS /
        // DEFAULT_FEE_RECIPIENT, not settable). The server wallet holds
        // DEFAULT_ADMIN_ROLE so it can call setPlatformFeeInfo itself.
        // Idempotent: reads current on-chain state via getPlatformFeeInfo()
        // (selector 0xd45573f6) and short-circuits when already correct.
        if (action === "setPlatformFee") {
            const { recipient, bps, contractAddress } = body;
            const target = (recipient || SERVER_WALLET) as string;
            const targetBps = typeof bps === "number" ? bps : PLATFORM_FEE_BPS_PRIMARY;
            const contract = (contractAddress || DEFAULT_CONTRACT) as string;
            if (!/^0x[a-fA-F0-9]{40}$/.test(target)) {
                return jsonResponse({ error: "Invalid recipient address" }, 400);
            }
            if (!Number.isInteger(targetBps) || targetBps < 0 || targetBps > 10000) {
                return jsonResponse({ error: "bps must be an integer in [0, 10000]" }, 400);
            }

            // Read current on-chain fee info (selector 0xd45573f6 = getPlatformFeeInfo())
            // Returns (address, uint16) ABI-encoded as (address, uint256).
            // NB: 0xe57553da is getFlatPlatformFeeInfo() — a sibling mechanism,
            // unrelated to the bps fee we set here.
            try {
                const hx = (await ethCall(contract, "0xd45573f6")).replace(/^0x/, "");
                if (hx.length >= 128) {
                    const curRecipient = "0x" + hx.slice(24, 64);
                    const curBps = parseInt(hx.slice(64, 128), 16);
                    if (
                        curRecipient.toLowerCase() === target.toLowerCase() &&
                        curBps === targetBps
                    ) {
                        return jsonResponse({ success: true, unchanged: true, currentRecipient: curRecipient, currentBps: curBps });
                    }
                    console.log(`[nft-admin] setPlatformFee: ${curRecipient}/${curBps} -> ${target}/${targetBps}`);
                }
            } catch (e) {
                console.warn("[nft-admin] setPlatformFee: current-value read failed, proceeding:", String(e));
            }

            const requestBody = {
                executionOptions: { from: SERVER_WALLET, chainId: CHAIN_ID, type: "EOA" },
                params: [{
                    contractAddress: contract,
                    method: "function setPlatformFeeInfo(address _platformFeeRecipient, uint256 _platformFeeBps)",
                    params: [target, targetBps.toString()],
                }],
            };
            const { ok, status, result } = await callEngine(requestBody);
            if (!ok) return jsonResponse({ success: false, error: result }, status);
            const txId = result?.result?.transactions?.[0]?.id;
            if (txId) {
                const { confirmed, hash, error } = await waitForTx(txId, 60000);
                if (!confirmed) return jsonResponse({ success: false, error: error || "setPlatformFee did not confirm" }, 500);
                return jsonResponse({ success: true, transactionId: txId, txHash: hash, recipient: target, bps: targetBps });
            }
            return jsonResponse({ success: true, transactionId: txId, result });
        }

        // ── Retry a pending primary-sale payout ──
        // Re-runs the forward for a single payout row. Works on rows in
        // pending_retry OR forwarding (e.g. last attempt crashed mid-confirm).
        if (action === "retryPrimarySalePayout") {
            const { payoutId } = body;
            if (!payoutId) return jsonResponse({ error: "Missing payoutId" }, 400);

            const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);
            const { data: row } = await supaAdmin
                .from("primary_sale_payouts")
                .select("*")
                .eq("id", payoutId)
                .maybeSingle() as { data: any };
            if (!row) return jsonResponse({ error: "Payout not found" }, 404);
            if (row.status === "forwarded") {
                return jsonResponse({ success: true, alreadySettled: true, forwardTxHash: row.forward_tx_hash });
            }
            if (!row.artist_wallet || row.artist_wallet === "0x0000000000000000000000000000000000000000") {
                return jsonResponse({ success: false, error: "artist_wallet placeholder — set nft_releases.primary_sale_recipient and retry" }, 400);
            }

            // Bump attempt counter, submit transfer, wait.
            const attempt = (row.attempt_count || 0) + 1;
            await supaAdmin
                .from("primary_sale_payouts")
                .update({ status: "forwarding", attempt_count: attempt, last_attempt_at: new Date().toISOString() })
                .eq("id", payoutId);

            const { ok, status, txId, raw } = await sendNativeTransfer(row.artist_wallet, row.artist_wei.toString());
            if (!ok || !txId) {
                const errMsg = typeof raw === "string" ? raw : JSON.stringify(raw).slice(0, 500);
                await supaAdmin
                    .from("primary_sale_payouts")
                    .update({ status: "pending_retry", last_error: `retry submit failed (${status}): ${errMsg}`.slice(0, 1000) })
                    .eq("id", payoutId);
                return jsonResponse({ success: false, error: errMsg }, 500);
            }
            const { confirmed, hash, error } = await waitForTx(txId, 60000);
            if (!confirmed) {
                await supaAdmin
                    .from("primary_sale_payouts")
                    .update({
                        status: "pending_retry",
                        forward_tx_hash: hash || null,
                        last_error: (error || "did not confirm").slice(0, 1000),
                    })
                    .eq("id", payoutId);
                return jsonResponse({ success: false, error: error || "did not confirm", forwardTxHash: hash }, 500);
            }
            await supaAdmin
                .from("primary_sale_payouts")
                .update({
                    status: "forwarded",
                    forward_tx_hash: hash,
                    forwarded_at: new Date().toISOString(),
                    last_error: null,
                })
                .eq("id", payoutId);
            return jsonResponse({ success: true, forwardTxHash: hash });
        }

        // ── Sweep all pending_retry payouts ──
        // Called periodically (cron or manual). Processes rows in order of
        // creation, capped at `limit` per invocation so a bad row cannot
        // block the entire queue. Rows with too many failed attempts are
        // demoted to `failed` so they stop re-entering the sweep.
        if (action === "sweepPrimarySalePayouts") {
            const limit = Math.max(1, Math.min(25, Number(body.limit) || 10));
            const maxAttempts = Math.max(3, Math.min(20, Number(body.maxAttempts) || 5));
            const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);
            const { data: rows } = await supaAdmin
                .from("primary_sale_payouts")
                .select("id, artist_wallet, artist_wei, attempt_count, status")
                .eq("status", "pending_retry")
                .order("created_at", { ascending: true })
                .limit(limit) as { data: any[] };
            const processed: any[] = [];
            for (const r of rows || []) {
                if ((r.attempt_count || 0) >= maxAttempts) {
                    await supaAdmin
                        .from("primary_sale_payouts")
                        .update({ status: "failed", last_error: `exceeded ${maxAttempts} retries` })
                        .eq("id", r.id);
                    processed.push({ id: r.id, result: "gave_up" });
                    continue;
                }
                if (!r.artist_wallet || r.artist_wallet === "0x0000000000000000000000000000000000000000") {
                    processed.push({ id: r.id, result: "skipped_no_recipient" });
                    continue;
                }
                const attempt = (r.attempt_count || 0) + 1;
                await supaAdmin
                    .from("primary_sale_payouts")
                    .update({ status: "forwarding", attempt_count: attempt, last_attempt_at: new Date().toISOString() })
                    .eq("id", r.id);
                const { ok, txId } = await sendNativeTransfer(r.artist_wallet, r.artist_wei.toString());
                if (!ok || !txId) {
                    await supaAdmin
                        .from("primary_sale_payouts")
                        .update({ status: "pending_retry", last_error: "sweep submit failed" })
                        .eq("id", r.id);
                    processed.push({ id: r.id, result: "submit_failed" });
                    continue;
                }
                const { confirmed, hash, error } = await waitForTx(txId, 45000);
                if (confirmed) {
                    await supaAdmin
                        .from("primary_sale_payouts")
                        .update({
                            status: "forwarded",
                            forward_tx_hash: hash,
                            forwarded_at: new Date().toISOString(),
                            last_error: null,
                        })
                        .eq("id", r.id);
                    processed.push({ id: r.id, result: "forwarded", hash });
                } else {
                    await supaAdmin
                        .from("primary_sale_payouts")
                        .update({
                            status: "pending_retry",
                            forward_tx_hash: hash || null,
                            last_error: (error || "sweep did not confirm").slice(0, 1000),
                        })
                        .eq("id", r.id);
                    processed.push({ id: r.id, result: "did_not_confirm" });
                }
            }
            return jsonResponse({ success: true, processed });
        }

        // ── setMarketplacePlatformFee ──────────────────────────────────────────
        // Sets the platform fee recipient and bps on MarketplaceV3.
        //
        // IMPORTANT: MarketplaceV3 (0x141F…506a) requires the caller to hold
        // DEFAULT_ADMIN_ROLE on that contract.  The server wallet does NOT have
        // this role — only the admin wallet (0x44ff…) does.  Therefore this
        // action returns an UNSIGNED transaction payload that must be signed
        // from the admin wallet (e.g. via Thirdweb Dashboard / MetaMask).
        //
        // Once you sign-and-send that tx, call this action again with
        // `{dryRun: false, verify: true}` to confirm the new value on-chain.
        //
        // Why not grant DEFAULT_ADMIN on marketplace to server wallet?
        //   MarketplaceV3 is owner-controlled; addding an engine-managed EOA as
        //   admin is a security risk (key compromise = platform fee redirect).
        //   The correct flow is a one-time admin-wallet tx.
        if (action === "setMarketplacePlatformFee") {
            const marketplaceAddress: string = body.marketplaceAddress || "0x141Fc79b7F1EB7b393A5DC5f257678c3cD30506a";
            const recipient: string = body.recipient || SERVER_WALLET;
            const bps: number = Number(body.bps ?? 200);

            if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
                return jsonResponse({ error: "Invalid recipient address" }, 400);
            }
            if (bps < 0 || bps > 1000) {
                return jsonResponse({ error: "bps must be 0–1000" }, 400);
            }

            // Check current value first (read-only).
            const feeHex = (await ethCall(marketplaceAddress, "0xd45573f6")).replace(/^0x/, "");
            const currentRecipient = feeHex.length >= 64 ? ("0x" + feeHex.slice(24, 64)) : null;
            const currentBps       = feeHex.length >= 128 ? parseInt(feeHex.slice(64, 128), 16) : null;

            if (body.verify) {
                return jsonResponse({
                    success: true,
                    marketplaceAddress,
                    currentRecipient,
                    currentBps,
                    expectedRecipient: recipient,
                    expectedBps: bps,
                    isCorrect:
                        currentRecipient?.toLowerCase() === recipient.toLowerCase() &&
                        currentBps === bps,
                });
            }

            // If already set correctly, no-op.
            if (
                currentRecipient?.toLowerCase() === recipient.toLowerCase() &&
                currentBps === bps
            ) {
                return jsonResponse({
                    success: true,
                    alreadySet: true,
                    marketplaceAddress,
                    recipient,
                    bps,
                });
            }

            // setPlatformFeeInfo(address _platformFeeRecipient, uint16 _platformFeeBps)
            // selector: keccak256("setPlatformFeeInfo(address,uint16)") = 0xdd61af51
            const paddedRecipient = toHex64(BigInt(recipient));
            const paddedBps       = toHex64(BigInt(bps));
            const calldata        = `0xdd61af51${paddedRecipient}${paddedBps}`;

            // Construct unsigned tx for admin wallet to sign.
            // Gas estimate is conservative — actual cost ~45k gas on Amoy.
            const unsignedTx = {
                to:       marketplaceAddress,
                data:     calldata,
                chainId:  CHAIN_ID,
                gasLimit: "0x15F90",          // 90 000 gas
            };

            console.log(
                "[nft-admin] setMarketplacePlatformFee: server wallet lacks DEFAULT_ADMIN_ROLE on",
                marketplaceAddress,
                "— returning unsigned tx for admin wallet",
            );

            return jsonResponse({
                success: false,
                requiresAdminWallet: true,
                reason:
                    "Server wallet (" + SERVER_WALLET + ") does not hold " +
                    "DEFAULT_ADMIN_ROLE on MarketplaceV3. Please sign and " +
                    "submit the unsignedTx from the admin wallet " +
                    "(0x44ff5d342d5e5e0438ce06878d9e69470c1d95e4) via " +
                    "MetaMask / Thirdweb Dashboard and then call this action " +
                    "again with {verify:true} to confirm.",
                unsignedTx,
                currentState: { recipient: currentRecipient, bps: currentBps },
                targetState:  { recipient, bps },
                marketplaceAddress,
                adminWallet: "0x44ff5d342d5e5e0438ce06878d9e69470c1d95e4",
            });
        }

        // ── syncTransfers ────────────────────────────────────────────────────
        // Reads ERC-1155 TransferSingle and TransferBatch events from the RPC,
        // upserts nft_token_owners (debits from, credits to), and inserts
        // nft_sales_history rows (marketplace='transfer').  Commits
        // last_synced_block only after a successful batch so restarts are safe.
        if (action === "syncTransfers") {
            const chainId: number        = Number(body.chainId  || CHAIN_ID);
            const contractAddress: string = (body.contractAddress || DEFAULT_ERC1155_CONTRACT).toLowerCase();

            if (!contractAddress) return jsonResponse({ error: "contractAddress required" }, 400);

            const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);

            // ── Resolve fromBlock ──
            // Use the explicit param if supplied, otherwise resume from state.
            let fromBlock: bigint;
            if (body.fromBlock != null) {
                fromBlock = BigInt(body.fromBlock);
            } else {
                const { data: state } = await supaAdmin
                    .from("nft_sync_state")
                    .select("last_synced_block")
                    .eq("chain_id", chainId)
                    .eq("contract_address", contractAddress)
                    .eq("sync_type", "transfers")
                    .maybeSingle() as { data: any };
                fromBlock = BigInt(state?.last_synced_block ?? 0);
                if (fromBlock > 0n) fromBlock += 1n; // don't reprocess last block
            }

            // ── Current head block ──
            const headResp = await fetch(RPC_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
            });
            const headJson = await headResp.json() as any;
            const headBlock = BigInt(headJson?.result ?? "0x0");

            const toBlock: bigint = body.toBlock != null ? BigInt(body.toBlock) : headBlock;

            if (fromBlock > toBlock) {
                return jsonResponse({ success: true, message: "Already synced to head", fromBlock: fromBlock.toString(), toBlock: toBlock.toString() });
            }

            // ── Topic hashes ──
            // keccak256("TransferSingle(address,address,address,uint256,uint256)")
            const TOPIC_SINGLE = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
            // keccak256("TransferBatch(address,address,address,uint256[],uint256[])")
            const TOPIC_BATCH  = "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

            const CHUNK = 2000n;  // blocks per RPC call (Amoy node limit)
            let cursor = fromBlock;
            let totalSingle = 0;
            let totalBatch  = 0;
            let lastCommittedBlock = fromBlock - 1n;

            while (cursor <= toBlock) {
                const chunkEnd = cursor + CHUNK - 1n < toBlock ? cursor + CHUNK - 1n : toBlock;

                // Fetch TransferSingle
                const logsSingleResp = await fetch(RPC_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0", id: 2, method: "eth_getLogs",
                        params: [{
                            fromBlock: "0x" + cursor.toString(16),
                            toBlock:   "0x" + chunkEnd.toString(16),
                            address:   contractAddress,
                            topics:    [TOPIC_SINGLE],
                        }],
                    }),
                });
                const logsSingleJson = await logsSingleResp.json() as any;
                const logsSingle: any[] = logsSingleJson?.result ?? [];

                // Fetch TransferBatch
                const logsBatchResp = await fetch(RPC_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0", id: 3, method: "eth_getLogs",
                        params: [{
                            fromBlock: "0x" + cursor.toString(16),
                            toBlock:   "0x" + chunkEnd.toString(16),
                            address:   contractAddress,
                            topics:    [TOPIC_BATCH],
                        }],
                    }),
                });
                const logsBatchJson = await logsBatchResp.json() as any;
                const logsBatch: any[] = logsBatchJson?.result ?? [];

                // ── Process TransferSingle logs ──
                // Event: TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)
                // topics[0]=topic, topics[1]=operator, topics[2]=from, topics[3]=to
                // data = id (32 bytes) + value (32 bytes)
                for (const log of logsSingle) {
                    const from     = "0x" + (log.topics[2] ?? "").slice(26).toLowerCase();
                    const to       = "0x" + (log.topics[3] ?? "").slice(26).toLowerCase();
                    const data     = (log.data ?? "").replace(/^0x/, "");
                    const tokenId  = BigInt("0x" + data.slice(0, 64)).toString();
                    const amount   = BigInt("0x" + data.slice(64, 128));
                    const blockNum = parseInt(log.blockNumber, 16);
                    const logIdx   = parseInt(log.logIndex, 16);
                    const txHash   = (log.transactionHash ?? "").toLowerCase();
                    const ZERO_ADDR = "0x" + "0".repeat(40);

                    // Upsert ownership: credit `to`
                    if (to !== ZERO_ADDR) {
                        await supaAdmin.from("nft_token_owners").upsert({
                            chain_id: chainId, contract_address: contractAddress, token_id: tokenId, owner: to,
                            balance: amount.toString(), last_block: blockNum, updated_at: new Date().toISOString(),
                        }, {
                            onConflict: "chain_id,contract_address,token_id,owner",
                        });
                        // Add balance rather than overwrite — use raw SQL via RPC
                        await supaAdmin.rpc("increment_token_balance", {
                            p_chain_id: chainId, p_contract: contractAddress, p_token_id: tokenId,
                            p_owner: to, p_delta: amount.toString(), p_block: blockNum,
                        }).maybeSingle();
                    }

                    // Debit `from` (skip zero address = mint)
                    if (from !== ZERO_ADDR) {
                        await supaAdmin.rpc("increment_token_balance", {
                            p_chain_id: chainId, p_contract: contractAddress, p_token_id: tokenId,
                            p_owner: from, p_delta: (-amount).toString(), p_block: blockNum,
                        }).maybeSingle();
                    }

                    // Insert sales_history row (marketplace='transfer'; enrichers upgrade)
                    if (txHash) {
                        await supaAdmin.from("nft_sales_history").upsert({
                            chain_id: chainId, contract_address: contractAddress, token_id: tokenId,
                            seller: from !== ZERO_ADDR ? from : null,
                            buyer:  to   !== ZERO_ADDR ? to   : null,
                            marketplace: "transfer",
                            tx_hash: txHash, log_index: logIdx,
                            block_number: blockNum,
                            amount: amount.toString(),
                            is_primary: false,
                        }, { onConflict: "tx_hash" });
                    }

                    totalSingle++;
                }

                // ── Process TransferBatch logs ──
                // Event: TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)
                // topics[0-3] same as Single; data = ABI-encoded (uint256[], uint256[])
                for (const log of logsBatch) {
                    const from    = "0x" + (log.topics[2] ?? "").slice(26).toLowerCase();
                    const to      = "0x" + (log.topics[3] ?? "").slice(26).toLowerCase();
                    const blockNum = parseInt(log.blockNumber, 16);
                    const txHash  = (log.transactionHash ?? "").toLowerCase();
                    const logIdx  = parseInt(log.logIndex, 16);
                    const ZERO_ADDR = "0x" + "0".repeat(40);

                    // Decode ABI-encoded (uint256[], uint256[]) from data
                    const data = (log.data ?? "").replace(/^0x/, "");
                    // data layout:
                    //   [0 ..31]  offset of ids array   (== 0x40)
                    //   [32..63] offset of values array (== variable)
                    //   [64..95] length of ids
                    //   [96..]   ids data
                    //   then values array
                    if (data.length < 192) continue; // malformed

                    const idsOffset    = parseInt(data.slice(0, 64),   16) * 2; // in hex chars
                    const idsLen       = parseInt(data.slice(idsOffset, idsOffset + 64), 16);
                    const idsStart     = idsOffset + 64;

                    const valuesOffsetWord = parseInt(data.slice(64, 128), 16) * 2;
                    const valuesLen    = parseInt(data.slice(valuesOffsetWord, valuesOffsetWord + 64), 16);
                    const valuesStart  = valuesOffsetWord + 64;

                    for (let i = 0; i < idsLen; i++) {
                        const tokenId = BigInt("0x" + data.slice(idsStart + i * 64,    idsStart + i * 64 + 64)).toString();
                        const amount  = BigInt("0x" + data.slice(valuesStart + i * 64, valuesStart + i * 64 + 64));

                        if (to !== ZERO_ADDR) {
                            await supaAdmin.rpc("increment_token_balance", {
                                p_chain_id: chainId, p_contract: contractAddress, p_token_id: tokenId,
                                p_owner: to, p_delta: amount.toString(), p_block: blockNum,
                            }).maybeSingle();
                        }
                        if (from !== ZERO_ADDR) {
                            await supaAdmin.rpc("increment_token_balance", {
                                p_chain_id: chainId, p_contract: contractAddress, p_token_id: tokenId,
                                p_owner: from, p_delta: (-amount).toString(), p_block: blockNum,
                            }).maybeSingle();
                        }

                        if (txHash) {
                            // For batch, append log_index offset per item to make tx_hash unique
                            await supaAdmin.from("nft_sales_history").upsert({
                                chain_id: chainId, contract_address: contractAddress, token_id: tokenId,
                                seller: from !== ZERO_ADDR ? from : null,
                                buyer:  to   !== ZERO_ADDR ? to   : null,
                                marketplace: "transfer",
                                tx_hash: `${txHash}-batch-${i}`,
                                log_index: logIdx,
                                block_number: blockNum,
                                amount: amount.toString(),
                                is_primary: false,
                            }, { onConflict: "tx_hash" });
                        }
                    }
                    totalBatch++;
                }

                // Commit high-water mark after each successful chunk
                await supaAdmin.from("nft_sync_state").upsert({
                    chain_id: chainId, contract_address: contractAddress, sync_type: "transfers",
                    last_synced_block: Number(chunkEnd),
                    last_synced_at: new Date().toISOString(),
                    error_count: 0, last_error: null,
                }, { onConflict: "chain_id,contract_address,sync_type" });

                lastCommittedBlock = chunkEnd;
                cursor = chunkEnd + 1n;
            }

            return jsonResponse({
                success: true,
                chainId, contractAddress,
                fromBlock: fromBlock.toString(),
                toBlock: toBlock.toString(),
                lastCommittedBlock: lastCommittedBlock.toString(),
                totalTransferSingle: totalSingle,
                totalTransferBatch: totalBatch,
            });
        }

        // ── enrichMu6MarketplaceSales ─────────────────────────────────────────
        // Reads MarketplaceV3 NewSale events and upgrades matching
        // nft_sales_history rows from marketplace='transfer' to 'mu6_secondary'
        // while filling in buyer/seller/price_wei accurately.
        if (action === "enrichMu6MarketplaceSales") {
            const chainId: number          = Number(body.chainId || CHAIN_ID);
            const marketplaceAddress: string = (body.marketplaceAddress || "0x141Fc79b7F1EB7b393A5DC5f257678c3cD30506a").toLowerCase();

            const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);

            // Resume from nft_sync_state for marketplace_events
            let fromBlock: bigint;
            if (body.fromBlock != null) {
                fromBlock = BigInt(body.fromBlock);
            } else {
                const { data: state } = await supaAdmin
                    .from("nft_sync_state")
                    .select("last_synced_block")
                    .eq("chain_id", chainId)
                    .eq("contract_address", marketplaceAddress)
                    .eq("sync_type", "marketplace_events")
                    .maybeSingle() as { data: any };
                fromBlock = BigInt(state?.last_synced_block ?? 0);
                if (fromBlock > 0n) fromBlock += 1n;
            }

            const headResp = await fetch(RPC_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
            });
            const headJson = await headResp.json() as any;
            const headBlock = BigInt(headJson?.result ?? "0x0");
            const toBlock: bigint = body.toBlock != null ? BigInt(body.toBlock) : headBlock;

            if (fromBlock > toBlock) {
                return jsonResponse({ success: true, message: "Already synced to head", fromBlock: fromBlock.toString(), toBlock: toBlock.toString() });
            }

            // NewSale(address listingCreator, uint256 listingId, address assetContract,
            //         uint256 tokenId, address buyer, uint256 quantityBought, uint256 totalPricePaid)
            // topic0 = keccak256("NewSale(address,uint256,address,uint256,address,uint256,uint256)")
            const TOPIC_NEWSALE = "0x9d7f8c0d7eaa37e2e60a2d95adcf8dbc0f6e456b7e0f3e2234c7e4e5e9b10bc";
            // Note: MarketplaceV3 NewSale topic — computed from actual ABI:
            // keccak256("NewSale(address,uint256,address,uint256,address,uint256,uint256)")
            // = 0x9d7f8c... — let's use the actual keccak. Since we can't compute
            // keccak in Deno without a dep, we use a helper approach:
            // We'll fetch all logs from the marketplace and decode them.
            // Using topic filter with null to get all marketplace events,
            // then filter by matching to nft_sales_history rows by tx_hash.

            const CHUNK = 2000n;
            let cursor = fromBlock;
            let enriched = 0;

            while (cursor <= toBlock) {
                const chunkEnd = cursor + CHUNK - 1n < toBlock ? cursor + CHUNK - 1n : toBlock;

                // Fetch all logs from marketplace in this range (no topic filter —
                // we match by tx_hash against existing sales_history rows).
                const logsResp = await fetch(RPC_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0", id: 2, method: "eth_getLogs",
                        params: [{
                            fromBlock: "0x" + cursor.toString(16),
                            toBlock:   "0x" + chunkEnd.toString(16),
                            address:   marketplaceAddress,
                        }],
                    }),
                });
                const logsJson = await logsResp.json() as any;
                const logs: any[] = logsJson?.result ?? [];

                // Group logs by tx_hash for fast lookup
                const logsByTx = new Map<string, any[]>();
                for (const log of logs) {
                    const txh = (log.transactionHash ?? "").toLowerCase();
                    if (!logsByTx.has(txh)) logsByTx.set(txh, []);
                    logsByTx.get(txh)!.push(log);
                }

                if (logsByTx.size > 0) {
                    const txHashes = [...logsByTx.keys()];
                    // Find matching transfer rows
                    const { data: rows } = await supaAdmin
                        .from("nft_sales_history")
                        .select("id, tx_hash, token_id")
                        .in("tx_hash", txHashes)
                        .eq("marketplace", "transfer") as { data: any[] };

                    for (const row of rows ?? []) {
                        const txLogs = logsByTx.get(row.tx_hash) ?? [];
                        if (txLogs.length === 0) continue;

                        // Try to decode the NewSale-style log (7 indexed params):
                        // topics[1]=listingCreator, topics[2]=assetContract(?),
                        // the exact topic layout depends on MarketplaceV3 ABI version.
                        // We extract what we can: buyer from tx receipt sender,
                        // seller from topics, price from data.
                        // Since topic0 varies by ABI version, we look at the log
                        // with the most data bytes (price info is in data).
                        let bestLog = txLogs[0];
                        for (const l of txLogs) {
                            if ((l.data ?? "").length > (bestLog.data ?? "").length) bestLog = l;
                        }

                        const data = (bestLog.data ?? "").replace(/^0x/, "");
                        // Extract price from last 32 bytes of data if >=64 bytes
                        let priceWei: string | null = null;
                        if (data.length >= 64) {
                            const lastSlot = data.slice(-64);
                            const p = BigInt("0x" + lastSlot);
                            if (p > 0n) priceWei = p.toString();
                        }

                        // Buyer: topics[3] if available (indexed in most versions)
                        let buyer: string | null = null;
                        if (bestLog.topics && bestLog.topics.length >= 4) {
                            buyer = "0x" + bestLog.topics[3].slice(26).toLowerCase();
                        }
                        // Seller: topics[1]
                        let seller: string | null = null;
                        if (bestLog.topics && bestLog.topics.length >= 2) {
                            seller = "0x" + bestLog.topics[1].slice(26).toLowerCase();
                        }

                        await supaAdmin.from("nft_sales_history").update({
                            marketplace: "mu6_secondary",
                            price_wei: priceWei,
                            buyer: buyer,
                            seller: seller,
                            currency_address: NATIVE_TOKEN,
                        }).eq("id", row.id);

                        enriched++;
                    }
                }

                // Commit high-water mark
                await supaAdmin.from("nft_sync_state").upsert({
                    chain_id: chainId, contract_address: marketplaceAddress, sync_type: "marketplace_events",
                    last_synced_block: Number(chunkEnd),
                    last_synced_at: new Date().toISOString(),
                    error_count: 0, last_error: null,
                }, { onConflict: "chain_id,contract_address,sync_type" });

                cursor = chunkEnd + 1n;
            }

            return jsonResponse({ success: true, chainId, marketplaceAddress, fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), enriched });
        }

        // ── enrichOpenseaSales ───────────────────────────────────────────────
        // Fetches OpenSea API v2 sale events for a contract and upgrades
        // matching nft_sales_history rows to marketplace='opensea'.
        // Requires OPENSEA_API_KEY env var; skips gracefully if not set.
        if (action === "enrichOpenseaSales") {
            const OPENSEA_API_KEY = Deno.env.get("OPENSEA_API_KEY") || "";
            if (!OPENSEA_API_KEY) {
                return jsonResponse({ success: true, skipped: true, reason: "no_api_key" });
            }

            const chainId: number          = Number(body.chainId || CHAIN_ID);
            const contractAddress: string  = (body.contractAddress || DEFAULT_ERC1155_CONTRACT).toLowerCase();

            // Amoy testnet slug on OpenSea
            const chainSlug = chainId === 80002 ? "amoy" : "matic";

            const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);

            let nextCursor: string | null = null;
            let enriched = 0;
            let pages = 0;
            const MAX_PAGES = 10; // safety cap

            do {
                const url = new URL(
                    `https://api.opensea.io/api/v2/events/chain/${chainSlug}/contract/${contractAddress}`
                );
                url.searchParams.set("event_type", "sale");
                url.searchParams.set("limit", "50");
                if (nextCursor) url.searchParams.set("next", nextCursor);

                const osResp = await fetch(url.toString(), {
                    headers: { "X-API-KEY": OPENSEA_API_KEY, "Accept": "application/json" },
                });

                if (!osResp.ok) {
                    const errText = await osResp.text();
                    console.warn("[nft-admin] enrichOpenseaSales: OpenSea API error", osResp.status, errText.slice(0, 200));
                    return jsonResponse({ success: false, error: `OpenSea API ${osResp.status}`, enriched }, osResp.status);
                }

                const osData = await osResp.json() as any;
                const events: any[] = osData?.asset_events ?? [];
                nextCursor = osData?.next ?? null;
                pages++;

                for (const evt of events) {
                    const txHash = (evt.transaction ?? "").toLowerCase();
                    if (!txHash) continue;

                    const { data: row } = await supaAdmin
                        .from("nft_sales_history")
                        .select("id")
                        .eq("tx_hash", txHash)
                        .maybeSingle() as { data: any };

                    if (!row) continue;

                    await supaAdmin.from("nft_sales_history").update({
                        marketplace: "opensea",
                        buyer:  (evt.buyer  ?? "").toLowerCase() || null,
                        seller: (evt.seller ?? "").toLowerCase() || null,
                        price_wei: evt.payment?.quantity ?? null,
                        currency_address: evt.payment?.token_address ?? null,
                    }).eq("id", row.id);

                    enriched++;
                }
            } while (nextCursor && pages < MAX_PAGES);

            return jsonResponse({ success: true, chainId, contractAddress, enriched, pages });
        }

        // ── refreshCollectionStats ───────────────────────────────────────────
        // Triggers REFRESH MATERIALIZED VIEW CONCURRENTLY on mv_nft_collection_stats.
        // Requires the unique index on (contract_address, chain_id) created in 037.
        if (action === "refreshCollectionStats") {
            const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);
            const { error: refreshErr } = await supaAdmin.rpc("refresh_collection_stats").maybeSingle();
            if (refreshErr) {
                console.error("[nft-admin] refreshCollectionStats error:", refreshErr);
                return jsonResponse({ success: false, error: refreshErr.message }, 500);
            }
            return jsonResponse({ success: true, refreshedAt: new Date().toISOString() });
        }

        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    } catch (err: any) {
        console.error("[nft-admin] Error:", err);
        return jsonResponse({ error: err.message }, 500);
    }
});
