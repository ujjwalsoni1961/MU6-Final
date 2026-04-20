/**
 * NFT Metadata Builder + IPFS Uploader
 * ─────────────────────────────────────
 * Responsible for:
 *  1. Uploading NFT cover image to IPFS (thirdweb storage)
 *  2. Generating a 30s audio preview (web: Web Audio API + WAV; native: skip)
 *  3. Uploading audio preview to IPFS
 *  4. Building OpenSea-standard metadata JSON
 *  5. Pinning metadata JSON to IPFS → returning pinned ipfs://... URI
 *
 * Used by:
 *  - app/(artist)/nft-manager.tsx   (createErc1155Release)
 *  - scripts/set-contract-uri.mjs   (contract-level metadata)
 *
 * Design notes:
 *  - Cross-platform: works on web and native (native skips audio preview).
 *  - Full audio is NEVER pinned. Only a 30s preview (web) or no animation_url (native).
 *  - Full audio stays in private Supabase bucket (signed-URL DRM).
 *  - Cover is pinned so marketplaces can render the image long-term.
 */

import { Platform } from 'react-native';
import { upload } from 'thirdweb/storage';
import { thirdwebClient } from '../lib/thirdweb';
import { supabase } from '../lib/supabase';
import { getAudioUrl } from './database';
import { extFromBlobOrUri, mimeFromBlobOrExt } from '../utils/fileExt';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface NftBenefit {
    title: string;
    description: string;
}

export interface NftMetadataInput {
    /** Song title (e.g. "Bairan") */
    songTitle: string;
    /** Artist display name (e.g. "Cityboy Valle") */
    artistName: string;
    /** Artist-defined tier name ("Founders Edition", "Fan Copy"…) */
    tierName: string;
    /** Long-form tier description (optional; defaults to a sane line) */
    description?: string;
    /** Rarity tag (common/rare/legendary) */
    rarity: 'common' | 'rare' | 'legendary';
    /** Song genre (optional but recommended) */
    genre?: string;
    /** Total editions minted for this tier */
    maxSupply: number;
    /** Price in POL (native) */
    pricePol: number;
    /**
     * Cover image — either:
     *  - an IPFS URI already pinned (e.g. "ipfs://Qm…/0.jpeg"), OR
     *  - a local file URI (expo-image-picker result) we need to pin, OR
     *  - a Supabase storage path ("nft-covers/…") we resolve to a public URL then pin.
     */
    coverSource: {
        kind: 'ipfs' | 'local-uri' | 'supabase-path' | 'http-url';
        value: string;
    };
    /** Supabase audio path (private bucket). Used to fetch + generate preview. */
    audioPath?: string | null;
    /** Mu6 song id (used for external_url). */
    songId: string;
    /** Release date (ISO string, optional). */
    releaseDate?: string;
    /** Benefits attached to the tier (rendered as attributes). */
    benefits?: NftBenefit[];
    /** Base URL for external_url (e.g. https://mu6-final.vercel.app). */
    externalBaseUrl?: string;
}

