/**
 * payout-list — hardened (SEC-05)
 *
 * Admin callers authorise via EITHER:
 *   * Supabase JWT whose profile has role='admin' (admin web panel), OR
 *   * x-mu6-admin-secret header matching MU6_ADMIN_SECRET (cron / internal)
 *
 * User callers must send signature / signerAddress / issuedAt / nonce so we
 * can verify the caller owns the wallet linked to profileId.
 *
 * Response shape (unchanged):
 *   { success: true, payouts: PayoutRow[], debug: { isAdmin } }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { verifyMessage } from "https://esm.sh/ethers@6.13.4";
import { verifyAdmin } from "../_shared/admin-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
        "Content-Type, Authorization, apikey, x-mu6-admin-secret",
};

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
}

const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

function canonicalMessage(p: { profileId: string; issuedAt: number; nonce: string }) {
    return [
        "MU6 Payout List",
        `profileId: ${p.profileId}`,
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
        return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const { profileId, signature, signerAddress, issuedAt, nonce } = payload;

    if (!profileId) {
        return jsonResponse({ error: "Missing required field: profileId" }, 400);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. Admin path: Supabase JWT + profiles.role='admin' OR shared secret
    const adminCheck = await verifyAdmin(supabaseAdmin, req);
    const isAdminCaller = adminCheck.ok;

    // ── 2. User path via wallet signature
    let isOwner = false;
    if (!isAdminCaller) {
        if (!signature || !signerAddress || !issuedAt || !nonce) {
            return jsonResponse(
                {
                    error:
                        "Missing signature — non-admin callers must sign the listing request.",
                    code: "SIGNATURE_REQUIRED",
                },
                401,
            );
        }
        const age = Date.now() - Number(issuedAt);
        if (!Number.isFinite(age) || age < 0 || age > MAX_MESSAGE_AGE_MS) {
            return jsonResponse(
                { error: "Signed message expired", code: "SIG_EXPIRED" },
                401,
            );
        }
        let recovered: string;
        try {
            recovered = verifyMessage(
                canonicalMessage({
                    profileId,
                    issuedAt: Number(issuedAt),
                    nonce,
                }),
                signature,
            );
        } catch {
            return jsonResponse(
                { error: "Invalid signature", code: "SIG_INVALID" },
                401,
            );
        }
        if (recovered.toLowerCase() !== String(signerAddress).toLowerCase()) {
            return jsonResponse(
                { error: "Signer mismatch", code: "SIG_SIGNER_MISMATCH" },
                401,
            );
        }
        const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("wallet_address")
            .eq("id", profileId)
            .maybeSingle();
        if (!prof || prof.wallet_address?.toLowerCase() !== recovered.toLowerCase()) {
            return jsonResponse(
                { error: "Signer does not own profile", code: "SIG_PROFILE_MISMATCH" },
                403,
            );
        }
        isOwner = true;
    }

    try {
        let query = supabaseAdmin.from("payout_requests").select(
            `*, profile:profiles!profile_id ( id, display_name, wallet_address )`,
        );
        if (!isAdminCaller) {
            // user may only see their own
            query = query.eq("profile_id", profileId);
        }

        const { data, error } = await query.order("requested_at", { ascending: false });
        if (error) {
            console.error("[payout-list] Fetch Error:", error);
            return jsonResponse({ success: false, error: error.message }, 500);
        }
        return jsonResponse({
            success: true,
            payouts: data,
            debug: { isAdmin: isAdminCaller, adminMode: adminCheck.mode, isOwner },
        });
    } catch (err: any) {
        console.error("[payout-list] Edge function error:", err);
        return jsonResponse({ success: false, error: err?.message }, 500);
    }
});
