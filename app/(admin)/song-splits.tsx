import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { AdminScreen, AdminDataTable } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminSongSplits } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';

export default function AdminSongSplitsScreen() {
    const { data: splits, loading, error, refresh } = useAdminSongSplits();

    return (
        <AdminScreen
            title="Song Rights Splits"
            subtitle={!loading ? `${splits.length} split entries` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Song', 'Party', 'Email', 'Role', 'Share %']}
                data={splits}
                emptyMessage="No song splits found"
                renderRow={(s) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <Wallet size={16} color="#60a5fa" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{s.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{s.partyName}</Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>{s.partyEmail}</Text>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12, textTransform: 'capitalize' }}>{s.role}</Text>
                                <Text style={{ flex: 1, color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>{s.sharePercent.toFixed(2)}%</Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Wallet size={18} color="#60a5fa" style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{s.songTitle}</Text>
                                    <Text style={{ color: '#64748b', fontSize: 12 }}>
                                        {s.partyName} ({s.role}) — {s.sharePercent.toFixed(1)}%
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}
