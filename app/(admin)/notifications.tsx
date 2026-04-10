import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Bell } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminNotifications } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';

export default function AdminNotificationsScreen() {
    const { data: notifications, loading, error, refresh } = useAdminNotifications(100);

    return (
        <AdminScreen
            title="Notifications"
            subtitle={!loading ? `${notifications.length} notifications` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Recipient', 'Type', 'Title', 'Body', 'Read', 'Date']}
                data={notifications}
                emptyMessage="No notifications found"
                renderRow={(n) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <Bell size={16} color={n.isRead ? '#475569' : '#facc15'} style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{n.profileName}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12, textTransform: 'capitalize' }}>{n.type || '—'}</Text>
                                <Text style={{ flex: 1, color: '#f1f5f9', fontSize: 12 }}>{n.title || '—'}</Text>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }} numberOfLines={2}>{n.body || '—'}</Text>
                                <View style={{ flex: 1 }}>
                                    <StatusBadge status={n.isRead ? 'completed' : 'pending'} />
                                </View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {n.createdAt ? new Date(n.createdAt).toLocaleString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Bell size={18} color={n.isRead ? '#475569' : '#facc15'} style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{n.title || n.type || 'Notification'}</Text>
                                    <Text style={{ color: '#64748b', fontSize: 12 }}>{n.profileName} | {n.body || '—'}</Text>
                                </View>
                                <StatusBadge status={n.isRead ? 'completed' : 'pending'} />
                            </View>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}
