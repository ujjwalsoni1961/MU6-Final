/**
 * get-audio-url — light DRM (SEC-05 / STR-01)
 *
 * The audio bucket is now private (migration 044). Clients can no longer
 * fetch directly. This function issues a short-lived (60s) signed URL to
 * the caller.
 *
 * Light-DRM checks (not enterprise grade — the user explicitly said so):
 *   * Bucket path must match {audio}/{creator_wallet or profile id}/...
 *     (we only verify the path exists).
 *   * Caller supplies profileId so we can log plays (optional — if missing
 *     we still serve, just don't log).
 *   * Rate-limit: no more than 60 signed URLs per IP per minute.
 *
 * The returned URL is tied to a random Supabase Storage token; Supabase
 * enforces the 60s window on its side. We do NOT embed the IP or user-agent
 * in the token because Supabase Storage doesn't support that — but 60s is
 * short enough that casual sharing / hotlinking is ineffective.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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

// In-memory rate limiter (reset on function cold-start — good enough for testnet).
const rate = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

function rateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rate.get(ip);
    if (!entry || now - entry.windowStart > WINDOW_MS) {
        rate.set(ip, { count: 1, windowStart: now });
        return true;
    }
    entry.count += 1;
    if (entry.count > MAX_PER_WINDOW) return false;
    return true;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Rate limit
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("cf-connecting-ip") || "unknown";
    if (!rateLimit(ip)) {
        return jsonResponse({ error: "Rate limit exceeded" }, 429);
    }

    let payload: any;
    try {
        payload = await req.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    const { path, profileId, expiresIn } = payload || {};
    if (!path || typeof path !== "string") {
        return jsonResponse({ error: "Missing path" }, 400);
    }

    // Safety: reject absolute URLs / path traversal
    if (
        path.startsWith("http") ||
        path.startsWith("/") ||
        path.includes("..") ||
        path.includes("\\")
    ) {
        return jsonResponse({ error: "Invalid path" }, 400);
    }

    const ttl = Math.min(Math.max(Number(expiresIn) || 60, 10), 60); // 10-60s

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabaseAdmin.storage
        .from("audio")
        .createSignedUrl(path, ttl);

    if (error || !data) {
        console.error("[get-audio-url] signed url error:", error);
        return jsonResponse(
            { error: error?.message || "Failed to sign URL" },
            404,
        );
    }

    // Best-effort play log (non-blocking, don't fail the request if it errors)
    if (profileId) {
        supabaseAdmin
            .from("audio_access_log")
            .insert({ profile_id: profileId, path, ip, created_at: new Date().toISOString() })
            .then(({ error: logErr }) => {
                if (logErr && (logErr as any).code !== "42P01") {
                    console.warn("[get-audio-url] log insert error:", logErr);
                }
            });
    }

    return jsonResponse({
        success: true,
        url: data.signedUrl,
        expiresIn: ttl,
    });
});
