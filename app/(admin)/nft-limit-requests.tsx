import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { Gem, CheckCircle, XCircle } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge, AdminFilterPills } from '../../src/components/admin/AdminScreenWrapper';
import { ActionButton, PromptModal, RowActions } from '../../src/components/admin/AdminActionComponents';
import {
    getAllNFTLimitRequests,
    NFTLimitRequest,
} from '../../src/services/database';
import { useTheme } from '../../src/context/ThemeContext';
import { useAdminNFTLimitActions } from '../../src/hooks/useAdminActions';

const isWeb = Platform.OS === 'web';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function AdminNFTLimitRequestsScreen() {
    const { colors } = useTheme();
    const [status, setStatus] = useState<StatusFilter>('pending');
    const [requests, setRequests] = useState<NFTLimitRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [approveTarget, setApproveTarget] = useState<NFTLimitRequest | null>(null);
    const [rejectTarget, setRejectTarget] = useState<NFTLimitRequest | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const rows = await getAllNFTLimitRequests(status === 'all' ? undefined : status);
            setRequests(rows);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load requests');
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const { approveRequest, rejectRequest } = useAdminNFTLimitActions(() => {
        setApproveTarget(null);
        setRejectTarget(null);
        refresh();
    });

    const handleApprove = async (notes: string) => {
        if (!approveTarget) return;
        setActionLoading(true);
        try {
            await approveRequest(approveTarget, notes || undefined);
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async (notes: string) => {
        if (!rejectTarget) return;
        setActionLoading(true);
        try {
            await rejectRequest(rejectTarget.id, notes || undefined);
        } finally {
            setActionLoading(false);
        }
    };

    const columns = [
        { label: 'Artist', flex: 1 },
        { label: 'Requested', flex: 1.2 },
        { label: 'Current', flex: 1 },
        { label: 'Reason', flex: 1.4 },
        { label: 'Status', flex: 0.7 },
        { label: 'Submitted', flex: 0.8 },
        { label: 'Actions', flex: 1.2 },
    ];

    const renderRequestedDelta = (r: NFTLimitRequest) => {
        const parts: string[] = [];
        if (r.requestedListingLimit !== null) {
            parts.push(`Limit → ${r.requestedListingLimit}`);
        }
        if (r.requestedRarities && r.requestedRarities.length > 0) {
            parts.push(`Tiers: ${r.requestedRarities.join(', ')}`);
        }
        return parts.length > 0 ? parts.join(' · ') : '—';
    };

    const renderCurrent = (r: NFTLimitRequest) => {
        const lim = r.currentListingLimit ?? '—';
        const rar = (r.currentAllowedRarities ?? []).join(', ') || '—';
        return `${lim} · ${rar}`;
    };

    return (
        <AdminScreen
            title="NFT Limit Requests"
            subtitle={!loading ? `${requests.length} ${status === 'all' ? 'total' : status} request${requests.length === 1 ? '' : 's'}` : 'Loading...'}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <AdminFilterPills
                    options={[
                        { value: 'pending', label: 'Pending' },
                        { value: 'approved', label: 'Approved' },
                        { value: 'rejected', label: 'Rejected' },
                        { value: 'all', label: 'All' },
                    ]}
                    selected={status}
                    onSelect={(v: string) => setStatus(v as StatusFilter)}
                />
            </View>

            <AdminDataTable
                headers={['Artist', 'Requested', 'Current', 'Reason', 'Status', 'Submitted', 'Actions']}
                columns={columns}
                data={requests}
                emptyMessage="No NFT limit requests found"
                minTableWidth={1100}
                renderRow={(r: NFTLimitRequest) => {
                    const isPending = r.status === 'pending';
                    return (
                        <View style={{
                            flexDirection: isWeb ? 'row' : 'column',
                            alignItems: isWeb ? 'center' : 'flex-start',
                            padding: 14,
                        }}>
                            {isWeb ? (
                                <>
                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                        <Gem size={16} color="#38b4ba" style={{ marginRight: 10 }} />
                                        <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                                            {r.artistName || 'Unknown'}
                                        </Text>
                                    </View>
                                    <Text style={{ flex: 1.2, color: colors.text.primary, fontSize: 12 }} numberOfLines={2}>
                                        {renderRequestedDelta(r)}
                                    </Text>
                                    <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 12 }} numberOfLines={2}>
                                        {renderCurrent(r)}
                                    </Text>
                                    <Text style={{ flex: 1.4, color: colors.text.muted, fontSize: 12 }} numberOfLines={3}>
                                        {r.reason || '—'}
                                    </Text>
                                    <View style={{ flex: 0.7 }}>
                                        <StatusBadge status={r.status} />
                                    </View>
                                    <Text style={{ flex: 0.8, color: colors.text.muted, fontSize: 12 }}>
                                        {new Date(r.requestedAt).toLocaleDateString()}
                                    </Text>
                                    <View style={{ flex: 1.2 }}>
                                        {isPending ? (
                                            <RowActions>
                                                <ActionButton
                                                    icon={<CheckCircle size={12} color={colors.status.success} />}
                                                    label="Approve"
                                                    color={colors.status.success}
                                                    onPress={() => setApproveTarget(r)}
                                                />
                                                <ActionButton
                                                    icon={<XCircle size={12} color={colors.status.error} />}
                                                    label="Reject"
                                                    color={colors.status.error}
                                                    onPress={() => setRejectTarget(r)}
                                                />
                                            </RowActions>
                                        ) : (
                                            <Text style={{ color: colors.text.muted, fontSize: 11 }}>
                                                {r.processedAt ? new Date(r.processedAt).toLocaleDateString() : '—'}
                                            </Text>
                                        )}
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, width: '100%' }}>
                                        <Gem size={18} color="#38b4ba" style={{ marginRight: 10 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>
                                                {r.artistName || 'Unknown'}
                                            </Text>
                                            <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>
                                                {renderRequestedDelta(r)}
                                            </Text>
                                        </View>
                                        <StatusBadge status={r.status} />
                                    </View>
                                    <Text style={{ color: colors.text.muted, fontSize: 12, marginBottom: 6 }}>
                                        Current: {renderCurrent(r)}
                                    </Text>
                                    {r.reason ? (
                                        <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 10 }}>
                                            “{r.reason}”
                                        </Text>
                                    ) : null}
                                    {isPending && (
                                        <RowActions>
                                            <ActionButton
                                                icon={<CheckCircle size={12} color={colors.status.success} />}
                                                label="Approve"
                                                color={colors.status.success}
                                                onPress={() => setApproveTarget(r)}
                                            />
                                            <ActionButton
                                                icon={<XCircle size={12} color={colors.status.error} />}
                                                label="Reject"
                                                color={colors.status.error}
                                                onPress={() => setRejectTarget(r)}
                                            />
                                        </RowActions>
                                    )}
                                </>
                            )}
                        </View>
                    );
                }}
            />

            <PromptModal
                visible={!!approveTarget}
                title="Approve NFT Limit Request"
                message={`Approve the request from "${approveTarget?.artistName}"?\n${approveTarget ? renderRequestedDelta(approveTarget) : ''}\n\nOptional admin note:`}
                inputPlaceholder="e.g. Verified artist — unlocking rare tier"
                confirmLabel="Approve"
                confirmColor="#22c55e"
                onConfirm={handleApprove}
                onCancel={() => setApproveTarget(null)}
                loading={actionLoading}
            />

            <PromptModal
                visible={!!rejectTarget}
                title="Reject NFT Limit Request"
                message={`Reject the request from "${rejectTarget?.artistName}"?\nPlease provide a reason the artist will see:`}
                inputPlaceholder="Reason for rejection..."
                confirmLabel="Reject"
                confirmColor="#ef4444"
                onConfirm={handleReject}
                onCancel={() => setRejectTarget(null)}
                loading={actionLoading}
            />
        </AdminScreen>
    );
}
