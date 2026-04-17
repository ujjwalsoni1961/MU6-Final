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

const NETWORK = (Deno.env.get("MU6_NETWORK") || "amoy").toLowerCase();
const CHAIN_ID = NETWORK === "mainnet" ? 137 : 80002;
const SERVER_WALLET = Deno.env.get("MU6_SERVER_WALLET")
    || "0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39";
const DEFAULT_CONTRACT = Deno.env.get("MU6_SONG_NFT_ADDRESS")
    || "0xACF1145AdE250D356e1B2869E392e6c748c14C0E";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
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
        // Calls DropERC721.claim() on behalf of the buyer from the server wallet.
        // Uses Thirdweb Engine v1 /write/contract endpoint (the older /erc721/
        // claim-to path has been removed and now returns 404).
        if (action === "serverClaim") {
            const { receiverAddress, contractAddress, onChainPriceWei } = body;
            if (!receiverAddress) return jsonResponse({ error: "Missing receiverAddress" }, 400);

            const targetContract = contractAddress || DEFAULT_CONTRACT;
            const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

            // ── Read active claim condition on-chain (source of truth) ──
            // The contract's verifyClaim rejects any call whose _pricePerToken /
            // _currency args don't exactly match the active claim condition.
            // We query the chain and use those values rather than trusting the
            // client-supplied `onChainPriceWei`, which may be stale relative to
            // the on-chain state (e.g. if an admin re-set claim conditions).
            let pricePerToken = (onChainPriceWei ?? "0").toString();
            let currencyOnChain = NATIVE_TOKEN;
            try {
                // claimCondition() returns (currentStartId, count)
                const ccResp = await fetch(RPC_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: targetContract, data: "0xd637ed59" }, "latest"] }),
                });
                const ccData = await ccResp.json();
                const ccHex = (ccData?.result || "0x").slice(2);
                const currentStartId = BigInt("0x" + (ccHex.slice(0, 64) || "0"));
                // getClaimConditionById(currentStartId) selector 0x6f8934f4
                const idHex = currentStartId.toString(16).padStart(64, "0");
                const condResp = await fetch(RPC_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: targetContract, data: "0x6f8934f4" + idHex }, "latest"] }),
                });
                const condData = await condResp.json();
                const condHex = (condData?.result || "0x").slice(2);
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
                            `[nft-admin] serverClaim: client price ${onChainPriceWei} ≠ on-chain ${onChainPrice}; using on-chain (source of truth).`,
                        );
                    }
                }
            } catch (e) {
                console.warn("[nft-admin] serverClaim: failed to read claim condition, falling back to client price:", String(e));
            }

            // DropERC721.claim(receiver, quantity, currency, pricePerToken,
            //                  (proof, qtyLimitPerWallet, pricePerToken, currency), data)
            // For a public (no-allowlist) claim: proof = [], and the allowlist
            // tuple's qtyLimit/price/currency must match the active condition —
            // using MAX_UINT256/pricePerToken/currency is the standard
            // "no override" form Thirdweb SDK sends.
            const allowlistProof: [string[], string, string, string] = [
                [],
                MAX_UINT256,
                pricePerToken,
                currencyOnChain,
            ];

            const requestBody = {
                executionOptions: { from: SERVER_WALLET, chainId: CHAIN_ID, type: "EOA" },
                params: [{
                    contractAddress: targetContract,
                    method: "function claim(address _receiver, uint256 _quantity, address _currency, uint256 _pricePerToken, (bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) _allowlistProof, bytes _data) payable",
                    params: [
                        receiverAddress,
                        "1",
                        currencyOnChain,
                        pricePerToken,
                        allowlistProof,
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

            console.log("[nft-admin] serverClaim v1/write/contract receiver:", receiverAddress, "price:", pricePerToken);
            const { ok, status, result } = await callEngine(requestBody);
            console.log("[nft-admin] serverClaim engine response:", status, JSON.stringify(result));
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
            console.log("[nft-admin] serverClaim confirmed, hash:", hash);

            // Parse real on-chain tokenId from the Transfer event log.
            // Best-effort: if the receipt isn't available yet we return null —
            // the mobile reconciler will fill it in on retry.
            let onChainTokenId: string | null = null;
            if (hash) {
                onChainTokenId = await fetchMintedTokenId(hash, targetContract);
                console.log("[nft-admin] parsed on-chain tokenId:", onChainTokenId);
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
            });
        }

        // ── Set Claim Conditions (requires ADMIN role) ──
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

        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    } catch (err: any) {
        console.error("[nft-admin] Error:", err);
        return jsonResponse({ error: err.message }, 500);
    }
});
