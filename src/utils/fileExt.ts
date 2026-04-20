/**
 * File-extension helpers
 * ─────────────────────────────────────────────
 * DO NOT use `uri.split('.').pop()` on arbitrary URIs — it breaks on
 * `blob:http://…`, `app://…`, presigned S3 URLs with query strings, etc.,
 * producing garbage extensions that then get baked into IPFS filenames
 * and DB rows (observed in prod: `nft-cover-…app/976cfcb5-…`).
 *
 * Always use `extFromBlobOrUri` which prefers MIME → extension, and only
 * falls back to a URL-path tail when it actually looks like an extension.
 */

const MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/svg+xml': 'svg',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'application/json': 'json',
    'application/pdf': 'pdf',
};

// Very conservative: only treat a trailing token as an extension if it is
// 2–5 lowercase alphanumerics. Rejects things like `app/976cfcb5-…` and
// `0:8081/fb209d04-…`.
const EXT_REGEX = /^[a-z0-9]{2,5}$/;

/**
 * Pull a safe extension off a file URL path, ignoring scheme, query, hash,
 * and blob/app junk. Returns null when no clean extension is found.
 */
function extFromUriPath(uri: string): string | null {
    if (!uri) return null;
    // Strip scheme so blob:// / app:// / file:// / http(s):// don't interfere.
    const afterScheme = uri.replace(/^[a-z]+:\/{0,2}/i, '');
    // Trim query / hash.
    const pathOnly = afterScheme.split('?')[0].split('#')[0];
    // Last path segment.
    const lastSeg = pathOnly.split('/').pop() || '';
    if (!lastSeg.includes('.')) return null;
    const tail = lastSeg.split('.').pop()?.toLowerCase() || '';
    if (!EXT_REGEX.test(tail)) return null;
    return tail === 'jpeg' ? 'jpg' : tail;
}

/**
 * Resolve a safe file extension.
 *
 * Preference order:
 *   1. Blob.type MIME lookup (most reliable)
 *   2. URI tail when it matches the strict extension pattern
 *   3. Fallback default (caller-chosen, defaults to 'jpg')
 */
export function extFromBlobOrUri(
    blob: Blob | null | undefined,
    uri: string | null | undefined,
    fallback: string = 'jpg',
): string {
    const mime = (blob?.type || '').toLowerCase().split(';')[0].trim();
    if (mime && MIME_TO_EXT[mime]) return MIME_TO_EXT[mime];
    const fromUri = uri ? extFromUriPath(uri) : null;
    if (fromUri) return fromUri;
    return fallback;
}

/**
 * Resolve a MIME type for upload headers / file pinning, preferring the
 * blob's own type and only deriving from extension when the blob is
 * typeless (common on native where expo sometimes returns empty `type`).
 */
export function mimeFromBlobOrExt(
    blob: Blob | null | undefined,
    ext: string,
): string {
    const declared = (blob?.type || '').toLowerCase().split(';')[0].trim();
    if (declared && declared !== 'application/octet-stream') return declared;
    const normalized = ext.toLowerCase() === 'jpg' ? 'jpeg' : ext.toLowerCase();
    // Fall back to image/<ext> for common image cases; callers can override.
    return `image/${normalized}`;
}