export interface NftMetadataUploadResult {
    /**
     * Base URI that, when concatenated with a decimal token id, resolves to
     * a valid OpenSea-schema metadata JSON on IPFS. Always ends with '/'.
     * The baseURI is what you pass to DropERC1155.lazyMint(amount, baseURI).
     */
    baseURI: string;
    /** Human-debug: `ipfs://<cid>/<tokenId>` for the pinned tokenId. */
    metadataUri: string;
    /** The on-chain tokenId this upload is bound to. */
    tokenId: string;
    coverImageUri: string; // ipfs://<cid>/… pinned cover
    animationUri: string | null; // ipfs://… preview, or null if unavailable
    metadataJson: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Upload helpers
// ─────────────────────────────────────────────────────────────

/**
 * Pin a blob/file to IPFS via thirdweb storage.
 * Returns the `ipfs://<cid>/<filename>` URI.
 */
async function pinBlobToIpfs(
    blob: Blob,
    fileName: string,
    mimeType: string,
): Promise<string> {
    // thirdweb upload() accepts File objects in browser contexts.
    // On native the storage module still accepts Blob-like objects — we cast.
    const file =
        typeof File !== 'undefined'
            ? new File([blob], fileName, { type: mimeType })
            : (blob as unknown as File);

    const uri = await upload({
        client: thirdwebClient,
        files: [file],
    });
    if (!uri) throw new Error('thirdweb upload returned empty URI');
    return Array.isArray(uri) ? uri[0] : uri;
}

/** Resolve a cover source to a pinned IPFS URI. */
async function resolveCoverToIpfs(
    source: NftMetadataInput['coverSource'],
): Promise<string> {
    if (source.kind === 'ipfs') return source.value;

    let blob: Blob;
    let fileName: string;
    let mimeType = 'image/jpeg';

    if (source.kind === 'local-uri' || source.kind === 'http-url') {
        const resp = await fetch(source.value);
        if (!resp.ok) {
            throw new Error(
                `Failed to fetch cover from ${source.kind}: HTTP ${resp.status}`,
            );
        }
        blob = await resp.blob();
        const ext = extFromBlobOrUri(blob, source.value, 'jpg');
        fileName = `cover.${ext}`;
        mimeType = mimeFromBlobOrExt(blob, ext);
    } else if (source.kind === 'supabase-path') {
        // Public bucket — build download URL and fetch.
        const { data } = supabase.storage
            .from('covers')
            .getPublicUrl(source.value);
        if (!data?.publicUrl) {
            throw new Error(`Could not resolve Supabase cover path: ${source.value}`);
        }
        const resp = await fetch(data.publicUrl);
        if (!resp.ok) {
            throw new Error(
                `Failed to download Supabase cover: HTTP ${resp.status}`,
            );
        }
        blob = await resp.blob();
        // Prefer MIME from the downloaded blob; only fall back to the
        // stored Supabase path suffix when MIME is unknown.
        const ext = extFromBlobOrUri(blob, source.value, 'jpg');
        fileName = `cover.${ext}`;
        mimeType = mimeFromBlobOrExt(blob, ext);
    } else {
        throw new Error(`Unknown cover source kind: ${(source as any).kind}`);
    }

    return pinBlobToIpfs(blob, fileName, mimeType);
}

// ─────────────────────────────────────────────────────────────
// 30s Audio Preview (web-only)
// ─────────────────────────────────────────────────────────────

/**
 * Generate a 30-second audio preview from a source URL using Web Audio API,
 * encode as 16-bit PCM WAV, and return a Blob. Web-only.
 *
 * Returns null if the browser lacks AudioContext or on any decode error —
 * callers should treat null as "no preview available, skip animation_url".
 */
async function generate30sPreviewWav(sourceUrl: string): Promise<Blob | null> {
    if (Platform.OS !== 'web') return null;
    if (typeof window === 'undefined') return null;

    const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    try {
        const resp = await fetch(sourceUrl);
        if (!resp.ok) {
            console.warn(
                '[nftMetadata] preview fetch failed:',
                resp.status,
                resp.statusText,
            );
            return null;
        }
        const arrayBuffer = await resp.arrayBuffer();

        const ctx: AudioContext = new AudioCtx();
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        // Close the context — we only needed decode.
        try {
            await ctx.close();
        } catch {
            /* ignore */
        }

        const previewDurationSec = Math.min(30, decoded.duration);
        const sampleRate = decoded.sampleRate;
        const previewSamples = Math.floor(previewDurationSec * sampleRate);
        const numChannels = Math.min(decoded.numberOfChannels, 2); // mono or stereo

        // Extract channel data up to previewSamples
        const channelArrays: Float32Array[] = [];
        for (let c = 0; c < numChannels; c++) {
            const full = decoded.getChannelData(c);
            channelArrays.push(full.slice(0, previewSamples));
        }

        const wavBlob = encodeWav(channelArrays, sampleRate);
        return wavBlob;
    } catch (err) {
        console.warn('[nftMetadata] preview generation failed:', err);
        return null;
    }
}

/**
 * Encode Float32 channel data → 16-bit PCM WAV Blob.
 * Standard RIFF WAVE container, interleaved samples.
 */
function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
    const numChannels = channels.length;
    const numSamples = channels[0].length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    const writeStr = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) {
            view.setUint8(offset + i, s.charCodeAt(i));
        }
    };

    // RIFF chunk
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    // fmt sub-chunk
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);          // PCM fmt chunk size
    view.setUint16(20, 1, true);           // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);          // bits per sample
    // data sub-chunk
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave + convert Float32 [-1,1] → int16
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        for (let c = 0; c < numChannels; c++) {
            let sample = channels[c][i];
            if (sample > 1) sample = 1;
            else if (sample < -1) sample = -1;
            // Round to nearest int16
            const s = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
            view.setInt16(offset, s, true);
            offset += 2;
        }
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

