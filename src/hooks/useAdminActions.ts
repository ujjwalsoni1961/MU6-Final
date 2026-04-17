/**
 * Admin Action Hooks
 *
 * Mutation hooks for all admin management operations.
 * Every action logs to admin_audit_log.
 */

import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/admin/AdminActionComponents';
import { sendVerificationStatusEmail, sendRoyaltyPayoutEmail } from '../services/email';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ukavmvxelsfdfktiiyvg.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// ────────────────────────────────────────────
// Audit log helper
// ────────────────────────────────────────────

async function logAuditAction(
    action: string,
    targetType: string,
    targetId: string,
    details?: Record<string, any>,
) {
    // The admin dashboard uses a static `superadmin` bypass (useAdminAuth)
    // that is intentionally decoupled from Supabase Auth, so auth.uid() is
    // usually NULL here. Migration 027 made admin_audit_log.admin_id nullable
    // to represent "system / superadmin bypass" cleanly. Passing NULL avoids
    // the FK violation against profiles(id) that previously produced 500s.
    const { data: { user } } = await supabase.auth.getUser();
    const result = await executeAdminInsert('admin_audit_log', {
        admin_id: user?.id ?? null,
        action,
        target_type: targetType,
        target_id: targetId,
        details: details || {},
    });
    // Audit log failures must not silently swallow — surface to console so we
    // can detect future schema drift, but do NOT throw (the primary mutation
    // has already succeeded and we don't want to confuse the admin UI).
    if (result && result.success === false) {
        console.error('[admin] logAuditAction failed:', result.error, {
            action,
            targetType,
            targetId,
        });
    }
}

async function executeAdminUpdate(table: string, id: string, updates: Record<string, any>) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-action`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
            profileId: 'superadmin',
            action: 'update',
            table,
            id,
            updates,
        }),
    });
    return response.json();
}

async function executeAdminDelete(table: string, id: string) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-action`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
            profileId: 'superadmin',
            action: 'delete',
            table,
            id,
        }),
    });
    return response.json();
}

