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

        // Optional: Re-verify balance server side before insert (Recommended for security)
        // Since we are creating a payout, we need to ensure the profile actually exists
        const { data: profileExists, error: profileErr } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("id", profileId)
            .maybeSingle();

        if (profileErr || !profileExists) {
            return jsonResponse({ error: "Profile not found" }, 404);
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
            console.error("[payout-request] Insert Error:", error);
            return jsonResponse({ success: false, error: error?.message || "Failed to create payout request" }, 500);
        }

        return jsonResponse({ success: true, id: data.id });
    } catch (err: any) {
        console.error("[payout-request] Edge function error:", err);
        return jsonResponse({ success: false, error: err.message }, 500);
    }
});
