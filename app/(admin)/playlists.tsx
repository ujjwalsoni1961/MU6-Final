import React from 'react';
import { View, Text, Platform } from 'react-native';
import { ListMusic } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminPlaylists } from '../../src/hooks/useAdminData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminPlaylistsScreen() {
    const { data: playlists, loading, error, refresh } = useAdminPlaylists();
    const { colors } = useTheme();

    return (
        <AdminScreen
            title="Playlists"
            subtitle={!loading ? `${playlists.length} playlists` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Name', 'Owner', 'Visibility', 'Created']}
                data={playlists}
                emptyMessage="No playlists found"
                renderRow={(pl) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <ListMusic size={16} color={colors.accent.cyan} style={{ marginRight: 10 }} />
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }}>{pl.name}</Text>
                                </View>
                                <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 12 }}>{pl.ownerName}</Text>
                                <View style={{ flex: 1 }}>
                                    <StatusBadge status={pl.isPublic ? 'active' : 'pending'} />
                                </View>
                                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>
                                    {pl.createdAt ? new Date(pl.createdAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <ListMusic size={18} color={colors.accent.cyan} style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{pl.name}</Text>
                                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>by {pl.ownerName}</Text>
                                </View>
                                <StatusBadge status={pl.isPublic ? 'active' : 'pending'} />
                            </View>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}
