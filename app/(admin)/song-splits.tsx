import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { AdminScreen, AdminDataTable } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminSongSplits } from '../../src/hooks/useAdminData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminSongSplitsScreen() {
    const { data: splits, loading, error, refresh } = useAdminSongSplits();
    const { colors } = useTheme();

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
                                    <Wallet size={16} color={colors.status.info} style={{ marginRight: 10 }} />
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{s.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 12 }} numberOfLines={1}>{s.partyName}</Text>
                                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }} numberOfLines={1}>{s.partyEmail}</Text>
                                <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 12, textTransform: 'capitalize' }}>{s.role}</Text>
                                <Text style={{ flex: 1, color: colors.accent.cyan, fontSize: 12, fontWeight: '600' }}>{s.sharePercent.toFixed(2)}%</Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Wallet size={18} color={colors.status.info} style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{s.songTitle}</Text>
                                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
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