async function executeAdminInsert(table: string, updates: Record<string, any> | Record<string, any>[]) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-action`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
            profileId: 'superadmin',
            action: 'insert',
            table,
            updates,
        }),
    });
    return response.json();
}

// ────────────────────────────────────────────
// USER MANAGEMENT ACTIONS
// ────────────────────────────────────────────

export function useAdminUserActions(refresh: () => void) {
    const toggleActive = useCallback(async (userId: string, currentValue: boolean) => {
        const newValue = !currentValue;
        const { error } = await executeAdminUpdate('profiles', userId, { is_active: newValue });

        if (error) {
            showToast(`Failed to ${newValue ? 'enable' : 'disable'} user`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'enable_user' : 'disable_user', 'profile', userId);
        showToast(`User ${newValue ? 'enabled' : 'disabled'} successfully`);
        refresh();
    }, [refresh]);

    const toggleBlocked = useCallback(async (userId: string, currentValue: boolean) => {
        const newValue = !currentValue;
        const { error } = await executeAdminUpdate('profiles', userId, { is_blocked: newValue });

        if (error) {
            showToast(`Failed to ${newValue ? 'block' : 'unblock'} user`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'block_user' : 'unblock_user', 'profile', userId);
        showToast(`User ${newValue ? 'blocked' : 'unblocked'} successfully`);
        refresh();
    }, [refresh]);

    const toggleVerified = useCallback(async (userId: string, currentValue: boolean) => {
        const newValue = !currentValue;
        const { error } = await executeAdminUpdate('profiles', userId, { is_verified: newValue });

        if (error) {
            showToast(`Failed to ${newValue ? 'verify' : 'unverify'} artist`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'verify_artist' : 'unverify_artist', 'profile', userId);
        showToast(`Artist ${newValue ? 'verified' : 'unverified'} successfully`);

        // Fire-and-forget: email the artist about verification status change
        try {
            const { data: { users } } = await supabase.auth.admin.listUsers();
            const artistUser = users?.find((u: any) => u.id === userId);
            if (artistUser?.email) {
                void sendVerificationStatusEmail(artistUser.email, newValue).catch(() => {});
            }
        } catch (emailErr) {
            console.warn('[admin] Verification email failed (non-blocking):', emailErr);
        }

        refresh();
    }, [refresh]);

    const changeRole = useCallback(async (userId: string, newRole: string) => {
        const { error } = await executeAdminUpdate('profiles', userId, { role: newRole });

        if (error) {
            showToast('Failed to change user role', 'error');
            return;
        }
        await logAuditAction('change_role', 'profile', userId, { new_role: newRole });
        showToast(`Role changed to ${newRole}`);
        refresh();
    }, [refresh]);

    const deleteUser = useCallback(async (userId: string) => {
        const { error } = await executeAdminDelete('profiles', userId);

        if (error) {
            showToast('Failed to delete user', 'error');
            return;
        }
        await logAuditAction('delete_user', 'profile', userId);
        showToast('User deleted successfully');
        refresh();
    }, [refresh]);

    return { toggleActive, toggleBlocked, toggleVerified, changeRole, deleteUser };
}

// ────────────────────────────────────────────
// SONG MANAGEMENT ACTIONS
// ────────────────────────────────────────────

export function useAdminSongActions(refresh: () => void) {
    const toggleListed = useCallback(async (songId: string, currentValue: boolean) => {
        const newValue = !currentValue;
        const { error } = await executeAdminUpdate('songs', songId, { is_listed: newValue });

        if (error) {
            showToast(`Failed to ${newValue ? 'relist' : 'delist'} song`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'relist_song' : 'delist_song', 'song', songId);
        showToast(`Song ${newValue ? 'relisted' : 'delisted'} successfully`);
        refresh();
    }, [refresh]);

    const toggleFeatured = useCallback(async (songId: string, currentValue: boolean) => {
        const newValue = !currentValue;
        const { error } = await executeAdminUpdate('songs', songId, { is_featured: newValue });

        if (error) {
            showToast(`Failed to ${newValue ? 'feature' : 'unfeature'} song`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'feature_song' : 'unfeature_song', 'song', songId);
        showToast(`Song ${newValue ? 'featured' : 'unfeatured'} successfully`);
        refresh();
    }, [refresh]);

    const deleteSong = useCallback(async (songId: string) => {
        // PDF #11 — use soft-delete so mobile hides the song instantly while
        // preserving historical NFT / streaming / royalty data for reconciliation.
        // Also unpublish so the song disappears from any admin query that
        // only filters by `is_published`.
        const { error } = await executeAdminUpdate('songs', songId, {
            deleted_at: new Date().toISOString(),
            is_published: false,
            is_listed: false,
            is_featured: false,
        });

        if (error) {
            showToast('Failed to delete song', 'error');
            return;
        }
        await logAuditAction('delete_song', 'song', songId);
        showToast('Song deleted successfully');
        refresh();
    }, [refresh]);

    return { toggleListed, toggleFeatured, deleteSong };
}

// ────────────────────────────────────────────
// NFT RELEASE ACTIONS
// ────────────────────────────────────────────

export function useAdminNFTReleaseActions(refresh: () => void) {
    const toggleActive = useCallback(async (releaseId: string, currentValue: boolean) => {
        const newValue = !currentValue;
        const { error } = await executeAdminUpdate('nft_releases', releaseId, { is_active: newValue });

        if (error) {
            showToast(`Failed to ${newValue ? 'relist' : 'delist'} release`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'relist_nft_release' : 'delist_nft_release', 'nft_release', releaseId);
        showToast(`NFT release ${newValue ? 'relisted' : 'delisted'} successfully`);
        refresh();
    }, [refresh]);

    return { toggleActive };
}

// ────────────────────────────────────────────
// NFT TOKEN ACTIONS
// ────────────────────────────────────────────

export function useAdminNFTTokenActions(refresh: () => void) {
    const voidToken = useCallback(async (tokenId: string) => {
        const { error } = await executeAdminUpdate('nft_tokens', tokenId, { is_voided: true });

        if (error) {
            showToast('Failed to void token', 'error');
            return;
        }
        await logAuditAction('void_nft_token', 'nft_token', tokenId);
        showToast('NFT token voided successfully');
        refresh();
    }, [refresh]);

    /**
     * Reconcile DB NFT ownership with on-chain state.
     * Calls the reconcile-nfts edge function which walks every nft_tokens row
     * with an on_chain_token_id and syncs owner_wallet_address against ownerOf().
     */
    const reconcileOnChain = useCallback(async (): Promise<{
        success: boolean;
        summary?: { total: number; updated: number; voided: number; unchanged: number; errors: number };
        error?: string;
    }> => {
        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/reconcile-nfts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({ profileId: 'superadmin' }),
            });
            const json = await response.json();
            if (!response.ok || json.error) {
                showToast(`Reconcile failed: ${json.error || response.statusText}`, 'error');
                return { success: false, error: json.error || response.statusText };
            }
            await logAuditAction('reconcile_nfts', 'nft_token', 'all', json);
            showToast(
                `Reconciled ${json.total} tokens: ${json.updated} updated, ${json.voided} voided`,
            );
            refresh();
            return { success: true, summary: json };
        } catch (e: any) {
            showToast(`Reconcile error: ${e?.message || String(e)}`, 'error');
            return { success: false, error: e?.message };
        }
    }, [refresh]);

    return { voidToken, reconcileOnChain };
}

// ────────────────────────────────────────────
// MARKETPLACE LISTING ACTIONS
// ────────────────────────────────────────────

export function useAdminMarketplaceActions(refresh: () => void) {
    const toggleActive = useCallback(async (listingId: string, currentValue: boolean) => {
        const newValue = !currentValue;
        const updates: Record<string, any> = { is_active: newValue };
        if (!newValue) {
            updates.cancelled_at = new Date().toISOString();
        }
        const { error } = await executeAdminUpdate('marketplace_listings', listingId, updates);

        if (error) {
            showToast(`Failed to ${newValue ? 'activate' : 'deactivate'} listing`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'activate_listing' : 'deactivate_listing', 'marketplace_listing', listingId);
        showToast(`Listing ${newValue ? 'activated' : 'deactivated'} successfully`);
        refresh();
    }, [refresh]);

    return { toggleActive };
}

export function useAdminPayoutActions(refresh: () => void) {
    const approvePayout = useCallback(async (payout: any, notes?: string) => {
        if (!payout || !payout.id) {
            showToast('Payout not found', 'error');
            return;
        }

        let txHash: string | undefined;

        if (payout.paymentMethod === 'crypto' && payout.amountEur) {
            const recipientWallet = payout.walletAddress;
            try {
                // Approximate 1 EUR = 0.0003 ETH (hardcoded for demo)
                const amountEth = payout.amountEur * 0.0003;
                const amountWei = Math.floor(amountEth * 1e18).toString();

                const response = await fetch(`${SUPABASE_URL}/functions/v1/thirdweb-transfer`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({
                        recipientAddress: recipientWallet,
                        amountWei,
                    }),
                });
                const result = await response.json();
                if (result.success && result.txHash) {
                    txHash = result.txHash;
                    console.log('[admin] Crypto payout sent, tx:', txHash);
                } else {
                    showToast(`Crypto transfer failed: ${result.error || 'Unknown error'}. Payout marked as approved, manual transfer needed.`, 'error');
                }
            } catch (err: any) {
                console.error('[admin] Crypto payout transfer error:', err);
                showToast('Crypto transfer failed. Payout approved but manual transfer needed.', 'error');
            }
        }

        // For bank transfers: mark as approved with admin note
        const updatePayload: Record<string, any> = {
            status: 'completed',
            processed_at: new Date().toISOString(),
        };
        if (txHash) {
            updatePayload.tx_hash = txHash;
        }
        
        if (notes) {
            updatePayload.admin_notes = notes;
        } else if (payout.paymentMethod === 'bank_transfer') {
            updatePayload.admin_notes = 'Approved — manual processing completed';
        }

        const result = await executeAdminUpdate('payout_requests', payout.id, updatePayload);
        
        if (!result.success) {
            showToast('Failed to approve payout', 'error');
            return;
        }
        await logAuditAction('approve_payout', 'payout_request', payout.id, { txHash, notes });
        showToast(txHash ? 'Payout sent on-chain' : 'Payout approved manually');

        // Fire-and-forget: email the artist about payout
        try {
            const { data: { users } } = await supabase.auth.admin.listUsers();
            const artistUser = users?.find((u: any) => u.id === payout.profileId);
            if (artistUser?.email) {
                void sendRoyaltyPayoutEmail(
                    artistUser.email,
                    (payout.amountEur || 0).toFixed(4),
                    'Your music',
                    'N/A',
                ).catch(() => {});
            }
        } catch (emailErr) {
            console.warn('[admin] Payout email failed (non-blocking):', emailErr);
        }

        refresh();
    }, [refresh]);

    const rejectPayout = useCallback(async (payoutId: string, reason?: string) => {
        const result = await executeAdminUpdate('payout_requests', payoutId, {
            status: 'failed',
            processed_at: new Date().toISOString(),
            admin_notes: reason || 'Rejected by admin',
        });

        if (!result.success) {
            showToast('Failed to reject payout', 'error');
            return;
        }
        await logAuditAction('reject_payout', 'payout_request', payoutId, { reason });
        showToast('Payout rejected');
        refresh();
    }, [refresh]);

    return { approvePayout, rejectPayout };
}

// ────────────────────────────────────────────
// NFT LIMIT REQUEST ACTIONS (admin approve/reject)
// ────────────────────────────────────────────

type NftRarity = 'common' | 'rare' | 'legendary';

export function useAdminNFTLimitActions(refresh: () => void) {
    const approveRequest = useCallback(async (request: any, notes?: string) => {
        if (!request || !request.id) {
            showToast('Request not found', 'error');
            return;
        }
        if (request.status !== 'pending') {
            showToast('Request is not pending', 'error');
            return;
        }

        // 1) Read latest request row to get canonical requested values / profile_id.
        const { data: reqRow, error: reqErr } = await supabase
            .from('nft_limit_requests')
            .select('*')
            .eq('id', request.id)
            .maybeSingle();
        if (reqErr || !reqRow) {
            showToast('Request not found', 'error');
            return;
        }
        if (reqRow.status !== 'pending') {
            showToast('Request is no longer pending', 'error');
            return;
        }

        // 2) Read target profile's current allowed rarities (to merge, not replace).
        const { data: targetProfile } = await supabase
            .from('profiles')
            .select('allowed_nft_rarities')
            .eq('id', reqRow.profile_id)
            .maybeSingle();

        const existing = (targetProfile?.allowed_nft_rarities ?? ['common']) as NftRarity[];
        const requested = (reqRow.requested_rarities ?? []) as NftRarity[];

        // 3) Build profile patch.
        const profilePatch: Record<string, any> = {};
        if (reqRow.requested_listing_limit !== null && reqRow.requested_listing_limit !== undefined) {
            profilePatch.nft_listing_limit = reqRow.requested_listing_limit;
        }
        if (requested.length > 0) {
            const combined = Array.from(new Set([...existing, ...requested])) as NftRarity[];
            profilePatch.allowed_nft_rarities = combined;
        }

        // 4) Apply profile patch via service-role bypass.
        if (Object.keys(profilePatch).length > 0) {
            const profileResult = await executeAdminUpdate('profiles', reqRow.profile_id, profilePatch);
            if (!profileResult.success) {
                showToast(profileResult.error || 'Failed to update artist limits', 'error');
                return;
            }
        }

        // 5) Mark request approved.
        const reqResult = await executeAdminUpdate('nft_limit_requests', request.id, {
            status: 'approved',
            admin_notes: notes || null,
            processed_at: new Date().toISOString(),
        });
        if (!reqResult.success) {
            showToast(reqResult.error || 'Failed to mark request approved', 'error');
            return;
        }

        await logAuditAction('approve_nft_limit_request', 'nft_limit_request', request.id, {
            profile_id: reqRow.profile_id,
            new_limit: profilePatch.nft_listing_limit,
            new_rarities: profilePatch.allowed_nft_rarities,
            notes,
        });
        showToast('Request approved — artist limits updated');
        refresh();
    }, [refresh]);

    const rejectRequest = useCallback(async (requestId: string, reason?: string) => {
        const result = await executeAdminUpdate('nft_limit_requests', requestId, {
            status: 'rejected',
            admin_notes: reason || 'Rejected by admin',
            processed_at: new Date().toISOString(),
        });
        if (!result.success) {
            showToast(result.error || 'Failed to reject request', 'error');
            return;
        }
        await logAuditAction('reject_nft_limit_request', 'nft_limit_request', requestId, { reason });
        showToast('Request rejected');
        refresh();
    }, [refresh]);

    return { approveRequest, rejectRequest };
}

// ────────────────────────────────────────────
// TRANSACTION / MARKETPLACE FLAG ACTIONS
// ────────────────────────────────────────────

export function useAdminTransactionActions(refresh: () => void) {
    const toggleFlagged = useCallback(async (listingId: string, currentValue: boolean) => {
        const newValue = !currentValue;
        const { error } = await executeAdminUpdate('marketplace_listings', listingId, { is_flagged: newValue });

        if (error) {
            showToast(`Failed to ${newValue ? 'flag' : 'unflag'} transaction`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'flag_transaction' : 'unflag_transaction', 'marketplace_listing', listingId);
        showToast(`Transaction ${newValue ? 'flagged' : 'unflagged'} successfully`);
        refresh();
    }, [refresh]);

    return { toggleFlagged };
}

// ────────────────────────────────────────────
// NOTIFICATION / BROADCAST ACTIONS
// ────────────────────────────────────────────

export function useAdminNotificationActions(refresh: () => void) {
    const broadcastNotification = useCallback(async (data: {
        title: string;
        body: string;
        type: string;
    }) => {
        // Get all user profile IDs
        const { data: profiles, error: fetchError } = await supabase
            .from('profiles')
            .select('id')
            .neq('role', 'admin');

        if (fetchError || !profiles?.length) {
            showToast('Failed to fetch user profiles', 'error');
            return;
        }

        // Insert a notification for each user
        const notifications = profiles.map((p: any) => ({
            profile_id: p.id,
            type: data.type,
            title: data.title,
            body: data.body,
            is_read: false,
        }));

        const { error } = await executeAdminInsert('notifications', notifications);

        if (error) {
            showToast('Failed to send notifications', 'error');
            return;
        }

        await logAuditAction('broadcast_notification', 'notification', 'all', {
            title: data.title,
            type: data.type,
            recipient_count: profiles.length,
        });
        showToast(`Notification sent to ${profiles.length} users`);
        refresh();
    }, [refresh]);

    return { broadcastNotification };
}
