import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
}

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
        const payload = await req.json();
        const { profileId, amountEur, paymentMethod, bankDetails } = payload;

        if (!profileId || !amountEur) {
            return jsonResponse({ error: "Missing required fields: profileId or amountEur" }, 400);
        }

        // Initialize Supabase admin client with the service role key to bypass RLS
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Ensure the profile actually exists and is not blocked/deactivated.
        // PDF #13 — blocked users cannot initiate payouts even if their client
        // somehow bypasses the UI suspended-screen redirect.
        const { data: profileExists, error: profileErr } = await supabaseAdmin
            .from("profiles")
            .select("id, is_blocked, is_active")
            .eq("id", profileId)
            .maybeSingle();

        if (profileErr || !profileExists) {
            return jsonResponse({ error: "Profile not found" }, 404);
        }

        if (profileExists.is_blocked === true) {
            return jsonResponse({
                success: false,
                error: "Your account is suspended. Please contact support to appeal.",
                code: "ACCOUNT_BLOCKED",
            }, 403);
        }

        if (profileExists.is_active === false) {
            return jsonResponse({
                success: false,
                error: "Your account is not active. Please contact support.",
                code: "ACCOUNT_INACTIVE",
            }, 403);
        }

        // PDF Fix #8: Reject if an active (pending) payout already exists for this profile.
        // This is also enforced at the DB level by the partial unique index in migration 022,
        // but we check here first so we can return a clean, specific error to the client.
        const { data: existingPending, error: existingErr } = await supabaseAdmin
            .from("payout_requests")
            .select("id")
            .eq("profile_id", profileId)
            .eq("status", "pending")
            .maybeSingle();

        if (existingErr) {
            console.error("[payout-request] Pending lookup error:", existingErr);
            return jsonResponse({ success: false, error: "Failed to validate existing payout requests" }, 500);
        }
        if (existingPending) {
            return jsonResponse({
                success: false,
                error: "You already have a pending payout request. Please wait for it to be approved or rejected before submitting a new one.",
                code: "PENDING_PAYOUT_EXISTS",
            }, 409);
        }

        // Insert the payout request securely bypassing RLS
        const { data, error } = await supabaseAdmin
            .from("payout_requests")
            .insert({
                profile_id: profileId,
                amount_eur: amountEur,
                payment_method: paymentMethod || "bank_transfer",
                payment_details: bankDetails,
                status: "pending",
            })
            .select("id")
            .single();

        if (error || !data) {
            // 23505 = unique_violation; this is the DB-level backstop if
            // two requests land in parallel and beat our explicit check above.
            if ((error as any)?.code === "23505") {
                return jsonResponse({
                    success: false,
                    error: "You already have a pending payout request. Please wait for it to be approved or rejected before submitting a new one.",
                    code: "PENDING_PAYOUT_EXISTS",
                }, 409);
            }
            console.error("[payout-request] Insert Error:", error);
            return jsonResponse({ success: false, error: error?.message || "Failed to create payout request" }, 500);
        }

        return jsonResponse({ success: true, id: data.id });
    } catch (err: any) {
        console.error("[payout-request] Edge function error:", err);
        return jsonResponse({ success: false, error: err.message }, 500);
    }
});
