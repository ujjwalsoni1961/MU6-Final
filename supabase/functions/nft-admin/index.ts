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

async function verifyAuth(req: Request): Promise<{ valid: boolean; error?: string }> {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return { valid: false, error: "Missing Authorization header" };
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
        return { valid: false, error: "Missing auth token" };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
        return { valid: false, error: "Invalid or expired auth token" };
    }

    return { valid: true };
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

async function waitForTx(txId: string, maxWaitMs = 30000): Promise<{ confirmed: boolean; hash?: string; error?: string }> {
    const startTime = Date.now();
    const pollUrl = `https://engine.thirdweb.com/v1/transactions/${txId}`;
    while (Date.now() - startTime < maxWaitMs) {
        try {
            const resp = await fetch(pollUrl, { headers: { "x-secret-key": THIRDWEB_SECRET_KEY } });
            const data = await resp.json();
            const status = data?.result?.status;
            if (status === "CONFIRMED" || status === "MINED") {
                return { confirmed: true, hash: data?.result?.transactionHash };
            }
            if (status === "FAILED" || status === "ERROR") {
                const errMsg = data?.result?.errorMessage || data?.result?.executionResult?.error?.errorCode || "Unknown error";
                console.error("[nft-admin] tx failed:", errMsg);
                return { confirmed: false, error: errMsg };
            }
        } catch (e) {
            console.warn("[nft-admin] poll error:", e);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    return { confirmed: false, error: "Timeout waiting for tx confirmation" };
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
        if (action === "serverClaim") {
            const { receiverAddress, contractAddress } = body;
            if (!receiverAddress) return jsonResponse({ error: "Missing receiverAddress" }, 400);

            const targetContract = contractAddress || DEFAULT_CONTRACT;
            const url = `https://engine.thirdweb.com/contract/${CHAIN_ID}/${targetContract}/erc721/claim-to`;
            const txBody = {
                receiver: receiverAddress,
                quantity: "1"
            };

            console.log("[nft-admin] serverClaim to:", receiverAddress, "endpoint:", url);
            const twResponse = await fetch(url, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    "x-secret-key": THIRDWEB_SECRET_KEY,
                    "x-backend-wallet-address": SERVER_WALLET
                },
                body: JSON.stringify(txBody),
            });

            const resultText = await twResponse.text();
            console.log("[nft-admin] serverClaim response:", twResponse.status, resultText);
            let result;
            try { result = JSON.parse(resultText); } catch { result = { raw: resultText }; }

            if (!twResponse.ok) return jsonResponse({ success: false, error: result }, twResponse.status);

            const txId = result?.result?.queueId || result?.result?.id;
            if (txId) {
                const { confirmed, hash, error } = await waitForTx(txId);
                if (!confirmed) return jsonResponse({ success: false, error: error || "serverClaim tx did not confirm" }, 500);
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
                });
            }
            return jsonResponse({ success: true, transactionId: txId, result });
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
                    const txStatusUrl = `https://engine.thirdweb.com/v1/transactions/${deployTxId}`;
                    const statusResp = await fetch(txStatusUrl, {
                        headers: { "x-secret-key": THIRDWEB_SECRET_KEY },
                    });
                    const statusData = await statusResp.json();
                    finalAddress = statusData?.result?.contractAddress
                        || statusData?.result?.deployedAddress;
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
                    const txStatusUrl = `https://engine.thirdweb.com/v1/transactions/${deployTxId}`;
                    const statusResp = await fetch(txStatusUrl, {
                        headers: { "x-secret-key": THIRDWEB_SECRET_KEY },
                    });
                    const statusData = await statusResp.json();
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
