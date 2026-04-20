#!/usr/bin/env node
/**
 * repair-token-5-singa.mjs
 * ────────────────────────
 * One-shot repair for ERC-1155 tokenId 5 (SINGA tier, song "Bairan" by Space)
 * on the shared DropERC1155 at 0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad
 * (Polygon Amoy testnet, chain 80002).
 *
 * Root cause: the buggy `buildAndPinReleaseMetadata` path uploaded the JSON
 * with thirdweb's auto-assigned filename `0`, then the caller tried to patch
 * the URI shape, producing `ipfs://QmT6Cm…/05` — a two-digit filename that
 * does not exist in the CID. The contract resolves `uri(5)` to that broken
 * path, so Thirdweb's token page shows a blank card.
 *
 * This script:
 *   1. Fetches the song + artist + release rows directly from Supabase
 *   2. Pins the cover (public Supabase URL → IPFS, correct .jpg extension)
 *   3. Builds an OpenSea-schema metadata JSON
 *   4. Uploads the JSON as `File([…], "5", …)` so it lands at
 *      `ipfs://<newCID>/5`
 *   5. Calls nft-admin `updateBatchBaseURI` with index=5 (token 5's batch
 *      position; sequential single-token batches so index === tokenId) and
 *      baseURI=`ipfs://<newCID>/`
 *   6. Verifies on-chain `uri(5)` now matches and the IPFS gateway serves
 *      the JSON with a valid `image` field
 *
 * NOTHING in the DB changes — the row was already correct; only the chain's
 * view of the metadata gets repaired.
 */

import { createThirdwebClient } from 'thirdweb';
import { upload } from 'thirdweb/storage';

// ─────────────────────────────────────────────────────────────
// Required env vars (never committed):
//   SUPABASE_SECRET        service-role key for REST reads
//   SUPABASE_ANON_KEY      publishable key for nft-admin auth header
//   EXPO_PUBLIC_ADMIN_SECRET  MU6_ADMIN_SECRET matching edge fn env
// Optional:
//   THIRDWEB_CLIENT_ID, SUPABASE_URL, CONTRACT, TOKEN_ID
// ─────────────────────────────────────────────────────────────
const THIRDWEB_CLIENT_ID = process.env.THIRDWEB_CLIENT_ID
    || process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID
    || '64c9d6a04c2edcf1c8b117db980edd41';
const SUPABASE_URL = process.env.SUPABASE_URL
    || process.env.EXPO_PUBLIC_SUPABASE_URL
    || 'https://ukavmvxelsfdfktiiyvg.supabase.co';
const SUPABASE_SECRET = process.env.SUPABASE_SECRET || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    || '';
const ADMIN_SECRET = process.env.EXPO_PUBLIC_ADMIN_SECRET
    || process.env.MU6_ADMIN_SECRET
    || '';
const CONTRACT = process.env.CONTRACT || '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad';
const TOKEN_ID = process.env.TOKEN_ID || '5';

for (const [name, val] of [
    ['SUPABASE_SECRET', SUPABASE_SECRET],
    ['SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
    ['EXPO_PUBLIC_ADMIN_SECRET', ADMIN_SECRET],
]) {
    if (!val) {
        console.error(`Missing env var: ${name}`);
        process.exit(1);
    }
}
const RPC = `https://80002.rpc.thirdweb.com/${THIRDWEB_CLIENT_ID}`;
const EXTERNAL_BASE = 'https://mu6-final.vercel.app';

// ── Helpers ──
async function supabaseSelect(path) {
    const url = `${SUPABASE_URL}/rest/v1/${path}`;
    const resp = await fetch(url, {
        headers: {
            apikey: SUPABASE_SECRET,
            Authorization: `Bearer ${SUPABASE_SECRET}`,
        },
    });
    if (!resp.ok) throw new Error(`Supabase ${resp.status} ${path}: ${await resp.text()}`);
    return resp.json();
}

async function ethCall(data) {
    const resp = await fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [{ to: CONTRACT, data }, 'latest'],
        }),
    });
    const json = await resp.json();
    return json.result || '0x';
}

