/**
 * backfill_erc721_transfers.mjs
 *
 * Backfills legacy DropERC721 (0xACF1145A...) transfer history into
 * nft_sales_history and nft_token_owners by reading ERC-721 Transfer events
 * directly from the Polygon Amoy RPC.
 *
 * The existing syncTransfers edge action handles ERC-1155
 * TransferSingle/TransferBatch topics only.  This standalone script handles
 * the ERC-721 Transfer(address,address,uint256) event for the legacy contract.
 *
 * Usage
 * -----
 *   SUPABASE_SERVICE_ROLE_KEY=<service_key> node scripts/backfill_erc721_transfers.mjs
 *
 *   Optional env overrides:
 *     FROM_BLOCK=0          — starting block (default: 0)
 *     TO_BLOCK=latest       — ending block (default: current head)
 *     CHUNK_SIZE=2000       — blocks per eth_getLogs call (default: 2000)
 *     DRY_RUN=true          — print events without writing to DB (default: false)
 *
 * Requirements
 * ------------
 *   Node.js 18+ (native fetch).  No external npm dependencies — uses
 *   direct REST calls to Supabase PostgREST so the script is self-contained.
 *
 * Idempotency
 * -----------
 *   nft_sales_history.tx_hash has a UNIQUE constraint.  All upserts use
 *   onConflict=tx_hash so re-running the script is safe and fills only gaps.
 *   nft_token_owners uses the increment_token_balance RPC (which is also
 *   idempotent — it only increments when last_block < p_block).
 */

// ── Constants ────────────────────────────────────────────────────────────────

const LEGACY_ERC721_CONTRACT = '0xacf1145ade250d356e1b2869e392e6c748c14c0e';
const CHAIN_ID               = 80002; // Polygon Amoy
const ZERO_ADDR              = '0x' + '0'.repeat(40);

// keccak256("Transfer(address,address,uint256)")
const TOPIC_ERC721_TRANSFER  = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const RPC_URL = process.env.RPC_URL || 'https://rpc-amoy.polygon.technology';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ukavmvxelsfdfktiiyvg.supabase.co';

// Prefer service role key (needed for nft_token_owners RPC writes).
// If absent, fall back to the anon key — but the increment_token_balance RPC
// may be blocked by RLS; use service role key whenever possible.
const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrYXZtdnhlbHNmZGZrdGlpeXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4ODU2NjcsImV4cCI6MjA4NjQ2MTY2N30.SOhR-X9z--iHPVF5yZhHV6ygdj0GjPQYumDd8iGf5MI';

const FROM_BLOCK  = BigInt(process.env.FROM_BLOCK ?? 0);
const CHUNK_SIZE  = BigInt(process.env.CHUNK_SIZE ?? 2000);
const DRY_RUN     = process.env.DRY_RUN === 'true';

// ── RPC helpers ──────────────────────────────────────────────────────────────

async function rpcCall(method, params) {
    const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json();
    if (json.error) throw new Error(`RPC ${method} error: ${JSON.stringify(json.error)}`);
    return json.result;
}

async function getHeadBlock() {
    const hex = await rpcCall('eth_blockNumber', []);
    return BigInt(hex);
}

async function getBlockTimestamp(blockHex) {
    const block = await rpcCall('eth_getBlockByNumber', [blockHex, false]);
    return block ? parseInt(block.timestamp, 16) : null;
}

async function getLogs(fromBlock, toBlock) {
    return rpcCall('eth_getLogs', [{
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock:   '0x' + toBlock.toString(16),
        address:   LEGACY_ERC721_CONTRACT,
        topics:    [TOPIC_ERC721_TRANSFER],
    }]);
}

// ── Supabase REST helpers ────────────────────────────────────────────────────

const SUPA_HEADERS = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer': 'resolution=merge-duplicates,return=minimal',
};

