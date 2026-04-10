import React, { useState, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import { Music, Trash2, Star, EyeOff, Eye } from 'lucide-react-native';
import {
    AdminScreen, AdminSearchBar, AdminFilterPills,
    AdminDataTable, AdminPagination, StatusBadge,
} from '../../src/components/admin/AdminScreenWrapper';
import {
    ActionButton, ToggleSwitch, ConfirmModal, RowActions,
} from '../../src/components/admin/AdminActionComponents';
import { useAdminSongsFiltered } from '../../src/hooks/useAdminData';
import { useAdminSongActions } from '../../src/hooks/useAdminActions';

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
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const { data, loading, error, refresh } = useAdminSongsFiltered({
        search,
        genre: genreFilter,
        limit: PAGE_SIZE,
        offset,
    });

    const actions = useAdminSongActions(refresh);

    const handleSearch = useCallback((text: string) => {
        setSearch(text);
        setOffset(0);
    }, []);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setActionLoading(true);
        await actions.deleteSong(deleteTarget.id);
        setActionLoading(false);
        setDeleteTarget(null);
    };

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
                headers={['Song', 'Artist', 'Genre', 'Plays', 'Status', 'Actions']}
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
                                        backgroundColor: song.isFeatured ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.1)',
                                        alignItems: 'center', justifyContent: 'center', marginRight: 10,
                                    }}>
                                        {song.isFeatured ? <Star size={16} color="#a78bfa" /> : <Music size={16} color="#8b5cf6" />}
                                    </View>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{song.title}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{song.artistName}</Text>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{song.genre}</Text>
                                <Text style={{ flex: 1, color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>{song.playsCount.toLocaleString()}</Text>
                                <View style={{ flex: 1, flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                                    <StatusBadge status={song.isPublished ? 'active' : 'pending'} />
                                    {!song.isListed && <StatusBadge status="delisted" />}
                                    {song.isFeatured && <StatusBadge status="featured" />}
                                </View>
                                <View style={{ flex: 1.5 }}>
                                    <RowActions>
                                        <ToggleSwitch
                                            value={song.isListed}
                                            onToggle={() => actions.toggleListed(song.id, song.isListed)}
                                            label="Listed"
                                            activeColor="#4ade80"
                                        />
                                        <ActionButton
                                            icon={<Star size={12} color={song.isFeatured ? '#facc15' : '#64748b'} />}
                                            label={song.isFeatured ? 'Unfeature' : 'Feature'}
                                            color={song.isFeatured ? '#facc15' : '#64748b'}
                                            onPress={() => actions.toggleFeatured(song.id, song.isFeatured)}
                                        />
                                        <ActionButton
                                            icon={<Trash2 size={12} color="#f87171" />}
                                            color="#f87171"
                                            onPress={() => setDeleteTarget({ id: song.id, title: song.title })}
                                        />
                                    </RowActions>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <View style={{
                                        width: 40, height: 40, borderRadius: 8,
                                        backgroundColor: 'rgba(139,92,246,0.1)',
                                        alignItems: 'center', justifyContent: 'center', marginRight: 10,
                                    }}>
                                        {song.isFeatured ? <Star size={18} color="#a78bfa" /> : <Music size={18} color="#8b5cf6" />}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{song.title}</Text>
                                        <Text style={{ color: '#64748b', fontSize: 12 }}>{song.artistName} | {song.genre}</Text>
                                    </View>
                                    <StatusBadge status={song.isPublished ? 'active' : 'pending'} />
                                </View>
                                <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                                    {!song.isListed && <StatusBadge status="delisted" />}
                                    {song.isFeatured && <StatusBadge status="featured" />}
                                    <Text style={{ color: '#38b4ba', fontSize: 12 }}>{song.playsCount} plays</Text>
                                </View>
                                <RowActions>
                                    <ToggleSwitch
                                        value={song.isListed}
                                        onToggle={() => actions.toggleListed(song.id, song.isListed)}
                                        label="Listed"
                                    />
                                    <ActionButton
                                        icon={<Star size={12} color={song.isFeatured ? '#facc15' : '#64748b'} />}
                                        label={song.isFeatured ? 'Unfeature' : 'Feature'}
                                        color={song.isFeatured ? '#facc15' : '#64748b'}
                                        onPress={() => actions.toggleFeatured(song.id, song.isFeatured)}
                                    />
                                    <ActionButton
                                        icon={<Trash2 size={12} color="#f87171" />}
                                        color="#f87171"
                                        onPress={() => setDeleteTarget({ id: song.id, title: song.title })}
                                    />
                                </RowActions>
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

            <ConfirmModal
                visible={!!deleteTarget}
                title="Delete Song"
                message={`Are you sure you want to permanently delete "${deleteTarget?.title}"? This will also remove associated NFT releases and royalty data. This action cannot be undone.`}
                confirmLabel="Delete"
                confirmColor="#ef4444"
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
                loading={actionLoading}
            />
        </AdminScreen>
    );
}
