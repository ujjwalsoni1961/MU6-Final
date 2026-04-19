/**
 * admin-action — hardened (SEC-02)
 *
 * Replaces the previous `profileId === 'superadmin'` string check with a
 * shared-secret header (`x-mu6-admin-secret`) that must match the
 * MU6_ADMIN_SECRET edge-function secret. The admin panel ships that secret
 * via an env var only in the Vercel admin-web build.
 *
 * Also:
 *   * Locks writes to an allowlist of (table, action) pairs so a stolen
 *     secret cannot be used to clobber arbitrary tables.
 *   * Emits an entry in admin_audit_log on every call (success OR failure).
 *   * Runs under service_role to bypass RLS for intentional admin writes,
 *     while the guard trigger (migration 046) remains in place for the
 *     anon/authenticated path.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MU6_ADMIN_SECRET = Deno.env.get("MU6_ADMIN_SECRET") || "";

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

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

async function audit(
    supabase: ReturnType<typeof createClient>,
    fields: {
        action: string;
        target_type?: string | null;
        target_id?: string | null;
        details?: unknown;
    },
) {
    try {
        await supabase.from("admin_audit_log").insert({
            admin_id: null, // admin panel is still pre-SIWE; we log the secret-holder
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

    // 1. Shared-secret auth
    const headerSecret = req.headers.get("x-mu6-admin-secret") || "";
    if (!MU6_ADMIN_SECRET || !constantTimeEqual(headerSecret, MU6_ADMIN_SECRET)) {
        await audit(supabaseAdmin, {
            action: "admin-action:denied",
            details: { reason: "missing-or-invalid-secret" },
        });
        return jsonResponse({ error: "Unauthorized" }, 401);
    }

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
            action: `admin-action:blocked`,
            target_type: table,
            target_id: id ?? null,
            details: { reason: "table-action-not-allowlisted", action, table },
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
                    action: `admin-action:update:error`,
                    target_type: table,
                    target_id: id,
                    details: { error: error.message, updates },
                });
                return jsonResponse({ success: false, error: error.message }, 500);
            }
            await audit(supabaseAdmin, {
                action: `admin-action:update`,
                target_type: table,
                target_id: id,
                details: { updates },
            });
            return jsonResponse({ success: true, data });
        }

        if (action === "delete") {
            if (!id) return jsonResponse({ error: "Missing id for delete" }, 400);
            const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
            if (error) {
                await audit(supabaseAdmin, {
                    action: `admin-action:delete:error`,
                    target_type: table,
                    target_id: id,
                    details: { error: error.message },
                });
                return jsonResponse({ success: false, error: error.message }, 500);
            }
            await audit(supabaseAdmin, {
                action: `admin-action:delete`,
                target_type: table,
                target_id: id,
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
                    action: `admin-action:insert:error`,
                    target_type: table,
                    details: { error: error.message, updates },
                });
                return jsonResponse({ success: false, error: error.message }, 500);
            }
            await audit(supabaseAdmin, {
                action: `admin-action:insert`,
                target_type: table,
                details: { updates },
            });
            return jsonResponse({ success: true, data });
        }

        return jsonResponse({ success: false, error: "Unsupported action" }, 400);
    } catch (err: any) {
        console.error("[admin-action] Edge function error:", err);
        await audit(supabaseAdmin, {
            action: `admin-action:exception`,
            target_type: table,
            target_id: id ?? null,
            details: { error: err?.message },
        });
        return jsonResponse({ success: false, error: err?.message }, 500);
    }
});