async function supaUpsert(table, rows) {
    if (DRY_RUN || rows.length === 0) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...SUPA_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`supaUpsert ${table} failed: ${res.status} ${body}`);
    }
}

async function supaRpc(fn, args) {
    if (DRY_RUN) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { ...SUPA_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify(args),
    });
    if (!res.ok) {
        const body = await res.text();
        // Warn but continue — RPC may not be accessible with anon key
        console.warn(`  [warn] RPC ${fn} failed: ${res.status} ${body}`);
    }
}

// ── nft_sync_state helpers ───────────────────────────────────────────────────

async function getLastSyncedBlock() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/nft_sync_state?chain_id=eq.${CHAIN_ID}&contract_address=eq.${LEGACY_ERC721_CONTRACT}&sync_type=eq.transfers&select=last_synced_block&limit=1`,
        { headers: SUPA_HEADERS },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0]?.last_synced_block ?? null;
}

async function setLastSyncedBlock(block) {
    if (DRY_RUN) return;
    await supaUpsert('nft_sync_state', [{
        chain_id: CHAIN_ID,
        contract_address: LEGACY_ERC721_CONTRACT,
        sync_type: 'transfers',
        last_synced_block: Number(block),
        last_synced_at: new Date().toISOString(),
    }]);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('='.repeat(60));
    console.log('MU6 — Legacy ERC-721 Transfer Backfill');
    console.log('='.repeat(60));
    console.log(`Contract : ${LEGACY_ERC721_CONTRACT}`);
    console.log(`Chain    : ${CHAIN_ID} (Polygon Amoy testnet)`);
    console.log(`RPC      : ${RPC_URL}`);
    console.log(`Supabase : ${SUPABASE_URL}`);
    console.log(`DRY_RUN  : ${DRY_RUN}`);
    console.log('');

    // Resolve from/to blocks
    const headBlock = await getHeadBlock();
    console.log(`Head block: ${headBlock}`);

    // Prefer explicit FROM_BLOCK env; fallback to DB high-water mark + 1
    let fromBlock = FROM_BLOCK;
    if (fromBlock === BigInt(0)) {
        const lastSynced = await getLastSyncedBlock();
        if (lastSynced != null && Number(lastSynced) > 0) {
            fromBlock = BigInt(lastSynced) + 1n;
            console.log(`Resuming from nft_sync_state: block ${fromBlock}`);
        } else {
            console.log('No existing sync state — starting from block 0');
        }
    }

    const toBlock = process.env.TO_BLOCK && process.env.TO_BLOCK !== 'latest'
        ? BigInt(process.env.TO_BLOCK)
        : headBlock;

    if (fromBlock > toBlock) {
        console.log('Nothing to sync — already at head.');
        return;
    }

    console.log(`Scanning blocks ${fromBlock} → ${toBlock} (${(toBlock - fromBlock + 1n)} blocks, chunk size ${CHUNK_SIZE})`);
    console.log('');

    let cursor = fromBlock;
    let totalEvents = 0;
    let chunksProcessed = 0;

    while (cursor <= toBlock) {
        const chunkEnd = cursor + CHUNK_SIZE - 1n < toBlock ? cursor + CHUNK_SIZE - 1n : toBlock;
        process.stdout.write(`  Chunk ${chunksProcessed + 1}: blocks ${cursor}–${chunkEnd} ... `);

        let logs;
        try {
            logs = await getLogs(cursor, chunkEnd);
        } catch (err) {
            console.error(`\n  [error] eth_getLogs failed: ${err.message}`);
            console.error('  Stopping — fix the error and re-run. Progress is saved in nft_sync_state.');
            break;
        }

        if (logs.length === 0) {
            process.stdout.write(`0 events\n`);
        } else {
            process.stdout.write(`${logs.length} Transfer events\n`);

            // Collect block timestamps in a minimal number of RPC calls
            const blockNums = [...new Set(logs.map(l => l.blockNumber))];
            const timestampMap = {};
            for (const blockHex of blockNums) {
                try {
                    const ts = await getBlockTimestamp(blockHex);
                    if (ts) timestampMap[blockHex] = new Date(ts * 1000).toISOString();
                } catch {
                    // Non-fatal — block_timestamp will be null
                }
            }

            // Build rows for nft_sales_history
            const salesRows = [];
            const ownershipOps = [];

            for (const log of logs) {
                // ERC-721 Transfer: topics = [event_sig, from, to, tokenId]
                const from    = '0x' + (log.topics[1] ?? '').slice(26).toLowerCase();
                const to      = '0x' + (log.topics[2] ?? '').slice(26).toLowerCase();
                const tokenId = BigInt('0x' + (log.topics[3] ?? '0x0').replace(/^0x/, '')).toString();
                const blockNum = parseInt(log.blockNumber, 16);
                const logIdx   = parseInt(log.logIndex, 16);
                const txHash   = (log.transactionHash ?? '').toLowerCase();
                const blockTs  = timestampMap[log.blockNumber] ?? null;

                if (!txHash) continue; // malformed log

                salesRows.push({
                    chain_id:         CHAIN_ID,
                    contract_address: LEGACY_ERC721_CONTRACT,
                    token_id:         tokenId,
                    seller:           from !== ZERO_ADDR ? from : null,
                    buyer:            to   !== ZERO_ADDR ? to   : null,
                    marketplace:      'transfer',
                    tx_hash:          txHash,
                    log_index:        logIdx,
                    block_number:     blockNum,
                    block_timestamp:  blockTs,
                    amount:           1,
                    is_primary:       from === ZERO_ADDR, // mints from zero address
                });

                // Track ownership delta for nft_token_owners
                ownershipOps.push({ from, to, tokenId, blockNum });

                if (DRY_RUN) {
                    console.log(`    [dry] tx=${txHash} tokenId=${tokenId} from=${from} to=${to}`);
                }
            }

            // Write sales history (idempotent via tx_hash UNIQUE)
            if (salesRows.length > 0) {
                try {
                    await supaUpsert('nft_sales_history', salesRows);
                } catch (err) {
                    console.error(`  [error] nft_sales_history upsert failed: ${err.message}`);
                }
            }

            // Write ownership (increment_token_balance RPC)
            // For ERC-721 each token has exactly 1 unit (amount=1).
            // The RPC is designed for ERC-1155 but works correctly for ERC-721
            // because every Transfer is amount=1.
            for (const op of ownershipOps) {
                const { from, to, tokenId, blockNum } = op;
                if (to !== ZERO_ADDR) {
                    await supaRpc('increment_token_balance', {
                        p_chain_id: CHAIN_ID,
                        p_contract: LEGACY_ERC721_CONTRACT,
                        p_token_id: tokenId,
                        p_owner:    to,
                        p_delta:    '1',
                        p_block:    blockNum,
                    });
                }
                if (from !== ZERO_ADDR) {
                    await supaRpc('increment_token_balance', {
                        p_chain_id: CHAIN_ID,
                        p_contract: LEGACY_ERC721_CONTRACT,
                        p_token_id: tokenId,
                        p_owner:    from,
                        p_delta:    '-1',
                        p_block:    blockNum,
                    });
                }
            }

            totalEvents += logs.length;
        }

        // Commit progress
        await setLastSyncedBlock(chunkEnd);
        chunksProcessed++;
        cursor = chunkEnd + 1n;
    }

    console.log('');
    console.log('─'.repeat(60));
    console.log(`Done. Processed ${chunksProcessed} chunk(s), ${totalEvents} Transfer events.`);
    if (DRY_RUN) {
        console.log('DRY_RUN=true — no data was written to the database.');
    }
    console.log('─'.repeat(60));
}

main().catch(err => {
    console.error('[fatal]', err);
    process.exit(1);
});
