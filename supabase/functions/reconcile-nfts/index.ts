/**
 * reconcile-nfts
 *
 * Admin-callable edge function that reconciles the `nft_tokens` table with the
 * on-chain NFT contract state. For every row in the DB that has an
 * `on_chain_token_id`, we call `ownerOf(tokenId)` on-chain and update the
 * `owner_wallet_address` + `last_transferred_at` if they differ. Rows that
 * revert on `ownerOf` (token burned or non-existent) are flagged as voided.
 *
 * This complements the mint-time writes from admin-action: it covers the case
 * where an NFT is transferred directly (wallet-to-wallet) outside the
 * marketplace, which doesn't trigger any app-level event.
 *
 * Request body: { profileId: 'superadmin' }
 * Response: { updated: number, voided: number, unchanged: number, errors: number }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RPC_URL = Deno.env.get("AMOY_RPC_URL") ||
    "https://80002.rpc.thirdweb.com/64c9d6a04c2edcf1c8b117db980edd41";
const NFT_CONTRACT = Deno.env.get("NFT_CONTRACT_ADDRESS") ||
    "0xACF1145AdE250D356e1B2869E392e6c748c14C0E";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function uintHex(n: string): string {
    return "0x" + BigInt(n).toString(16).padStart(64, "0");
}

async function rpc(method: string, params: any[]): Promise<any> {
    const r = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const j = await r.json();
    if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
    return j.result;
}

async function ownerOf(tokenId: string): Promise<string | null> {
    try {
        // ownerOf(uint256) selector = 0x6352211e
        const data = "0x6352211e" + uintHex(tokenId).slice(2);
        const res = await rpc("eth_call", [{ to: NFT_CONTRACT, data }, "latest"]);
        if (!res || res === "0x") return null;
        return "0x" + res.slice(26).toLowerCase();
    } catch {
        return null;
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { profileId } = await req.json();
        if (profileId !== "superadmin") {
            return jsonResponse({ error: "Unauthorized" }, 401);
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Only reconcile rows that have a real on-chain id. Legacy rows with
        // on_chain_token_id=NULL are post-migration-028 filtered out of views
        // already and don't need touching here.
        const { data: tokens, error } = await supabase
            .from("nft_tokens")
            .select("id, on_chain_token_id, owner_wallet_address, is_voided")
            .not("on_chain_token_id", "is", null);

        if (error) {
            return jsonResponse({ error: error.message }, 500);
        }

        let updated = 0;
        let voided = 0;
        let unchanged = 0;
        let errors = 0;
        const report: Array<{
            tokenDbId: string;
            onChainTokenId: string;
            before: string;
            after: string | null;
            action: string;
        }> = [];

        for (const t of tokens || []) {
            const chainId = t.on_chain_token_id as string;
            const dbOwner = (t.owner_wallet_address || "").toLowerCase();
            const onChainOwner = await ownerOf(chainId);

            if (onChainOwner === null) {
                // Token does not exist on-chain (reverted ownerOf). Void it.
                if (!t.is_voided) {
                    await supabase
                        .from("nft_tokens")
                        .update({ is_voided: true })
                        .eq("id", t.id);
                    voided++;
                    report.push({
                        tokenDbId: t.id,
                        onChainTokenId: chainId,
                        before: dbOwner,
                        after: null,
                        action: "voided",
                    });
                } else {
                    unchanged++;
                }
                continue;
            }

            if (onChainOwner !== dbOwner) {
                const { error: upErr } = await supabase
                    .from("nft_tokens")
                    .update({
                        owner_wallet_address: onChainOwner,
                        last_transferred_at: new Date().toISOString(),
                    })
                    .eq("id", t.id);
                if (upErr) {
                    errors++;
                    console.error("[reconcile] update failed:", upErr.message);
                } else {
                    updated++;
                    // Record the new ownership window in nft_ownership_log.
                    // Close out any previous open window for this token first.
                    const now = new Date().toISOString();
                    await supabase
                        .from("nft_ownership_log")
                        .update({ released_at: now })
                        .eq("nft_token_id", t.id)
                        .is("released_at", null);
                    await supabase.from("nft_ownership_log").insert({
                        nft_token_id: t.id,
                        owner_wallet_address: onChainOwner,
                        acquired_at: now,
                    });
                    report.push({
                        tokenDbId: t.id,
                        onChainTokenId: chainId,
                        before: dbOwner,
                        after: onChainOwner,
                        action: "updated",
                    });
                }
            } else {
                unchanged++;
            }
        }

        return jsonResponse({
            success: true,
            total: tokens?.length || 0,
            updated,
            voided,
            unchanged,
            errors,
            report: report.slice(0, 50), // cap for response size
        });
    } catch (e: any) {
        return jsonResponse({ error: e?.message || String(e) }, 500);
    }
});
