import React, { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { CreditCard, CheckCircle, XCircle } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { ActionButton, ConfirmModal, RowActions } from '../../src/components/admin/AdminActionComponents';
import { useAdminPayoutRequests } from '../../src/hooks/useAdminData';
import { useAdminPayoutActions } from '../../src/hooks/useAdminActions';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminPayoutsScreen() {
    const { data: payouts, loading, error, refresh } = useAdminPayoutRequests();
    const actions = useAdminPayoutActions(refresh);
    const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
    const [approveTarget, setApproveTarget] = useState<{ id: string; name: string; amount: number } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const { colors } = useTheme();

    const handleApprove = async () => {
        if (!approveTarget) return;
        setActionLoading(true);
        await actions.approvePayout(approveTarget.id);
        setActionLoading(false);
        setApproveTarget(null);
    };

    const handleReject = async () => {
        if (!rejectTarget) return;
        setActionLoading(true);
        await actions.rejectPayout(rejectTarget.id);
        setActionLoading(false);
        setRejectTarget(null);
    };

    const payoutColumns = [
        { label: 'Recipient', flex: 1 },
        { label: 'Wallet', flex: 1 },
        { label: 'Amount', flex: 0.7 },
        { label: 'Method', flex: 0.7 },
        { label: 'Status', flex: 0.7 },
        { label: 'Requested', flex: 0.8 },
        { label: 'Actions', flex: 1.2 },
    ];

    return (
        <AdminScreen
            title="Payout Requests"
            subtitle={!loading ? `${payouts.length} requests` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Recipient', 'Wallet', 'Amount', 'Method', 'Status', 'Requested', 'Actions']}
                columns={payoutColumns}
                data={payouts}
                emptyMessage="No payout requests found"
                minTableWidth={900}
                renderRow={(p) => {
                    const isPending = p.status === 'pending';
                    return (
                        <View style={{
                            flexDirection: isWeb ? 'row' : 'column',
                            alignItems: isWeb ? 'center' : 'flex-start',
                            padding: 14,
                        }}>
                            {isWeb ? (
                                <>
                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                        <CreditCard size={16} color="#f59e0b" style={{ marginRight: 10 }} />
                                        <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{p.profileName}</Text>
                                    </View>
                                    <Text style={{ flex: 1, color: colors.text.muted, fontSize: 11, fontFamily: 'monospace' }}>
                                        {p.walletAddress ? `${p.walletAddress.slice(0, 6)}...${p.walletAddress.slice(-4)}` : '—'}
                                    </Text>
                                    <Text style={{ flex: 0.7, color: colors.status.success, fontSize: 12, fontWeight: '600' }}>
                                        {p.amountEur.toFixed(2)} EUR
                                    </Text>
                                    <Text style={{ flex: 0.7, color: colors.text.secondary, fontSize: 12, textTransform: 'capitalize' }}>
                                        {p.paymentMethod || '—'}
                                    </Text>
                                    <View style={{ flex: 0.7 }}>
                                        <StatusBadge status={p.status || 'pending'} />
                                    </View>
                                    <Text style={{ flex: 0.8, color: colors.text.muted, fontSize: 12 }}>
                                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                                    </Text>
                                    <View style={{ flex: 1.2 }}>
                                        {isPending ? (
                                            <RowActions>
                                                <ActionButton
                                                    icon={<CheckCircle size={12} color={colors.status.success} />}
                                                    label="Approve"
                                                    color={colors.status.success}
                                                    onPress={() => setApproveTarget({ id: p.id, name: p.profileName, amount: p.amountEur })}
                                                />
                                                <ActionButton
                                                    icon={<XCircle size={12} color={colors.status.error} />}
                                                    label="Reject"
                                                    color={colors.status.error}
                                                    onPress={() => setRejectTarget({ id: p.id, name: p.profileName })}
                                                />
                                            </RowActions>
                                        ) : (
                                            <Text style={{ color: colors.text.muted, fontSize: 11 }}>
                                                {p.processedAt ? new Date(p.processedAt).toLocaleDateString() : '—'}
                                            </Text>
                                        )}
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                        <CreditCard size={18} color="#f59e0b" style={{ marginRight: 10 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{p.profileName}</Text>
                                            <Text style={{ color: colors.status.success, fontSize: 12 }}>{p.amountEur.toFixed(2)} EUR via {p.paymentMethod || '—'}</Text>
                                        </View>
                                        <StatusBadge status={p.status || 'pending'} />
                                    </View>
                                    {isPending && (
                                        <RowActions>
                                            <ActionButton
                                                icon={<CheckCircle size={12} color={colors.status.success} />}
                                                label="Approve"
                                                color={colors.status.success}
                                                onPress={() => setApproveTarget({ id: p.id, name: p.profileName, amount: p.amountEur })}
                                            />
                                            <ActionButton
                                                icon={<XCircle size={12} color={colors.status.error} />}
                                                label="Reject"
                                                color={colors.status.error}
                                                onPress={() => setRejectTarget({ id: p.id, name: p.profileName })}
                                            />
                                        </RowActions>
                                    )}
                                </>
                            )}
                        </View>
                    );
                }}
            />

            <ConfirmModal
                visible={!!approveTarget}
                title="Approve Payout"
                message={`Approve payout of ${approveTarget?.amount?.toFixed(2)} EUR to "${approveTarget?.name}"?`}
                confirmLabel="Approve"
                confirmColor="#22c55e"
                onConfirm={handleApprove}
                onCancel={() => setApproveTarget(null)}
                loading={actionLoading}
            />

            <ConfirmModal
                visible={!!rejectTarget}
                title="Reject Payout"
                message={`Are you sure you want to reject the payout request from "${rejectTarget?.name}"?`}
                confirmLabel="Reject"
                confirmColor="#ef4444"
                onConfirm={handleReject}
                onCancel={() => setRejectTarget(null)}
                loading={actionLoading}
            />
        </AdminScreen>
    );
}
