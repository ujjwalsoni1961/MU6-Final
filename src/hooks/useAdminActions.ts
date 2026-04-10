/**
 * Admin Action Hooks
 *
 * Mutation hooks for all admin management operations.
 * Every action logs to admin_audit_log.
 */

import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/admin/AdminActionComponents';

// ────────────────────────────────────────────
// Audit log helper
// ────────────────────────────────────────────

async function logAuditAction(
    action: string,
    targetType: string,
    targetId: string,
    details?: Record<string, any>,
) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('admin_audit_log').insert({
        admin_id: user?.id || '00000000-0000-0000-0000-000000000000',
        action,
        target_type: targetType,
        target_id: targetId,
        details: details || {},
    });
}

// ────────────────────────────────────────────
// USER MANAGEMENT ACTIONS
// ────────────────────────────────────────────

export function useAdminUserActions(refresh: () => void) {
    const toggleActive = useCallback(async (userId: string, currentValue: boolean) => {
        const newValue = !currentValue;
        const { error } = await supabase
            .from('profiles')
            .update({ is_active: newValue })
            .eq('id', userId);

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
        const { error } = await supabase
            .from('profiles')
            .update({ is_blocked: newValue })
            .eq('id', userId);

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
        const { error } = await supabase
            .from('profiles')
            .update({ is_verified: newValue })
            .eq('id', userId);

        if (error) {
            showToast(`Failed to ${newValue ? 'verify' : 'unverify'} artist`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'verify_artist' : 'unverify_artist', 'profile', userId);
        showToast(`Artist ${newValue ? 'verified' : 'unverified'} successfully`);
        refresh();
    }, [refresh]);

    const changeRole = useCallback(async (userId: string, newRole: string) => {
        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);

        if (error) {
            showToast('Failed to change user role', 'error');
            return;
        }
        await logAuditAction('change_role', 'profile', userId, { new_role: newRole });
        showToast(`Role changed to ${newRole}`);
        refresh();
    }, [refresh]);

    const deleteUser = useCallback(async (userId: string) => {
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

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
        const { error } = await supabase
            .from('songs')
            .update({ is_listed: newValue })
            .eq('id', songId);

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
        const { error } = await supabase
            .from('songs')
            .update({ is_featured: newValue })
            .eq('id', songId);

        if (error) {
            showToast(`Failed to ${newValue ? 'feature' : 'unfeature'} song`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'feature_song' : 'unfeature_song', 'song', songId);
        showToast(`Song ${newValue ? 'featured' : 'unfeatured'} successfully`);
        refresh();
    }, [refresh]);

    const deleteSong = useCallback(async (songId: string) => {
        const { error } = await supabase
            .from('songs')
            .delete()
            .eq('id', songId);

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
        const { error } = await supabase
            .from('nft_releases')
            .update({ is_active: newValue })
            .eq('id', releaseId);

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
        const { error } = await supabase
            .from('nft_tokens')
            .update({ is_voided: true })
            .eq('id', tokenId);

        if (error) {
            showToast('Failed to void token', 'error');
            return;
        }
        await logAuditAction('void_nft_token', 'nft_token', tokenId);
        showToast('NFT token voided successfully');
        refresh();
    }, [refresh]);

    return { voidToken };
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
        const { error } = await supabase
            .from('marketplace_listings')
            .update(updates)
            .eq('id', listingId);

        if (error) {
            showToast(`Failed to ${newValue ? 'relist' : 'delist'} listing`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'relist_listing' : 'delist_listing', 'marketplace_listing', listingId);
        showToast(`Listing ${newValue ? 'relisted' : 'delisted'} successfully`);
        refresh();
    }, [refresh]);

    const toggleFlagged = useCallback(async (listingId: string, currentValue: boolean) => {
        const newValue = !currentValue;
        const { error } = await supabase
            .from('marketplace_listings')
            .update({ is_flagged: newValue })
            .eq('id', listingId);

        if (error) {
            showToast(`Failed to ${newValue ? 'flag' : 'unflag'} listing`, 'error');
            return;
        }
        await logAuditAction(newValue ? 'flag_listing' : 'unflag_listing', 'marketplace_listing', listingId);
        showToast(`Listing ${newValue ? 'flagged' : 'unflagged'} successfully`);
        refresh();
    }, [refresh]);

    return { toggleActive, toggleFlagged };
}

// ────────────────────────────────────────────
// PAYOUT ACTIONS
// ────────────────────────────────────────────

export function useAdminPayoutActions(refresh: () => void) {
    const approvePayout = useCallback(async (payoutId: string) => {
        // Fetch payout details to determine payment method
        const { data: payout } = await supabase
            .from('payout_requests')
            .select('*, profile:profiles!profile_id (wallet_address)')
            .eq('id', payoutId)
            .single();

        if (!payout) {
            showToast('Payout request not found', 'error');
            return;
        }

        let txHash: string | null = null;

        // For crypto payouts: send testnet POL via server wallet
        const recipientWallet = (payout.profile as any)?.wallet_address;
        if (payout.payment_method === 'crypto_wallet' && recipientWallet) {
            try {
                const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
                const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
                const amountWei = BigInt(Math.floor((payout.amount_eur || 0) * 1e18)).toString();
                const response = await fetch(`${SUPABASE_URL}/functions/v1/nft-admin`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({
                        action: 'transferFunds',
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
        if (payout.payment_method === 'bank_transfer') {
            updatePayload.admin_notes = 'Approved — manual bank transfer needed';
        }

        const { error } = await supabase
            .from('payout_requests')
            .update(updatePayload)
            .eq('id', payoutId);

        if (error) {
            showToast('Failed to approve payout', 'error');
            return;
        }
        await logAuditAction('approve_payout', 'payout_request', payoutId, { txHash });
        showToast(txHash ? 'Payout sent on-chain' : 'Payout approved successfully');
        refresh();
    }, [refresh]);

    const rejectPayout = useCallback(async (payoutId: string, reason?: string) => {
        const { error } = await supabase
            .from('payout_requests')
            .update({
                status: 'failed',
                processed_at: new Date().toISOString(),
                admin_notes: reason || 'Rejected by admin',
            })
            .eq('id', payoutId);

        if (error) {
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
// TRANSACTION / MARKETPLACE FLAG ACTIONS
// ────────────────────────────────────────────

export function useAdminTransactionActions(refresh: () => void) {
    const toggleFlagged = useCallback(async (listingId: string, currentValue: boolean) => {
        const newValue = !currentValue;
        const { error } = await supabase
            .from('marketplace_listings')
            .update({ is_flagged: newValue })
            .eq('id', listingId);

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

        const { error } = await supabase
            .from('notifications')
            .insert(notifications);

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
