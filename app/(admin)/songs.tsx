import React, { useState, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import { Music } from 'lucide-react-native';
import {
    AdminScreen, AdminSearchBar, AdminFilterPills,
    AdminDataTable, AdminPagination, StatusBadge,
} from '../../src/components/admin/AdminScreenWrapper';
import { useAdminSongsFiltered } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';
const PAGE_SIZE = 20;

const genreOptions = [
    { label: 'All Genres', value: '' },
    { label: 'Pop', value: 'Pop' },
    { label: 'Hip-Hop', value: 'Hip-Hop' },
    { label: 'R&B', value: 'R&B' },
    { label: 'Electronic', value: 'Electronic' },
    { label: 'Rock', value: 'Rock' },
    { label: 'Jazz', value: 'Jazz' },
    { label: 'Lo-fi', value: 'Lo-fi' },
    { label: 'Afrobeat', value: 'Afrobeat' },
];

export default function AdminSongsScreen() {
    const [search, setSearch] = useState('');
    const [genreFilter, setGenreFilter] = useState('');
    const [offset, setOffset] = useState(0);

    const { data, loading, error, refresh } = useAdminSongsFiltered({
        search,
        genre: genreFilter,
        limit: PAGE_SIZE,
        offset,
    });

    const handleSearch = useCallback((text: string) => {
        setSearch(text);
        setOffset(0);
    }, []);

    return (
        <AdminScreen
            title="Songs"
            subtitle={!loading ? `${data.total} songs on platform` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminSearchBar
                value={search}
                onChangeText={handleSearch}
                placeholder="Search by title or genre..."
            />

            <AdminFilterPills
                options={genreOptions}
                selected={genreFilter}
                onSelect={(g) => { setGenreFilter(g); setOffset(0); }}
            />

            <AdminDataTable
                headers={['Song', 'Artist', 'Genre', 'Plays', 'Likes', 'Status', 'Date']}
                data={data.songs}
                emptyMessage="No songs found"
                renderRow={(song) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={{
                                        width: 36, height: 36, borderRadius: 8,
                                        backgroundColor: 'rgba(139,92,246,0.1)',
                                        alignItems: 'center', justifyContent: 'center', marginRight: 10,
                                    }}>
                                        <Music size={16} color="#8b5cf6" />
                                    </View>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{song.title}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{song.artistName}</Text>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{song.genre}</Text>
                                <Text style={{ flex: 1, color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>{song.playsCount.toLocaleString()}</Text>
                                <Text style={{ flex: 1, color: '#f87171', fontSize: 12, fontWeight: '600' }}>{song.likesCount.toLocaleString()}</Text>
                                <View style={{ flex: 1 }}>
                                    <StatusBadge status={song.isPublished ? 'active' : 'pending'} />
                                </View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {song.createdAt ? new Date(song.createdAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <View style={{
                                        width: 40, height: 40, borderRadius: 8,
                                        backgroundColor: 'rgba(139,92,246,0.1)',
                                        alignItems: 'center', justifyContent: 'center', marginRight: 10,
                                    }}>
                                        <Music size={18} color="#8b5cf6" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{song.title}</Text>
                                        <Text style={{ color: '#64748b', fontSize: 12 }}>{song.artistName} | {song.genre}</Text>
                                    </View>
                                    <StatusBadge status={song.isPublished ? 'active' : 'pending'} />
                                </View>
                                <View style={{ flexDirection: 'row', gap: 16 }}>
                                    <Text style={{ color: '#38b4ba', fontSize: 12 }}>{song.playsCount} plays</Text>
                                    <Text style={{ color: '#f87171', fontSize: 12 }}>{song.likesCount} likes</Text>
                                </View>
                            </>
                        )}
                    </View>
                )}
            />

            <AdminPagination
                offset={offset}
                limit={PAGE_SIZE}
                total={data.total}
                onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                onNext={() => { if (offset + PAGE_SIZE < data.total) setOffset(offset + PAGE_SIZE); }}
            />
        </AdminScreen>
    );
}
