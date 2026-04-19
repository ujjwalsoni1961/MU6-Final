#!/usr/bin/env node
/**
 * set-contract-uri.mjs
 * ────────────────────
 * Pins an MU6 collection-metadata JSON to IPFS, then calls
 * nft-admin setContractURI on the shared DropERC1155 so that
 * OpenSea / Thirdweb storefronts render the collection banner,
 * name, description and 5% royalty.
 *
 * Usage:
 *   node scripts/set-contract-uri.mjs
 *
 * Env vars required:
 *   EXPO_PUBLIC_THIRDWEB_CLIENT_ID    (or hard-code fallback in this script)
 *   THIRDWEB_SECRET_KEY               (preferred for server-side uploads)
 *   SUPABASE_URL
 *   MU6_ADMIN_SECRET
 *   EXPO_PUBLIC_SONG_NFT_ERC1155_ADDRESS   (optional override)
 */

import { createThirdwebClient } from 'thirdweb';
import { upload } from 'thirdweb/storage';

const THIRDWEB_CLIENT_ID =
    process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID ||
    '64c9d6a04c2edcf1c8b117db980edd41';
const THIRDWEB_SECRET = process.env.THIRDWEB_SECRET_KEY || '';
const SUPABASE_URL =
    process.env.SUPABASE_URL || 'https://ukavmvxelsfdfktiiyvg.supabase.co';
const MU6_ADMIN_SECRET = process.env.MU6_ADMIN_SECRET || '';
const SUPABASE_ANON_KEY =
    process.env.SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    '';
const CONTRACT =
    process.env.EXPO_PUBLIC_SONG_NFT_ERC1155_ADDRESS ||
    '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad';

if (!MU6_ADMIN_SECRET) {
    console.error('Missing MU6_ADMIN_SECRET');
    process.exit(1);
}

// ── Collection metadata JSON (OpenSea schema) ──
// https://docs.opensea.io/docs/contract-level-metadata
const collectionMetadata = {
    name: 'MU6 Music NFTs',
    description:
        'Official MU6 music NFTs — direct-to-fan releases by independent artists. ' +
        'Each token in this contract represents ownership of a specific song edition ' +
        'with on-chain royalties flowing back to the artist on every secondary sale.',
    image:
        'ipfs://QmT6ygGPdKdZjrU4dPWr4ohTLR2BVjbT3vmDdn7AcRR4SC/0.jpeg',
    external_link: 'https://mu6-final.vercel.app',
    seller_fee_basis_points: 500, // 5%
    fee_recipient: '0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39', // server wallet
};

async function main() {
    // Build client (secretKey preferred server-side; fall back to clientId).
    const client = createThirdwebClient(
        THIRDWEB_SECRET
            ? { secretKey: THIRDWEB_SECRET }
            : { clientId: THIRDWEB_CLIENT_ID },
    );

    console.log('[set-contract-uri] pinning collection metadata…');
    // IMPORTANT: pass the metadata object directly as the file. Wrapping it in
    // { name, data } produces a JSON file whose TOP-LEVEL keys are { name, data, ... }
    // which OpenSea / Thirdweb do NOT recognize as contract-level metadata.
    const uri = await upload({
        client,
        files: [collectionMetadata],
    });
    const finalUri = Array.isArray(uri) ? uri[0] : uri;
    console.log('[set-contract-uri] pinned:', finalUri);

    // Verify the URI resolves via public gateway before calling on-chain.
    const gateway = finalUri.replace(
        /^ipfs:\/\//,
        'https://ipfs.io/ipfs/',
    );
    try {
        const verifyResp = await fetch(gateway, {
            signal: AbortSignal.timeout(15000),
        });
        if (verifyResp.ok) {
            const verified = await verifyResp.json();
            console.log(
                '[set-contract-uri] gateway verified:',
                verified.name,
            );
        } else {
            console.warn(
                '[set-contract-uri] gateway verification skipped (HTTP',
                verifyResp.status,
                ')',
            );
        }
    } catch (err) {
        console.warn(
            '[set-contract-uri] gateway verification timed out (non-blocking):',
            err.message,
        );
    }

    // Call nft-admin setContractURI.
    console.log('[set-contract-uri] calling nft-admin setContractURI…');
    const adminResp = await fetch(
        `${SUPABASE_URL}/functions/v1/nft-admin`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-mu6-admin-secret': MU6_ADMIN_SECRET,
                ...(SUPABASE_ANON_KEY
                    ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
                    : {}),
            },
            body: JSON.stringify({
                action: 'setContractURI',
                uri: finalUri,
                contractAddress: CONTRACT,
            }),
        },
    );
    const adminText = await adminResp.text();
    let adminJson = null;
    try {
        adminJson = JSON.parse(adminText);
    } catch {
        /* non-json */
    }
    if (!adminResp.ok) {
        console.error('[set-contract-uri] admin error:', adminResp.status, adminText);
        process.exit(2);
    }

    if (adminJson?.unchanged) {
        console.log(
            '[set-contract-uri] on-chain contractURI already matches — no tx sent',
        );
        console.log('   uri:', adminJson.current);
        return;
    }

    console.log('[set-contract-uri] SUCCESS');
    console.log('   tx hash:', adminJson?.txHash);
    console.log('   uri:    ', adminJson?.uri);
}

main().catch((err) => {
    console.error('[set-contract-uri] fatal:', err);
    process.exit(3);
});
