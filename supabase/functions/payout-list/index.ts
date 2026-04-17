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
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
        const payload = await req.json();
        const { profileId } = payload;

        if (!profileId) {
            return jsonResponse({ error: "Missing required field: profileId" }, 400);
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        let isAdmin = false;

        // If 'superadmin' string is passed locally from Admin dashboard
        if (profileId === 'superadmin') {
            isAdmin = true;
        } else {
            // Check if the requesting profile is an admin
            const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("role")
                .eq("id", profileId)
                .single();
            if (profile?.role === "admin") {
                isAdmin = true;
            }
        }

        let query = supabaseAdmin
            .from("payout_requests")
            .select(`
                *,
                profile:profiles!profile_id ( id, display_name, wallet_address )
            `);

        // If not an admin, restrict to their own payouts
        if (!isAdmin) {
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
            debug: { isAdmin, parsedProfileId: profileId } 
        });
    } catch (err: any) {
        console.error("[payout-list] Edge function error:", err);
        return jsonResponse({ success: false, error: err.message }, 500);
    }
});
