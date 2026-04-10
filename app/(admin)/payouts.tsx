import React from 'react';
import { View, Text, Platform } from 'react-native';
import { CreditCard } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminPayoutRequests } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';

export default function AdminPayoutsScreen() {
    const { data: payouts, loading, error, refresh } = useAdminPayoutRequests();

    return (
        <AdminScreen
            title="Payout Requests"
            subtitle={!loading ? `${payouts.length} requests` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Recipient', 'Wallet', 'Amount (EUR)', 'Status', 'Requested', 'Processed']}
                data={payouts}
                emptyMessage="No payout requests found"
                renderRow={(p) => (
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
                                    {p.amountEur.toFixed(2)}
                                </Text>
                                <View style={{ flex: 1 }}><StatusBadge status={p.status || 'pending'} /></View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                                </Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {p.processedAt ? new Date(p.processedAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <CreditCard size={18} color="#f59e0b" style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{p.profileName}</Text>
                                    <Text style={{ color: '#4ade80', fontSize: 12 }}>{p.amountEur.toFixed(2)} EUR</Text>
                                </View>
                                <StatusBadge status={p.status || 'pending'} />
                            </View>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}
