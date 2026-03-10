import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ── Config ──
const THIRDWEB_SECRET_KEY = Deno.env.get("THIRDWEB_SECRET_KEY") || "";
const SERVER_WALLET = "0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39";
const DEFAULT_CONTRACT = "0xACF1145AdE250D356e1B2869E392e6c748c14C0E";
const CHAIN_ID = 80002;
const ENGINE_URL = "https://engine.thirdweb.com/v1/write/contract";

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

Deno.serve(async (req: Request) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!THIRDWEB_SECRET_KEY) {
        return jsonResponse({ error: "THIRDWEB_SECRET_KEY not configured" }, 500);
    }

    try {
        const body = await req.json();
        const { action } = body;

        // ── Lazy Mint ──
        if (action === "lazyMint") {
            const { amount, baseURI, contractAddress } = body;
            if (!amount || !baseURI) {
                return jsonResponse({ error: "Missing amount or baseURI" }, 400);
            }

            const requestBody = {
                executionOptions: {
                    from: SERVER_WALLET,
                    chainId: CHAIN_ID,
                    type: "EOA",          // force legacy EOA – avoids EIP-7702 bundler on Amoy
                },
                params: [
                    {
                        contractAddress: contractAddress || DEFAULT_CONTRACT,
                        method: "function lazyMint(uint256 _amount, string _baseURIForTokens, bytes _data)",
                        params: [amount.toString(), baseURI, "0x"],
                    },
                ],
            };

            console.log("[nft-admin] lazyMint request:", JSON.stringify(requestBody));

            const twResponse = await fetch(ENGINE_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-secret-key": THIRDWEB_SECRET_KEY,
                },
                body: JSON.stringify(requestBody),
            });

            const resultText = await twResponse.text();
            console.log("[nft-admin] lazyMint response:", twResponse.status, resultText);

            let result;
            try { result = JSON.parse(resultText); } catch { result = { raw: resultText }; }

            if (!twResponse.ok) {
                return jsonResponse({ success: false, error: result }, twResponse.status);
            }

            // Extract the transaction ID from the response
            const txId = result?.result?.transactions?.[0]?.id;
            return jsonResponse({ success: true, transactionId: txId, result });
        }

        // ── Set Claim Conditions ──
        if (action === "setClaimConditions") {
            const { priceWei, contractAddress } = body;

            const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

            const requestBody = {
                executionOptions: {
                    from: SERVER_WALLET,
                    chainId: CHAIN_ID,
                    type: "EOA",
                },
                params: [
                    {
                        contractAddress: contractAddress || DEFAULT_CONTRACT,
                        method: "function setClaimConditions((uint256 startTimestamp, uint256 maxClaimableSupply, uint256 supplyClaimed, uint256 quantityLimitPerWallet, bytes32 merkleRoot, uint256 pricePerToken, address currency, string metadata)[] _conditions, bool _resetClaimEligibility)",
                        params: [
                            JSON.stringify([{
                                startTimestamp: "0",
                                maxClaimableSupply: MAX_UINT256,
                                supplyClaimed: "0",
                                quantityLimitPerWallet: MAX_UINT256,
                                merkleRoot: "0x0000000000000000000000000000000000000000000000000000000000000000",
                                pricePerToken: priceWei || "0",
                                currency: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
                                metadata: "",
                            }]),
                            "true",
                        ],
                    },
                ],
            };

            console.log("[nft-admin] setClaimConditions request:", JSON.stringify(requestBody));

            const twResponse = await fetch(ENGINE_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-secret-key": THIRDWEB_SECRET_KEY,
                },
                body: JSON.stringify(requestBody),
            });

            const resultText = await twResponse.text();
            console.log("[nft-admin] setClaimConditions response:", twResponse.status, resultText);

            let result;
            try { result = JSON.parse(resultText); } catch { result = { raw: resultText }; }

            if (!twResponse.ok) {
                return jsonResponse({ success: false, error: result }, twResponse.status);
            }

            const txId = result?.result?.transactions?.[0]?.id;
            return jsonResponse({ success: true, transactionId: txId, result });
        }

        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    } catch (err: any) {
        console.error("[nft-admin] Error:", err);
        return jsonResponse({ error: err.message }, 500);
    }
});
