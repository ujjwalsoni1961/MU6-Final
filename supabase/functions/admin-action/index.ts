import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const payload = await req.json();
        const { profileId, action, table, id, updates } = payload;

        if (!profileId || profileId !== 'superadmin') {
            // For extra security, you’d verify the JWT and check DB role if it's not the static superadmin bypass
            return jsonResponse({ error: "Unauthorized access" }, 401);
        }

        if (!action || !table) {
            return jsonResponse({ error: "Missing required basic fields" }, 400);
        }
        
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        if (action === "update") {
            const { data, error } = await supabaseAdmin
                .from(table)
                .update(updates)
                .eq("id", id)
                .select()
                .single();

            if (error) {
                console.error("[admin-action] Update Error:", error);
                return jsonResponse({ success: false, error: error.message }, 500);
            }

            return jsonResponse({ success: true, data });
        }
        
        if (action === "delete") {
            const { error } = await supabaseAdmin
                .from(table)
                .delete()
                .eq("id", id);

            if (error) {
                console.error("[admin-action] Delete Error:", error);
                return jsonResponse({ success: false, error: error.message }, 500);
            }

            return jsonResponse({ success: true });
        }

        if (action === "insert") {
            const { data, error } = await supabaseAdmin
                .from(table)
                .insert(updates)
                .select();

            if (error) {
                console.error("[admin-action] Insert Error:", error);
                return jsonResponse({ success: false, error: error.message }, 500);
            }

            return jsonResponse({ success: true, data });
        }
        
        return jsonResponse({ success: false, error: "Unsupported action" }, 400);

    } catch (err: any) {
        console.error("[admin-action] Edge function error:", err);
        return jsonResponse({ success: false, error: err.message }, 500);
    }
});
