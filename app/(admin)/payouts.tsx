import React, { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { CreditCard, CheckCircle, XCircle } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { ActionButton, ConfirmModal, RowActions } from '../../src/components/admin/AdminActionComponents';
import { useAdminPayoutRequests } from '../../src/hooks/useAdminData';
import { useAdminPayoutActions } from '../../src/hooks/useAdminActions';

const isWeb = Platform.OS === 'web';

export default function AdminPayoutsScreen() {
    const { data: payouts, loading, error, refresh } = useAdminPayoutRequests();
    const actions = useAdminPayoutActions(refresh);
    const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
    const [approveTarget, setApproveTarget] = useState<{ id: string; name: string; amount: number } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

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
                data={payouts}
                emptyMessage="No payout requests found"
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
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{p.profileName}</Text>
                                    </View>
                                    <Text style={{ flex: 1, color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                                        {p.walletAddress ? `${p.walletAddress.slice(0, 6)}...${p.walletAddress.slice(-4)}` : '—'}
                                    </Text>
                                    <Text style={{ flex: 1, color: '#4ade80', fontSize: 12, fontWeight: '600' }}>
                                        {p.amountEur.toFixed(2)} EUR
                                    </Text>
                                    <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12, textTransform: 'capitalize' }}>
                                        {p.paymentMethod || '—'}
                                    </Text>
                                    <View style={{ flex: 1 }}>
                                        <StatusBadge status={p.status || 'pending'} />
                                    </View>
                                    <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                                    </Text>
                                    <View style={{ flex: 1 }}>
                                        {isPending ? (
                                            <RowActions>
                                                <ActionButton
                                                    icon={<CheckCircle size={12} color="#4ade80" />}
                                                    label="Approve"
                                                    color="#4ade80"
                                                    onPress={() => setApproveTarget({ id: p.id, name: p.profileName, amount: p.amountEur })}
                                                />
                                                <ActionButton
                                                    icon={<XCircle size={12} color="#f87171" />}
                                                    label="Reject"
                                                    color="#f87171"
                                                    onPress={() => setRejectTarget({ id: p.id, name: p.profileName })}
                                                />
                                            </RowActions>
                                        ) : (
                                            <Text style={{ color: '#475569', fontSize: 11 }}>
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
                                            <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{p.profileName}</Text>
                                            <Text style={{ color: '#4ade80', fontSize: 12 }}>{p.amountEur.toFixed(2)} EUR via {p.paymentMethod || '—'}</Text>
                                        </View>
                                        <StatusBadge status={p.status || 'pending'} />
                                    </View>
                                    {isPending && (
                                        <RowActions>
                                            <ActionButton
                                                icon={<CheckCircle size={12} color="#4ade80" />}
                                                label="Approve"
                                                color="#4ade80"
                                                onPress={() => setApproveTarget({ id: p.id, name: p.profileName, amount: p.amountEur })}
                                            />
                                            <ActionButton
                                                icon={<XCircle size={12} color="#f87171" />}
                                                label="Reject"
                                                color="#f87171"
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
