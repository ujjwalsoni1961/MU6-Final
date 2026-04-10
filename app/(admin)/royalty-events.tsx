import React from 'react';
import { View, Text, Platform } from 'react-native';
import { DollarSign } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminRoyaltyEvents } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';

export default function AdminRoyaltyEventsScreen() {
    const { data: events, loading, error, refresh } = useAdminRoyaltyEvents(100);

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
                                    <DollarSign size={16} color="#facc15" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{e.songTitle}</Text>
                                </View>
                                <View style={{ flex: 1 }}><StatusBadge status={e.sourceType} /></View>
                                <Text style={{ flex: 1, color: '#4ade80', fontSize: 12, fontWeight: '600' }}>
                                    {e.grossAmountEur.toFixed(4)}
                                </Text>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{e.accountingPeriod || '—'}</Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <DollarSign size={18} color="#facc15" style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{e.songTitle}</Text>
                                    <Text style={{ color: '#4ade80', fontSize: 12 }}>{e.grossAmountEur.toFixed(4)} EUR</Text>
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
