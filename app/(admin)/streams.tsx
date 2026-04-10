import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Radio } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminStreams } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';

function formatDuration(seconds: number): string {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AdminStreamsScreen() {
    const { data: streams, loading, error, refresh } = useAdminStreams(100);

    return (
        <AdminScreen
            title="Streams"
            subtitle={!loading ? `${streams.length} recent streams` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Song', 'Listener', 'Duration', 'Qualified', 'Date']}
                data={streams}
                emptyMessage="No streams found"
                renderRow={(s) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <Radio size={16} color="#38b4ba" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{s.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{s.listenerName}</Text>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{formatDuration(s.durationSeconds)}</Text>
                                <View style={{ flex: 1 }}>
                                    <StatusBadge status={s.isQualified ? 'active' : 'pending'} />
                                </View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {s.startedAt ? new Date(s.startedAt).toLocaleString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Radio size={18} color="#38b4ba" style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{s.songTitle}</Text>
                                    <Text style={{ color: '#64748b', fontSize: 12 }}>
                                        {s.listenerName} | {formatDuration(s.durationSeconds)}
                                    </Text>
                                </View>
                                <StatusBadge status={s.isQualified ? 'active' : 'pending'} />
                            </View>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}
