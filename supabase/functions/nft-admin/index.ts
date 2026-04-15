import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Config ──
const THIRDWEB_SECRET_KEY = Deno.env.get("THIRDWEB_SECRET_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVER_WALLET = "0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39";
const DEFAULT_CONTRACT = "0xACF1145AdE250D356e1B2869E392e6c748c14C0E";
const CHAIN_ID = 80002;
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

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
            const { receiverAddress, contractAddress, onChainPriceWei } = body;
            if (!receiverAddress) return jsonResponse({ error: "Missing receiverAddress" }, 400);

            const priceWei = onChainPriceWei || "0";

            const requestBody = {
                executionOptions: { from: SERVER_WALLET, chainId: CHAIN_ID, type: "EOA" },
                params: [{
                    contractAddress: contractAddress || DEFAULT_CONTRACT,
                    method: "function claim(address _receiver, uint256 _quantity, address _currency, uint256 _pricePerToken, (bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) _allowlistProof, bytes _data)",
                    params: [
                        receiverAddress,
                        "1",
                        NATIVE_TOKEN,
                        priceWei,
                        [[], "0", "0", NATIVE_TOKEN],
                        "0x",
                    ],
                    txOverrides: {
                        value: priceWei,
                    },
                }],
            };

            console.log("[nft-admin] serverClaim to:", receiverAddress, "price:", priceWei);
            const { ok, status, result } = await callEngine(requestBody);
            console.log("[nft-admin] serverClaim response:", status, JSON.stringify(result));
            if (!ok) return jsonResponse({ success: false, error: result }, status);

            const txId = result?.result?.transactions?.[0]?.id;
            if (txId) {
                const { confirmed, hash, error } = await waitForTx(txId);
                if (!confirmed) return jsonResponse({ success: false, error: error || "serverClaim tx did not confirm" }, 500);
                console.log("[nft-admin] serverClaim confirmed, hash:", hash);
                return jsonResponse({ success: true, transactionId: txId, txHash: hash });
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

        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    } catch (err: any) {
        console.error("[nft-admin] Error:", err);
        return jsonResponse({ error: err.message }, 500);
    }
});
