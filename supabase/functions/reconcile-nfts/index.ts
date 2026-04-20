/**
 * reconcile-nfts (DropERC1155)
 *
 * Admin-callable edge function that reconciles the `nft_tokens` ledger with
 * on-chain DropERC1155 state.
 *
 * Each `nft_tokens` row represents one copy of a release-scoped tokenId owned
 * by one wallet. We verify each row by calling
 *   balanceOf(owner_wallet_address, on_chain_token_id)
 * on the release's `contract_address` and comparing to the wallet's share of
 * the ledger (count of non-voided rows with the same owner × tokenId).
 *
 * If the ledger overcounts relative to on-chain, we void the excess rows
 * (oldest first) so the UI stops showing tokens the wallet has already
 * transferred away. We don't attempt to "discover" new wallets here — new
 * owners arrive via claim (admin-action) or marketplace buy (marketplace.ts),
 * both of which insert rows directly.
 *
 * Request body: { profileId: 'superadmin' }
 * Response: { success, total, voided, unchanged, errors, report }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RPC_URL = Deno.env.get("AMOY_RPC_URL") ||
    "https://80002.rpc.thirdweb.com/64c9d6a04c2edcf1c8b117db980edd41";

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

function padHex(value: string | bigint): string {
    const n = typeof value === "bigint" ? value : BigInt(value);
    return n.toString(16).padStart(64, "0");
}

function addrPad(addr: string): string {
    return addr.replace(/^0x/, "").toLowerCase().padStart(64, "0");
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

/**
 * ERC-1155 balanceOf(address account, uint256 id) — selector 0x00fdd58e.
 * Returns 0 on any RPC error (fail-closed for reconcile).
 */
async function erc1155BalanceOf(
    contract: string,
    wallet: string,
    tokenId: string,
): Promise<bigint> {
    try {
        const data = "0x00fdd58e" + addrPad(wallet) + padHex(tokenId);
        const res = await rpc("eth_call", [{ to: contract, data }, "latest"]);
        return BigInt(res || "0x0");
    } catch (e) {
        console.warn("[reconcile] balanceOf failed:", String(e));
        return 0n;
    }
}

interface TokenRow {
    id: string;
    owner_wallet_address: string | null;
    on_chain_token_id: string | null;
    is_voided: boolean | null;
    minted_at: string | null;
    release: { contract_address: string | null } | null;
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

        // Pull all non-voided rows that have both an on-chain id and an
        // owner wallet. Join in nft_releases.contract_address (one drop per
        // release in the ERC-1155 world, so the contract to query lives on
        // the release, not on a global constant).
        const { data: rawTokens, error } = await supabase
            .from("nft_tokens")
            .select(
                "id, owner_wallet_address, on_chain_token_id, is_voided, minted_at, release:nft_releases(contract_address)",
            )
            .not("on_chain_token_id", "is", null)
            .or("is_voided.is.null,is_voided.eq.false");

        if (error) {
            return jsonResponse({ error: error.message }, 500);
        }

        const tokens = (rawTokens || []) as unknown as TokenRow[];

        // Group ledger rows by (contract, tokenId, owner) so we can compare
        // DB count vs on-chain balance in one pass.
        type GroupKey = string; // `${contract}:${tokenId}:${owner}`
        const groups = new Map<GroupKey, TokenRow[]>();

        for (const t of tokens) {
            const contract = t.release?.contract_address?.toLowerCase();
            const owner = t.owner_wallet_address?.toLowerCase();
            const tokenId = t.on_chain_token_id;
            if (!contract || !owner || tokenId === null || tokenId === undefined) continue;
            const key = `${contract}:${tokenId}:${owner}`;
            const arr = groups.get(key) || [];
            arr.push(t);
            groups.set(key, arr);
        }

        let voided = 0;
        let unchanged = 0;
        let errors = 0;
        const report: Array<{
            contract: string;
            tokenId: string;
            owner: string;
            dbCount: number;
            onChainBalance: string;
            voidedIds: string[];
        }> = [];

        for (const [key, rows] of groups.entries()) {
            const [contract, tokenId, owner] = key.split(":");
            const onChainBal = await erc1155BalanceOf(contract, owner, tokenId);
            const dbCount = BigInt(rows.length);

            if (onChainBal >= dbCount) {
                unchanged += rows.length;
                continue;
            }

            // Ledger overcounts — void the oldest rows until counts match.
            const excess = Number(dbCount - onChainBal);
            const sorted = [...rows].sort((a, b) => {
                const ta = a.minted_at ? Date.parse(a.minted_at) : 0;
                const tb = b.minted_at ? Date.parse(b.minted_at) : 0;
                return ta - tb; // oldest first
            });
            const toVoid = sorted.slice(0, excess);

            const ids = toVoid.map((r) => r.id);
            const { error: upErr } = await supabase
                .from("nft_tokens")
                .update({ is_voided: true })
                .in("id", ids);
            if (upErr) {
                errors += ids.length;
                console.error("[reconcile] void update failed:", upErr.message);
            } else {
                voided += ids.length;
                // Close out any open ownership_log windows for the voided rows.
                const now = new Date().toISOString();
                await supabase
                    .from("nft_ownership_log")
                    .update({ released_at: now })
                    .in("nft_token_id", ids)
                    .is("released_at", null);
            }

            unchanged += rows.length - toVoid.length;
            report.push({
                contract,
                tokenId,
                owner,
                dbCount: rows.length,
                onChainBalance: onChainBal.toString(),
                voidedIds: ids,
            });
        }

        return jsonResponse({
            success: true,
            total: tokens.length,
            voided,
            unchanged,
            errors,
            report: report.slice(0, 50),
        });
    } catch (e: any) {
        return jsonResponse({ error: e?.message || String(e) }, 500);
    }
});
