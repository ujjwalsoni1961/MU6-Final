import React from 'react';
import { View, Text, Platform } from 'react-native';
import { ListMusic } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminPlaylists } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';

export default function AdminPlaylistsScreen() {
    const { data: playlists, loading, error, refresh } = useAdminPlaylists();

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
                                    <ListMusic size={16} color="#38b4ba" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{pl.name}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{pl.ownerName}</Text>
                                <View style={{ flex: 1 }}>
                                    <StatusBadge status={pl.isPublic ? 'active' : 'pending'} />
                                </View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {pl.createdAt ? new Date(pl.createdAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <ListMusic size={18} color="#38b4ba" style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{pl.name}</Text>
                                    <Text style={{ color: '#64748b', fontSize: 12 }}>by {pl.ownerName}</Text>
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