// ─────────────────────────────────────────────────────────────
// OpenSea-standard metadata JSON
// ─────────────────────────────────────────────────────────────

export function buildMetadataJson(
    input: NftMetadataInput,
    pinnedCoverUri: string,
    pinnedAnimationUri: string | null,
): Record<string, unknown> {
    const attributes: Array<Record<string, unknown>> = [
        { trait_type: 'Artist', value: input.artistName },
        { trait_type: 'Tier', value: input.tierName },
        {
            trait_type: 'Rarity',
            value:
                input.rarity.charAt(0).toUpperCase() + input.rarity.slice(1),
        },
    ];
    if (input.genre) {
        attributes.push({ trait_type: 'Genre', value: input.genre });
    }
    attributes.push({
        trait_type: 'Edition size',
        display_type: 'number',
        value: input.maxSupply,
    });
    attributes.push({
        trait_type: 'Price (POL)',
        display_type: 'number',
        value: input.pricePol,
    });
    if (input.benefits && input.benefits.length > 0) {
        for (const b of input.benefits) {
            attributes.push({
                trait_type: `Perk — ${b.title}`,
                value: b.description || b.title,
            });
        }
    }

    const externalBase =
        input.externalBaseUrl || 'https://mu6-final.vercel.app';

    const metadata: Record<string, unknown> = {
        name: `${input.songTitle} — ${input.tierName}`,
        description:
            input.description?.trim() ||
            `Official MU6 music NFT: "${input.songTitle}" by ${input.artistName}. Tier: ${input.tierName}. Holders receive on-chain proof of ownership plus the benefits listed.`,
        image: pinnedCoverUri,
        external_url: `${externalBase}/song/${input.songId}`,
        attributes,
        properties: {
            songId: input.songId,
            releaseDate: input.releaseDate || null,
            benefits: input.benefits || [],
            mu6: {
                platform: 'MU6',
                tierName: input.tierName,
                rarity: input.rarity,
            },
        },
    };

    if (pinnedAnimationUri) {
        metadata.animation_url = pinnedAnimationUri;
    }

    return metadata;
}

// ─────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────

/**
 * Given a metadata input + the exact on-chain tokenId this release will land
 * at, pin cover + (optional) audio preview + metadata JSON, and return a
 * baseURI suitable for `DropERC1155.lazyMint(1, baseURI)`.
 *
 * Why tokenId matters here:
 *   DropERC1155's on-chain `uri(tokenId)` resolves to `baseURI + tokenId`
 *   using the GLOBAL tokenId as a decimal string (verified empirically on
 *   contract 0x1045…B5Ad: token 5 → `ipfs://…/05`, token 6 → `ipfs://…/06`
 *   when baseURI was `ipfs://…/0`). So the IPFS file inside the pinned
 *   folder MUST be named exactly `<tokenId>` (no extension) or the
 *   on-chain URI won't resolve.
 *
 *   thirdweb's default `upload(files: [json])` returns `ipfs://<cid>/0`
 *   — a folder with a single file named `0`. That only works for tokenId=0.
 *   To work for ANY tokenId we wrap the JSON as a File named literally
 *   `<tokenId>` before uploading. The resulting URI is `ipfs://<cid>/<tokenId>`,
 *   and we pass `ipfs://<cid>/` as baseURI to lazyMint.
 *
 * Caller contract:
 *   The caller MUST serialize: read `nextTokenIdToMint` → call this
 *   function with that id → call lazyMint(1, result.baseURI) → wait for
 *   confirmation → verify `nextTokenIdToMint` advanced by 1. If another tx
 *   slipped in between the read and our lazyMint, the tokenId assigned
 *   on-chain won't match the filename we pinned — detect and repair.
 */