function decodeAbiString(hex) {
    const h = hex.replace(/^0x/, '');
    if (h.length < 128) return '';
    const len = parseInt(h.slice(64, 128), 16);
    if (len === 0) return '';
    const bytes = h.slice(128, 128 + len * 2);
    let s = '';
    for (let i = 0; i < bytes.length; i += 2) {
        s += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
    }
    return s;
}

function padHex32(n) {
    return BigInt(n).toString(16).padStart(64, '0');
}

async function adminCall(action, extra) {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/nft-admin`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-mu6-admin-secret': ADMIN_SECRET,
            apikey: SUPABASE_ANON_KEY,
            // verifyAuth() in nft-admin matches this exact-string against its
            // SUPABASE_ANON_KEY env. Using the SERVICE_ROLE / secret key here
            // fails because it's not JWT-shaped AND doesn't equal the anon key.
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action, ...extra }),
    });
    const txt = await resp.text();
    let parsed = null;
    try {
        parsed = JSON.parse(txt);
    } catch { /* */ }
    return { ok: resp.ok, status: resp.status, json: parsed, raw: txt };
}

async function main() {
    console.log('── MU6 SINGA (token 5) metadata repair ──');
    console.log('Contract:', CONTRACT);
    console.log('Token ID:', TOKEN_ID);
    console.log();

    // ── 1. Read on-chain URI BEFORE repair ──
    const beforeHex = await ethCall('0x0e89341c' + padHex32(TOKEN_ID));
    const beforeUri = decodeAbiString(beforeHex);
    console.log('[1] on-chain uri(5) BEFORE:', beforeUri);

    // ── 2. Pull release row + song + artist from Supabase ──
    console.log('[2] Loading release + song + artist…');
    const releases = await supabaseSelect(
        `nft_releases?contract_address=eq.${CONTRACT}&token_id=eq.${TOKEN_ID}&select=*`,
    );
    if (!releases.length) throw new Error(`No nft_releases row for token ${TOKEN_ID}`);
    const release = releases[0];

    const songs = await supabaseSelect(`songs?id=eq.${release.song_id}&select=*`);
    if (!songs.length) throw new Error(`Song ${release.song_id} not found`);
    const song = songs[0];

    const profiles = await supabaseSelect(
        `profiles?id=eq.${song.creator_id}&select=id,display_name,wallet_address`,
    );
    if (!profiles.length) throw new Error(`Artist ${song.creator_id} not found`);
    const artist = profiles[0];

    console.log('    release tier:', release.tier_name, 'rarity:', release.rarity);
    console.log('    song:', song.title, '(genre:', song.genre + ')');
    console.log('    artist:', artist.display_name);
    console.log();

    // ── 3. Pin cover image to IPFS ──
    // The stored cover_image_path on the release row is corrupted
    // ("nft-covers/nft-cover-1776677564841.app/976cfcb5-…"), so use the
    // song's cover_path which is clean.
    const coverPublicUrl = `${SUPABASE_URL}/storage/v1/object/public/covers/${song.cover_path}`;
    console.log('[3] Fetching cover:', coverPublicUrl);
    const coverResp = await fetch(coverPublicUrl);
    if (!coverResp.ok) throw new Error(`Cover fetch ${coverResp.status}`);
    const coverBlob = await coverResp.blob();
    // Preserve real extension from cover_path (clean song-upload path is like
    // "<uuid>/<ts>-cover.jpg")
    const coverExtMatch = song.cover_path.match(/\.([a-z0-9]{2,5})$/i);
    const coverExt = coverExtMatch ? coverExtMatch[1].toLowerCase() : 'jpg';
    const client = createThirdwebClient({ clientId: THIRDWEB_CLIENT_ID });
    const coverFile = new File([coverBlob], `cover.${coverExt}`, {
        type: coverBlob.type || `image/${coverExt}`,
    });
    const coverUpload = await upload({ client, files: [coverFile] });
    const coverIpfsUri = Array.isArray(coverUpload) ? coverUpload[0] : coverUpload;
    console.log('    pinned cover:', coverIpfsUri);
    console.log();

    // ── 4. Build metadata JSON (mirrors src/services/nftMetadata.ts) ──
    const pricePol = Number(release.price_eth);
    const metadata = {
        name: `${song.title} — ${release.tier_name}`,
        description:
            release.description
            || `Official MU6 music NFT: "${song.title}" by ${artist.display_name}. Tier: ${release.tier_name}.`,
        image: coverIpfsUri,
        external_url: `${EXTERNAL_BASE}/song/${song.id}`,
        attributes: [
            { trait_type: 'Artist', value: artist.display_name },
            { trait_type: 'Tier', value: release.tier_name },
            {
                trait_type: 'Rarity',
                value:
                    release.rarity.charAt(0).toUpperCase()
                    + release.rarity.slice(1),
            },
            ...(song.genre ? [{ trait_type: 'Genre', value: song.genre }] : []),
            { trait_type: 'Edition size', display_type: 'number', value: release.max_supply },
            { trait_type: 'Price (POL)', display_type: 'number', value: pricePol },
        ],
        properties: {
            songId: song.id,
            releaseDate: song.release_date || null,
            benefits: Array.isArray(release.benefits) ? release.benefits : [],
            mu6: {
                platform: 'MU6',
                tierName: release.tier_name,
                rarity: release.rarity,
            },
        },
    };

    // ── 5. Upload JSON as File named exactly "5" ──
    console.log('[5] Pinning metadata JSON with filename "5"…');
    const jsonText = JSON.stringify(metadata);
    const jsonFile = new File([jsonText], String(TOKEN_ID), { type: 'application/json' });
    const metaUpload = await upload({ client, files: [jsonFile] });
    const metadataUri = Array.isArray(metaUpload) ? metaUpload[0] : metaUpload;
    console.log('    pinned metadata:', metadataUri);
    const baseURI = metadataUri.replace(/\/[^/]+$/, '/');
    const expectedFullUri = `${baseURI}${TOKEN_ID}`;
    if (expectedFullUri !== metadataUri) {
        throw new Error(
            `Unexpected metadataUri shape: "${metadataUri}" for token ${TOKEN_ID}`,
        );
    }
    console.log('    baseURI for contract:', baseURI);
    console.log();

    // ── 6. Call updateBatchBaseURI via nft-admin ──
    // The shared contract has sequential single-token batches (tokens 0..6 →
    // batches at indices 0..6), so index === tokenId for this contract.
    console.log('[6] Calling nft-admin updateBatchBaseURI…');
    const updateResp = await adminCall('updateBatchBaseURI', {
        index: Number(TOKEN_ID),
        baseURI,
        contractAddress: CONTRACT,
    });
    if (!updateResp.ok || !updateResp.json?.success) {
        console.error('    FAILED:', updateResp.status, updateResp.raw);
        process.exit(2);
    }
    console.log('    tx confirmed:', updateResp.json.transactionHash);
    console.log();

    // ── 7. Verify on-chain URI NOW ──
    console.log('[7] Reading on-chain uri(5) AFTER…');
    await new Promise((r) => setTimeout(r, 3000));
    const afterHex = await ethCall('0x0e89341c' + padHex32(TOKEN_ID));
    const afterUri = decodeAbiString(afterHex);
    console.log('    on-chain uri(5) AFTER:', afterUri);
    if (afterUri !== expectedFullUri) {
        console.error(`    ❌ mismatch — expected ${expectedFullUri}`);
        process.exit(3);
    }
    console.log('    ✅ matches expected');
    console.log();

    // ── 8. Gateway sanity check ──
    const gatewayUrl = afterUri.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/');
    console.log('[8] Fetching via gateway:', gatewayUrl);
    try {
        const gw = await fetch(gatewayUrl, { signal: AbortSignal.timeout(20000) });
        if (gw.ok) {
            const fetched = await gw.json();
            console.log('    gateway name:', fetched.name);
            console.log('    gateway image:', fetched.image);
            console.log('    attributes count:', fetched.attributes?.length);
        } else {
            console.warn('    gateway HTTP', gw.status, '(non-blocking; may need a few mins to propagate)');
        }
    } catch (err) {
        console.warn('    gateway timeout (non-blocking):', err.message);
    }
    console.log();

    console.log('── DONE ──');
    console.log('Token 5 (SINGA) metadata repaired.');
    console.log('Thirdweb token page may take a few minutes to refresh its cache.');
}

main().catch((err) => {
    console.error('[repair] FATAL:', err);
    process.exit(99);
});
