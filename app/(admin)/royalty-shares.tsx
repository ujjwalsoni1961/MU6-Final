import React from 'react';
import { View, Text, Platform } from 'react-native';
import { PieChart } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminRoyaltyShares } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';

export default function AdminRoyaltySharesScreen() {
    const { data: shares, loading, error, refresh } = useAdminRoyaltyShares(100);

    return (
        <AdminScreen
            title="Royalty Shares"
            subtitle={!loading ? `${shares.length} share entries` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Song', 'Recipient', 'Source', 'Type', 'Share %', 'Amount (EUR)', 'Date']}
                data={shares}
                emptyMessage="No royalty shares found"
                renderRow={(s) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <PieChart size={16} color="#a78bfa" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{s.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{s.partyName}</Text>
                                <View style={{ flex: 1 }}><StatusBadge status={s.sourceType} /></View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12, textTransform: 'capitalize' }}>{s.shareType}</Text>
                                <Text style={{ flex: 1, color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>{s.sharePercent.toFixed(2)}%</Text>
                                <Text style={{ flex: 1, color: '#4ade80', fontSize: 12, fontWeight: '600' }}>{s.amountEur.toFixed(4)}</Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <PieChart size={18} color="#a78bfa" style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{s.songTitle}</Text>
                                    <Text style={{ color: '#64748b', fontSize: 12 }}>{s.partyName} | {s.sharePercent.toFixed(1)}% | {s.amountEur.toFixed(4)} EUR</Text>
                                </View>
                                <StatusBadge status={s.sourceType} />
                            </View>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}
