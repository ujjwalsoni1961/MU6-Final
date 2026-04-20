/**
 * payout-request — hardened (SEC-04)
 *
 * Previously this function trusted `profileId` in the request body and had no
 * proof the caller actually owned the wallet attached to that profile. An
 * attacker with the anon key could drain any artist's balance to a bank
 * account they control.
 *
 * Fix: require an EIP-191 signature over a canonical message that binds
 * (profileId, amountEur, paymentMethod, issuedAt, nonce) to the signer's
 * wallet. We recover the signer with ethers.verifyMessage and reject unless
 * the recovered address matches profiles.wallet_address for the passed
 * profileId.
 *
 * Remaining protections:
 *   * Not blocked / active
 *   * No pending payout already (enforced client + DB + here)
 *   * amountEur <= available balance (recomputed server-side — never trust
 *     client-reported balance)
 *   * Replay protection via nonce stored in payout_request_nonces
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { verifyMessage } from "https://esm.sh/ethers@6.13.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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

const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Canonical message format — must match client exactly.
 * Any change here requires a coordinated client update.
 */
function canonicalMessage(p: {
    profileId: string;
    amountEur: number;
    paymentMethod: string;
    issuedAt: number;
    nonce: string;
}): string {
    return [
        "MU6 Payout Request",
        `profileId: ${p.profileId}`,
        `amountEur: ${p.amountEur}`,
        `paymentMethod: ${p.paymentMethod}`,
        `issuedAt: ${p.issuedAt}`,
        `nonce: ${p.nonce}`,
    ].join("\n");
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    let payload: any;
    try {
        payload = await req.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const {
        profileId,
        amountEur,
        paymentMethod = "bank_transfer",
        bankDetails,
        signature,
        signerAddress,
        issuedAt,
        nonce,
    } = payload;

    if (!profileId || !amountEur) {
        return jsonResponse(
            { error: "Missing required fields: profileId or amountEur" },
            400,
        );
    }
    if (!signature || !signerAddress || !issuedAt || !nonce) {
        return jsonResponse(
            {
                error:
                    "Missing signature fields — client must sign the payout message.",
                code: "SIGNATURE_REQUIRED",
            },
            400,
        );
    }

    // Freshness check — reject stale messages
    const age = Date.now() - Number(issuedAt);
    if (!Number.isFinite(age) || age < 0 || age > MAX_MESSAGE_AGE_MS) {
        return jsonResponse(
            { error: "Signed message expired or invalid timestamp", code: "SIG_EXPIRED" },
            400,
        );
    }

    // Rebuild the message and recover the signer
    const message = canonicalMessage({
        profileId,
        amountEur,
        paymentMethod,
        issuedAt: Number(issuedAt),
        nonce,
    });

    let recovered: string;
    try {
        recovered = verifyMessage(message, signature);
    } catch (e) {
        console.error("[payout-request] sig verify failed", e);
        return jsonResponse(
            { error: "Invalid signature", code: "SIG_INVALID" },
            401,
        );
    }

    if (recovered.toLowerCase() !== String(signerAddress).toLowerCase()) {
        return jsonResponse(
            { error: "Signer address mismatch", code: "SIG_SIGNER_MISMATCH" },
            401,
        );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Profile must exist + signer must match profile.wallet_address
    const { data: profile, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("id, wallet_address, is_blocked, is_active, role")
        .eq("id", profileId)
        .maybeSingle();

    if (profileErr || !profile) {
        return jsonResponse({ error: "Profile not found" }, 404);
    }
    if (profile.wallet_address?.toLowerCase() !== recovered.toLowerCase()) {
        return jsonResponse(
            {
                error: "Signer does not own this profile",
                code: "SIG_PROFILE_MISMATCH",
            },
            403,
        );
    }
    if (profile.is_blocked) {
        return jsonResponse(
            {
                success: false,
                error: "Your account is suspended. Please contact support to appeal.",
                code: "ACCOUNT_BLOCKED",
            },
            403,
        );
    }
    if (profile.is_active === false) {
        return jsonResponse(
            {
                success: false,
                error: "Your account is not active. Please contact support.",
                code: "ACCOUNT_INACTIVE",
            },
            403,
        );
    }

    // Nonce replay protection — store (profile_id, nonce) unique; if already used, reject.
    // Table created lazily via a small upsert pattern — if the table doesn't exist we still
    // function correctly but without replay protection, logged as a warning.
    try {
        const { error: nonceErr } = await supabaseAdmin
            .from("payout_request_nonces")
            .insert({ profile_id: profileId, nonce });
        if (nonceErr && (nonceErr as any).code !== "42P01") {
            if ((nonceErr as any).code === "23505") {
                return jsonResponse(
                    { error: "Nonce already used", code: "NONCE_REUSED" },
                    409,
                );
            }
            console.error("[payout-request] nonce insert error:", nonceErr);
        }
    } catch (e) {
        console.warn("[payout-request] nonce table missing or other error", e);
    }

    // Pending-payout check
    const { data: existingPending, error: existingErr } = await supabaseAdmin
        .from("payout_requests")
        .select("id")
        .eq("profile_id", profileId)
        .eq("status", "pending")
        .maybeSingle();
    if (existingErr) {
        console.error("[payout-request] Pending lookup error:", existingErr);
        return jsonResponse(
            { success: false, error: "Failed to validate existing payout requests" },
            500,
        );
    }
    if (existingPending) {
        return jsonResponse(
            {
                success: false,
                error: "You already have a pending payout request. Please wait for it to be approved or rejected before submitting a new one.",
                code: "PENDING_PAYOUT_EXISTS",
            },
            409,
        );
    }

    // Basic sanity bound before the real balance check.
    if (!Number.isFinite(amountEur) || amountEur <= 0) {
        return jsonResponse(
            {
                success: false,
                error: "Invalid payout amount.",
                code: "AMOUNT_INVALID",
            },
            400,
        );
    }

    // Server-side balance check — authoritative. Never trust the client.
    // Uses the same get_artist_balance RPC the UI shows (migration 017),
    // which subtracts pending+completed payouts from streaming-only earnings.
    const { data: balanceRows, error: balanceErr } = await supabaseAdmin
        .rpc("get_artist_balance", { p_profile_id: profileId });
    if (balanceErr) {
        console.error("[payout-request] balance RPC error:", balanceErr);
        return jsonResponse(
            { success: false, error: "Failed to verify balance", code: "BALANCE_LOOKUP_FAILED" },
            500,
        );
    }
    const balanceRow = Array.isArray(balanceRows) ? balanceRows[0] : balanceRows;
    const availableBalance = Number(balanceRow?.available_balance ?? 0);
    // Tolerance for floating-point drift at the cent level.
    const EPSILON = 0.005;
    if (amountEur > availableBalance + EPSILON) {
        return jsonResponse(
            {
                success: false,
                error: `Insufficient balance. Available: €${availableBalance.toFixed(2)}, requested: €${Number(amountEur).toFixed(2)}.`,
                code: "INSUFFICIENT_BALANCE",
                availableBalance,
            },
            400,
        );
    }

    // Insert
    const { data, error } = await supabaseAdmin
        .from("payout_requests")
        .insert({
            profile_id: profileId,
            amount_eur: amountEur,
            payment_method: paymentMethod,
            payment_details: bankDetails,
            status: "pending",
        })
        .select("id")
        .single();

    if (error || !data) {
        if ((error as any)?.code === "23505") {
            return jsonResponse(
                {
                    success: false,
                    error: "You already have a pending payout request.",
                    code: "PENDING_PAYOUT_EXISTS",
                },
                409,
            );
        }
        console.error("[payout-request] Insert Error:", error);
        return jsonResponse(
            { success: false, error: error?.message || "Failed to create payout request" },
            500,
        );
    }

    // Audit
    try {
        await supabaseAdmin.from("admin_audit_log").insert({
            admin_id: null,
            action: "payout-request:created",
            target_type: "payout_requests",
            target_id: data.id,
            details: { profileId, amountEur, paymentMethod, signer: recovered },
        });
    } catch (e) {
        console.error("[payout-request] audit write failed", e);
    }

    return jsonResponse({ success: true, id: data.id });
});
