/**
 * admin-action — hardened (SEC-05)
 *
 * Authorisation (either/or):
 *   1. Supabase JWT whose profile has role='admin' (the admin web panel)
 *   2. x-mu6-admin-secret header matching MU6_ADMIN_SECRET (cron / service)
 *
 * Previously required a client-exposed shared secret; that secret is now
 * server-only. Admin web callers authorise with their signed-in JWT.
 *
 * Also:
 *   * Locks writes to an allowlist of (table, action) pairs so a stolen
 *     JWT or secret cannot be used to clobber arbitrary tables.
 *   * Emits an entry in admin_audit_log on every call (success OR failure).
 *   * Runs under service_role to bypass RLS for intentional admin writes,
 *     while the guard trigger (migration 046) remains in place for the
 *     anon/authenticated path.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { verifyAdmin } from "../_shared/admin-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-mu6-admin-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

// (table, actions[])
const ALLOWED: Record<string, string[]> = {
    profiles: ["update", "delete"],
    songs: ["update", "delete"],
    albums: ["update", "delete"],
    nft_tokens: ["update", "delete"],
    nft_listings: ["update", "delete"],
    payout_requests: ["update"],
    platform_settings: ["update", "insert"],
    reported_content: ["update", "delete"],
    user_reports: ["update", "delete"],
    admin_users: ["update"],
};

async function audit(
    supabase: ReturnType<typeof createClient>,
    fields: {
        admin_id?: string | null;
        action: string;
        target_type?: string | null;
        target_id?: string | null;
        details?: unknown;
    },
) {
    try {
        await supabase.from("admin_audit_log").insert({
            admin_id: fields.admin_id ?? null,
            action: fields.action,
            target_type: fields.target_type ?? null,
            target_id:
                fields.target_id && /^[0-9a-f-]{36}$/i.test(fields.target_id)
                    ? fields.target_id
                    : null,
            details: fields.details ?? null,
        });
    } catch (e) {
        console.error("[admin-action] audit write failed", e);
    }
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Admin auth (JWT + profiles.role='admin' OR shared secret for cron)
    const authResult = await verifyAdmin(supabaseAdmin, req);
    if (!authResult.ok) {
        await audit(supabaseAdmin, {
            action: "admin-action:denied",
            details: { reason: authResult.reason || "unauthorized" },
        });
        return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const adminId = authResult.userId ?? null;

    let payload: any;
    try {
        payload = await req.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { action, table, id, updates } = payload || {};

    if (!action || !table) {
        return jsonResponse({ error: "Missing required fields: action, table" }, 400);
    }

    // 2. (table, action) allowlist
    const allowedActions = ALLOWED[table];
    if (!allowedActions || !allowedActions.includes(action)) {
        await audit(supabaseAdmin, {
            admin_id: adminId,
            action: `admin-action:blocked`,
            target_type: table,
            target_id: id ?? null,
            details: { reason: "table-action-not-allowlisted", action, table, mode: authResult.mode },
        });
        return jsonResponse(
            { error: `Action '${action}' not allowed on table '${table}'` },
            403,
        );
    }

    try {
        if (action === "update") {
            if (!id) return jsonResponse({ error: "Missing id for update" }, 400);
            const { data, error } = await supabaseAdmin
                .from(table)
                .update(updates)
                .eq("id", id)
                .select()
                .single();
            if (error) {
                await audit(supabaseAdmin, {
                    admin_id: adminId,
                    action: `admin-action:update:error`,
                    target_type: table,
                    target_id: id,
                    details: { error: error.message, updates, mode: authResult.mode },
                });
                return jsonResponse({ success: false, error: error.message }, 500);
            }
            await audit(supabaseAdmin, {
                admin_id: adminId,
                action: `admin-action:update`,
                target_type: table,
                target_id: id,
                details: { updates, mode: authResult.mode },
            });
            return jsonResponse({ success: true, data });
        }

        if (action === "delete") {
            if (!id) return jsonResponse({ error: "Missing id for delete" }, 400);
            const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
            if (error) {
                await audit(supabaseAdmin, {
                    admin_id: adminId,
                    action: `admin-action:delete:error`,
                    target_type: table,
                    target_id: id,
                    details: { error: error.message, mode: authResult.mode },
                });
                return jsonResponse({ success: false, error: error.message }, 500);
            }
            await audit(supabaseAdmin, {
                admin_id: adminId,
                action: `admin-action:delete`,
                target_type: table,
                target_id: id,
                details: { mode: authResult.mode },
            });
            return jsonResponse({ success: true });
        }

        if (action === "insert") {
            const { data, error } = await supabaseAdmin
                .from(table)
                .insert(updates)
                .select();
            if (error) {
                await audit(supabaseAdmin, {
                    admin_id: adminId,
                    action: `admin-action:insert:error`,
                    target_type: table,
                    details: { error: error.message, updates, mode: authResult.mode },
                });
                return jsonResponse({ success: false, error: error.message }, 500);
            }
            await audit(supabaseAdmin, {
                admin_id: adminId,
                action: `admin-action:insert`,
                target_type: table,
                details: { updates, mode: authResult.mode },
            });
            return jsonResponse({ success: true, data });
        }

        return jsonResponse({ success: false, error: "Unsupported action" }, 400);
    } catch (err: any) {
        console.error("[admin-action] Edge function error:", err);
        await audit(supabaseAdmin, {
            admin_id: adminId,
            action: `admin-action:exception`,
            target_type: table,
            target_id: id ?? null,
            details: { error: err?.message, mode: authResult.mode },
        });
        return jsonResponse({ success: false, error: err?.message }, 500);
    }
});