export async function buildAndPinReleaseMetadata(
    input: NftMetadataInput,
    tokenId: string | number | bigint,
    onProgress?: (step: string) => void,
): Promise<NftMetadataUploadResult> {
    onProgress?.('Pinning cover image to IPFS…');
    const pinnedCoverUri = await resolveCoverToIpfs(input.coverSource);

    // Audio preview (web only; best-effort)
    let pinnedAnimationUri: string | null = null;
    if (input.audioPath && Platform.OS === 'web') {
        try {
            onProgress?.('Generating 30-second audio preview…');
            const signedUrl = await getAudioUrl(input.audioPath, 120);
            if (signedUrl) {
                const wavBlob = await generate30sPreviewWav(signedUrl);
                if (wavBlob) {
                    onProgress?.('Pinning audio preview to IPFS…');
                    pinnedAnimationUri = await pinBlobToIpfs(
                        wavBlob,
                        'preview.wav',
                        'audio/wav',
                    );
                }
            }
        } catch (err) {
            console.warn(
                '[nftMetadata] audio preview pin failed (continuing without animation_url):',
                err,
            );
        }
    }

    onProgress?.('Pinning metadata JSON to IPFS…');
    const metadataJson = buildMetadataJson(
        input,
        pinnedCoverUri,
        pinnedAnimationUri,
    );

    const tokenIdStr = typeof tokenId === 'bigint'
        ? tokenId.toString()
        : String(tokenId);
    if (!/^\d+$/.test(tokenIdStr)) {
        throw new Error(`pinReleaseMetadata: invalid tokenId "${tokenIdStr}"`);
    }

    // Wrap the JSON as a File whose NAME is the decimal tokenId (no extension).
    // thirdweb's upload() preserves file names in the resulting directory CID.
    // The resulting URI is `ipfs://<cid>/<tokenIdStr>` which is exactly what
    // DropERC1155.uri(tokenId) will return after lazyMint with baseURI=`ipfs://<cid>/`.
    const jsonText = JSON.stringify(metadataJson);
    // Use a Blob-backed File where `File` exists (web + modern RN); otherwise
    // thirdweb's storage accepts a Blob with an implicit filename, but we must
    // set it explicitly — fall back to constructing a File-shaped object.
    let file: File;
    if (typeof File !== 'undefined') {
        file = new File([jsonText], tokenIdStr, { type: 'application/json' });
    } else {
        const blob = new Blob([jsonText], { type: 'application/json' });
        // Shim a minimal File interface when File global is missing.
        file = Object.assign(blob as any, { name: tokenIdStr }) as File;
    }

    const uploadedUri = await upload({
        client: thirdwebClient,
        files: [file],
    });
    const metadataUri = Array.isArray(uploadedUri)
        ? uploadedUri[0]
        : uploadedUri;
    if (!metadataUri) {
        throw new Error('thirdweb upload returned empty metadata URI');
    }

    // metadataUri should be `ipfs://<cid>/<tokenIdStr>` — strip the trailing
    // filename to get the baseURI the contract will concatenate against.
    const baseURI = metadataUri.replace(/\/[^/]+$/, '/');
    // Sanity: baseURI + tokenIdStr must equal metadataUri.
    if (`${baseURI}${tokenIdStr}` !== metadataUri) {
        throw new Error(
            `pinReleaseMetadata: unexpected metadataUri shape "${metadataUri}" for tokenId ${tokenIdStr}`,
        );
    }

    return {
        baseURI,
        metadataUri,
        tokenId: tokenIdStr,
        coverImageUri: pinnedCoverUri,
        animationUri: pinnedAnimationUri,
        metadataJson,
    };
}
