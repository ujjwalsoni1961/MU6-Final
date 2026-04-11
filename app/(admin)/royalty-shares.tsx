import React from 'react';
import { View, Text, Platform } from 'react-native';
import { PieChart } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminRoyaltyShares } from '../../src/hooks/useAdminData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminRoyaltySharesScreen() {
    const { data: shares, loading, error, refresh } = useAdminRoyaltyShares(100);
    const { colors } = useTheme();

    const shareColumns = [
        { label: 'Song', flex: 1.2 },
        { label: 'Recipient', flex: 1 },
        { label: 'Source', flex: 0.8 },
        { label: 'Type', flex: 0.7 },
        { label: 'Share %', flex: 0.7 },
        { label: 'Amount (EUR)', flex: 0.8 },
        { label: 'Date', flex: 0.8 },
    ];

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
                columns={shareColumns}
                data={shares}
                emptyMessage="No royalty shares found"
                minTableWidth={850}
                renderRow={(s) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center' }}>
                                    <PieChart size={16} color="#a78bfa" style={{ marginRight: 10 }} />
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{s.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 12 }} numberOfLines={1}>{s.partyName}</Text>
                                <View style={{ flex: 0.8 }}><StatusBadge status={s.sourceType} /></View>
                                <Text style={{ flex: 0.7, color: colors.text.secondary, fontSize: 12, textTransform: 'capitalize' }}>{s.shareType}</Text>
                                <Text style={{ flex: 0.7, color: colors.accent.cyan, fontSize: 12, fontWeight: '600' }}>{s.sharePercent.toFixed(2)}%</Text>
                                <Text style={{ flex: 0.8, color: colors.status.success, fontSize: 12, fontWeight: '600' }}>{s.amountEur.toFixed(4)}</Text>
                                <Text style={{ flex: 0.8, color: colors.text.muted, fontSize: 12 }}>
                                    {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <PieChart size={18} color="#a78bfa" style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{s.songTitle}</Text>
                                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{s.partyName} | {s.sharePercent.toFixed(1)}% | {s.amountEur.toFixed(4)} EUR</Text>
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
