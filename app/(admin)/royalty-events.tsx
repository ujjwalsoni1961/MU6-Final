import React from 'react';
import { View, Text, Platform } from 'react-native';
import { DollarSign } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminRoyaltyEvents } from '../../src/hooks/useAdminData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminRoyaltyEventsScreen() {
    const { data: events, loading, error, refresh } = useAdminRoyaltyEvents(100);
    const { colors } = useTheme();

    return (
        <AdminScreen
            title="Royalty Events"
            subtitle={!loading ? `${events.length} events` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Song', 'Source Type', 'Amount (EUR)', 'Period', 'Date']}
                data={events}
                emptyMessage="No royalty events found"
                renderRow={(e) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <DollarSign size={16} color={colors.status.warning} style={{ marginRight: 10 }} />
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{e.songTitle}</Text>
                                </View>
                                <View style={{ flex: 1 }}><StatusBadge status={e.sourceType} /></View>
                                <Text style={{ flex: 1, color: colors.status.success, fontSize: 12, fontWeight: '600' }}>
                                    {e.grossAmountEur.toFixed(4)}
                                </Text>
                                <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 12 }}>{e.accountingPeriod || '—'}</Text>
                                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>
                                    {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <DollarSign size={18} color={colors.status.warning} style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{e.songTitle}</Text>
                                    <Text style={{ color: colors.status.success, fontSize: 12 }}>{e.grossAmountEur.toFixed(4)} EUR</Text>
                                </View>
                                <StatusBadge status={e.sourceType} />
                            </View>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}
