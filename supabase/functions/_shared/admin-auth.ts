/**
 * Shared admin authorisation helper (SEC-05).
 *
 * Every admin-only edge function accepts TWO authorisation modes:
 *
 *   1. User path (browser admin panel):
 *        Authorization: Bearer <supabase JWT>
 *      We verify the JWT via supabase.auth.getUser(token) and then check
 *      profiles.role='admin' for the resolved user id.
 *
 *   2. Service path (cron jobs / internal edge-to-edge calls):
 *        x-mu6-admin-secret: <MU6_ADMIN_SECRET>
 *      Constant-time compared against the env value. This is NEVER bundled
 *      into the client any more; it is only used by trusted server-side
 *      callers.
 *
 * Returns { ok, reason, mode, userId? } so callers can branch on the
 * authorisation path (e.g. to record admin_id in audit logs).
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

export type AdminAuthMode = "jwt" | "secret";

export interface AdminAuthResult {
    ok: boolean;
    mode?: AdminAuthMode;
    userId?: string;
    reason?: string;
}

export function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/**
 * Verify a request is authorised as admin.
 *
 * - supabase: service-role client (for bypass RLS profile lookup)
 * - req: incoming Request
 * - options.allowSecretOnly: if true, only the shared-secret path is
 *   accepted (useful for truly cron-only endpoints). Default false.
 */
export async function verifyAdmin(
    supabase: SupabaseClient,
    req: Request,
    options: { allowSecretOnly?: boolean } = {},
): Promise<AdminAuthResult> {
    const MU6_ADMIN_SECRET = Deno.env.get("MU6_ADMIN_SECRET") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

    // Path 1: shared secret (cron / service-to-service)
    const headerSecret = req.headers.get("x-mu6-admin-secret") || "";
    if (
        MU6_ADMIN_SECRET.length > 0 &&
        headerSecret.length > 0 &&
        constantTimeEqual(headerSecret, MU6_ADMIN_SECRET)
    ) {
        return { ok: true, mode: "secret" };
    }

    if (options.allowSecretOnly) {
        return { ok: false, reason: "shared-secret required" };
    }

    // Path 2: Supabase JWT + profiles.role='admin'
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!bearer) {
        return { ok: false, reason: "missing authorization header" };
    }

    // Use a short-lived user-scoped client to resolve the JWT.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(bearer);
    if (userErr || !userData?.user?.id) {
        return { ok: false, reason: "invalid or expired JWT" };
    }

    const userId = userData.user.id;
    const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
    if (profErr) {
        return { ok: false, reason: `profile lookup failed: ${profErr.message}` };
    }
    if (!profile || profile.role !== "admin") {
        return { ok: false, reason: "user is not an admin" };
    }

    return { ok: true, mode: "jwt", userId };
}
